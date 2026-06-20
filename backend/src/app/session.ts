import {
  CompetitionManager, LeagueFormat, KnockoutFormat, Season,
  ClubManager, TransferManager, PlayerGenerator, EventBus,
  DEFAULT_STADIUM_SECTORS, calculateTotalCapacity, calculateOverall, v4 as uuidv4,
  isBefore, addMinutes, addDays,
  defaultIntent, aiIntent, resolveMatchParameters, NEUTRAL_PARAMS, buildMatchInsight,
  makeYouth, generatorYouthFactory, acceptBid, directTransferPrice, playerValue, transferWindow, runAiMarket,
  churnSquad, churnFreeAgents, MAX_SQUAD_SIZE, selectStartingXIWithSlots, carryOverLineup,
} from '@fm2k/engine';
import type {
  LeagueState, CompetitionState, CompetitionFixture, LiveMatch, ClubState, TransferListing, TransferState,
  Position, GameEvents, StadiumSectorConfig, Player, Formation, Team, TeamColors, GameDateTime, OccurrenceEvent,
  TeamTacticsIntent, MatchInsight, RegimentId, YouthFactory, LineupRole, TransferWindow, OverflowSpec,
} from '@fm2k/engine';
import {
  buildEditableCountries, mapTeam, findTeamById, findDivisionForTeam, findCountryForTeam,
} from '../domain/editable-country.ts';
import type { EditableCountry, EditableDivision } from '../domain/editable-country.ts';
import { applyPromotionRelegation } from '../domain/promotion.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import {
  writeSave, SAVE_VERSION, type SaveData, type SaveType,
} from '../data/save-data.ts';
import {
  BUDGET_START, STADIUM_START, SEASON_START, EVENTS_PER_MINUTE, MARKET_SIZE,
  MARKET_REFRESH_INTERVAL, ALL_POSITIONS, LEAGUE_MATCHDAYS, CUP_ROUND_NAMES, cupCompetitionId,
} from './config.ts';

/** Significant match events the UI animates (goals, cards, saves, phase changes). */
const KEY_EVENT_TYPES = new Set(['goal', 'yellow_card', 'red_card', 'save', 'half_time', 'full_time']);

/** Minutes added to a kickoff to be sure a match (incl. extra time) has finished. */
const MATCH_MAX_MINUTES = 130;

/** Free agents seeded per included nation at the start of a new game (scales the pool with size). */
const INITIAL_FREE_AGENTS_PER_NATION = 40;

/** One animated event from the real match simulation. */
export interface AnimEvent {
  minute: number;
  team: 'home' | 'away';
  description: string;
  type: string;
  homeScore: number;
  awayScore: number;
}

/** Result of advancing the player's match to the next stop (intermission / completion). */
export interface AdvanceResult {
  fixtureId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  /** Match phase reached (half_time | full_time | extra_time_half | …) or 'idle'. */
  phase: string;
  atIntermission: boolean;
  matchOver: boolean;
  events: AnimEvent[];
}

/** The read-model the frontend caches: lifecycle flags + engine state snapshots. */
/** A one-off message surfaced to the player (rendered as a toast by the web app). */
export interface GameNotification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface GameSnapshot {
  playerTeamId: string | null;
  selectedLeagueIds: string[];
  editableCountries: EditableCountry[];
  currentMatchday: number;
  seasonComplete: boolean;
  now: GameDateTime;
  lastMatchResult: LastMatchResult | null;
  leagueState: LeagueState | null;
  leagueStates: Record<string, LeagueState>;
  cupStates: Record<string, CompetitionState>;
  liveMatches: LiveMatch[];
  focusFixture: CompetitionFixture | null;
  focusLive: LiveMatch | null;
  clubState: ClubState | null;
  transferListings: TransferListing[];
  /** The free-agent pool (browsable as part of the whole playerbase). */
  freeAgents: Player[];
  /** Single post-match insight for the player's team (null until the detector logic ships). */
  lastMatchInsight: MatchInsight | null;
  /** Append-only one-off messages (retirements, transfer windows) the web turns into toasts. */
  notifications: GameNotification[];
}

/**
 * Owns the engine managers + EventBus for a single game and exposes lifecycle
 * operations. Reads are served via `snapshot()`. The frontend never touches the
 * managers directly.
 */
export class GameSession {
  private readonly rng: () => number;
  private readonly playerGenerator: PlayerGenerator;
  private readonly youthFactory: YouthFactory;
  private seasons: Record<string, Season> = {};
  private leagueManagers: Record<string, CompetitionManager> = {};
  private cupManagers: Record<string, CompetitionManager> = {};
  private leagueManager: CompetitionManager | null = null;
  private playerCupManager: CompetitionManager | null = null;
  private clubManager: ClubManager | null = null;
  private transferManager: TransferManager | null = null;
  private eventBus: EventBus<GameEvents> | null = null;
  private eventBusCleanup: (() => void) | null = null;

  private playerTeamId: string | null = null;
  private selectedLeagueIds: string[] = [];
  private currentMatchday = 0;
  private seasonComplete = false;
  private now: GameDateTime = SEASON_START;
  private focusFixtureId: string | null = null;
  private lastMatchResult: LastMatchResult | null = null;
  private lastMatchInsight: MatchInsight | null = null;
  private notifications: GameNotification[] = [];
  private nextNotificationId = 1;
  /** Per-team squad sizes AI clubs refill toward during windows (captured pre-churn). */
  private squadTargets = new Map<string, number>();
  /** The player's live Team object inside the divisions (same reference the sim uses). */
  private playerTeam: Team | null = null;
  private editableCountries: EditableCountry[] = buildEditableCountries();
  private readonly listeners = new Set<() => void>();

  /** `rng` is injectable so generated players (position + attributes) are deterministic in tests. */
  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.playerGenerator = new PlayerGenerator('female', 'all', rng);
    this.youthFactory = generatorYouthFactory(rng);
  }

  /** AI clubs have no facility levels; approximate them from division tier (top tier = best). */
  private facilityForLevel(divisionLevel: number): number {
    return Math.max(1, Math.min(4, 5 - divisionLevel));
  }

  /** The transfer-window state for the current matchday. */
  getTransferWindow(): TransferWindow {
    return transferWindow(this.currentMatchday, LEAGUE_MATCHDAYS);
  }

  // ── change notifications ────────────────────────────────────────────────────

  /** Subscribe to any state change (the frontend re-snapshots on notify). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  /** Queue a one-off user message (kept bounded) and fan out a change so the UI picks it up. */
  private pushNotification(message: string, type: GameNotification['type'] = 'info'): void {
    this.notifications = [...this.notifications, { id: this.nextNotificationId++, message, type }].slice(-50);
    this.notify();
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  snapshot(): GameSnapshot {
    const leagueStates: Record<string, LeagueState> = {};
    for (const [id, mgr] of Object.entries(this.leagueManagers)) {
      leagueStates[id] = mgr.getState();
    }
    const cupStates: Record<string, CompetitionState> = {};
    for (const [id, mgr] of Object.entries(this.cupManagers)) {
      cupStates[id] = mgr.getState();
    }
    const liveMatches = this.liveMatches();
    const focusFixture = this.getFocusFixture();
    const focusLive = focusFixture
      ? liveMatches.find(l => l.fixtureId === focusFixture.id) ?? null
      : null;
    return {
      playerTeamId: this.playerTeamId,
      selectedLeagueIds: this.selectedLeagueIds,
      editableCountries: this.editableCountries,
      currentMatchday: this.currentMatchday,
      seasonComplete: this.seasonComplete,
      now: this.now,
      lastMatchResult: this.lastMatchResult,
      leagueState: this.leagueManager?.getState() ?? null,
      leagueStates,
      cupStates,
      liveMatches,
      focusFixture,
      focusLive,
      clubState: this.clubManager?.getState() ?? null,
      transferListings: this.transferManager?.getActiveListings(this.currentMatchday) ?? [],
      freeAgents: this.transferManager?.getFreeAgents() ?? [],
      lastMatchInsight: this.lastMatchInsight,
      notifications: this.notifications,
    };
  }

  // ── manager construction ────────────────────────────────────────────────────

  /**
   * Resolve and stamp tactical parameters onto every team's live object. The
   * player uses `playerIntent`; AI teams get a formation-derived style. Mutates
   * the team references in place so the competition managers (and thus the
   * simulator) pick them up when they schedule the season.
   */
  private stampTeamTactics(
    countries: EditableCountry[],
    playerTeamId: string,
    playerIntent: TeamTacticsIntent,
  ): void {
    for (const c of countries) {
      for (const d of c.divisions) {
        for (const t of d.teams) {
          const teamIntent = t.id === playerTeamId ? playerIntent : aiIntent(t.formation);
          t.tacticsIntent = teamIntent;
          // A rough season-start approximation — ClubManager doesn't exist yet at this point
          // for the player's own team. syncPlayerTeam() resolves the real per-match XI later.
          t.tacticsParams = resolveMatchParameters(teamIntent, selectStartingXIWithSlots(t.squad, t.formation).starters);
        }
      }
    }
  }

  /** Always include the player's own nation, even if the caller's `leagueIds` omitted it. */
  private resolveLeagueIds(editableCountries: EditableCountry[], teamId: string, leagueIds: string[]): string[] {
    const playerCountryId = findCountryForTeam(editableCountries, teamId)?.id;
    return playerCountryId && !leagueIds.includes(playerCountryId)
      ? [...leagueIds, playerCountryId]
      : leagueIds;
  }

  /** Fresh EventBus + the session-level listeners that drive notifications/lastMatchResult/
   *  lastMatchInsight. Used whenever the competition layer is rebuilt (new game or season
   *  rollover) since the old bus's subscriptions are tied to the CompetitionManagers being
   *  discarded. */
  private rewireEventBus(editableCountries: EditableCountry[]): EventBus<GameEvents> {
    this.eventBusCleanup?.();
    const eventBus = new EventBus<GameEvents>();
    this.eventBus = eventBus;
    const unsubs: Array<() => void> = [];

    // A player from the manager's own club hanging up their boots is worth a message.
    unsubs.push(eventBus.on('player.retired', (p) => {
      if (p.ownClub) { this.pushNotification(`${p.playerName} (${p.age}) has retired.`, 'info'); }
    }));
    // Transfer windows opening/closing notify the manager.
    unsubs.push(eventBus.on('transfer.window', (w) => {
      const label = w.kind === 'pre_season' ? 'pre-season' : 'mid-season';
      this.pushNotification(
        w.open ? `The ${label} transfer window is now open.` : `The ${label} transfer window has closed.`,
        'info',
      );
    }));

    unsubs.push(eventBus.on('match.completed', (payload) => {
      const isHome = payload.homeTeamId === this.playerTeamId;
      const isAway = payload.awayTeamId === this.playerTeamId;
      if (!isHome && !isAway) { return; }
      this.lastMatchResult = {
        homeTeamId: payload.homeTeamId, awayTeamId: payload.awayTeamId,
        homeScore: payload.homeScore, awayScore: payload.awayScore, isHome,
        competitionId: payload.competitionId,
        roundLabel: payload.roundLabel,
        decidedBy: payload.decidedBy,
        shootout: payload.shootout,
        winnerTeamId: payload.winnerTeamId,
      };

      // Feedback hook (logic deferred — buildMatchInsight currently returns null).
      // Wired now so the insight feature drops in with no plumbing changes.
      const homeParams = findTeamById(editableCountries, payload.homeTeamId)?.tacticsParams ?? NEUTRAL_PARAMS;
      const awayParams = findTeamById(editableCountries, payload.awayTeamId)?.tacticsParams ?? NEUTRAL_PARAMS;
      this.lastMatchInsight = buildMatchInsight({
        playerSide: isHome ? 'home' : 'away',
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        params: { home: homeParams, away: awayParams },
        playerXi: this.clubManager?.getActiveLineup() ?? [],
      });
    }));

    this.eventBusCleanup = () => { for (const u of unsubs) { u(); } };
    return eventBus;
  }

  /** Build a per-nation Season: its league divisions plus its national cup. The EventBus is
   *  wired only to the player's own division and the player's cup so their results drive
   *  lastMatchResult, gate receipts, and injuries. Sets `this.seasons`/`leagueManagers`/
   *  `cupManagers`/`leagueManager`/`playerCupManager`. Identical for a new game and a season
   *  rollover — only the inputs (post-promotion/relegation membership) differ. */
  private buildCompetitions(
    editableCountries: EditableCountry[],
    allLeagueIds: string[],
    teamId: string,
    division: EditableDivision,
    eventBus: EventBus<GameEvents>,
  ): void {
    const playerCountry = findCountryForTeam(editableCountries, teamId);
    const seasons: Record<string, Season> = {};
    const leagueManagers: Record<string, CompetitionManager> = {};
    const cupManagers: Record<string, CompetitionManager> = {};

    for (const countryId of allLeagueIds) {
      const country = editableCountries.find(c => c.id === countryId);
      if (!country) { continue; }
      const isPlayerNation = country.id === playerCountry?.id;
      const competitions: CompetitionManager[] = [];

      for (const div of country.divisions) {
        const isPlayerDivision = div.id === division.id;
        const lm = new CompetitionManager({
          format: new LeagueFormat(),
          teams: div.teams,
          startDate: SEASON_START,
          seasonStart: SEASON_START,
          competitionId: div.id,
          name: div.name,
          eventsPerMinute: EVENTS_PER_MINUTE,
          eventBus: isPlayerDivision ? eventBus : undefined,
          playerTeamId: isPlayerDivision ? teamId : undefined,
          getPlayerStarters: isPlayerDivision ? () => this.resolvePlayerStarters() : undefined,
        });
        leagueManagers[div.id] = lm;
        competitions.push(lm);
      }

      const allTeams = country.divisions.flatMap(d => d.teams);
      const levelByTeamId = new Map<string, number>();
      for (const div of country.divisions) {
        for (const t of div.teams) { levelByTeamId.set(t.id, div.level); }
      }
      const cupId = cupCompetitionId(country.id);
      const cup = new CompetitionManager({
        format: new KnockoutFormat({
          kind: 'knockout', byeLevel: 1, preliminaryLevels: [2, 3],
          roundNames: CUP_ROUND_NAMES, byeTeamPlaysAway: true, higherSlotHostsFromRound: 3,
          leagueMatchdays: LEAGUE_MATCHDAYS,
        }),
        teams: allTeams,
        levelByTeamId,
        startDate: SEASON_START,
        seasonStart: SEASON_START,
        competitionId: cupId,
        name: `${country.name} Cup`,
        eventsPerMinute: EVENTS_PER_MINUTE,
        eventBus: isPlayerNation ? eventBus : undefined,
        playerTeamId: isPlayerNation ? teamId : undefined,
        getPlayerStarters: isPlayerNation ? () => this.resolvePlayerStarters() : undefined,
      });
      cupManagers[cupId] = cup;
      competitions.push(cup);

      seasons[country.id] = new Season({ nationId: country.id, startDate: SEASON_START, competitions });
    }

    this.seasons = seasons;
    this.leagueManagers = leagueManagers;
    this.cupManagers = cupManagers;
    this.leagueManager = leagueManagers[division.id];
    this.playerCupManager = playerCountry ? cupManagers[cupCompetitionId(playerCountry.id)] : null;
  }

  /** Seed AI refill targets from current squad sizes (clamped to the cap). */
  private seedSquadTargets(editableCountries: EditableCountry[]): void {
    this.squadTargets.clear();
    for (const country of editableCountries) {
      for (const div of country.divisions) {
        for (const t of div.teams) {
          this.squadTargets.set(t.id, Math.min(MAX_SQUAD_SIZE, t.squad.length));
        }
      }
    }
  }

  /** Build every manager for a brand-new game: fresh ClubManager (starting budget, default
   *  stadium, auto-picked XI) and fresh TransferManager (a small randomly-seeded free-agent
   *  pool). Also used by `loadGame()`, which immediately overwrites the result wholesale via
   *  `loadState()`. Season rollovers use `startNewSeason()`'s own independent body instead —
   *  see its doc comment for why this fresh-defaults construction is wrong for that case. */
  private buildManagers(
    editableCountries: EditableCountry[],
    teamId: string,
    leagueIds: string[],
    playerIntent?: TeamTacticsIntent,
  ): boolean {
    const team = findTeamById(editableCountries, teamId);
    const division = findDivisionForTeam(editableCountries, teamId);
    if (!team || !division) { return false; }

    // Resolve tactical parameters onto every team's live object BEFORE the
    // competition managers (which capture these references when scheduling the
    // season). The player uses their chosen intent; AI teams get a style derived
    // from their formation so opponents vary.
    const intent = playerIntent ?? defaultIntent(team.formation);
    this.stampTeamTactics(editableCountries, teamId, intent);
    this.playerTeam = team;

    const allLeagueIds = this.resolveLeagueIds(editableCountries, teamId, leagueIds);
    const eventBus = this.rewireEventBus(editableCountries);
    this.buildCompetitions(editableCountries, allLeagueIds, teamId, division, eventBus);

    const playerCountry = findCountryForTeam(editableCountries, teamId);
    // The player's initial pick: their own deliberate choice takes over from here via
    // ClubState (setStartingXI/setBench) — Team itself never tracks a starters split again.
    const initialXI = selectStartingXIWithSlots(team.squad, team.formation);
    const defaultSectors = DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>;
    this.clubManager = new ClubManager({
      clubId: team.id,
      clubName: team.name,
      divisionId: division.id,
      squad: team.squad,
      budget: BUDGET_START,
      formation: team.formation,
      tactics: intent,
      startingXI: initialXI.starters.map(p => p.id),
      benchPlayers: initialXI.substitutes.map(p => p.id),
      stadiumCapacity: calculateTotalCapacity(defaultSectors) || STADIUM_START,
      stadiumSectors: defaultSectors,
      eventBus,
      nationality: playerCountry?.nationality ?? 'unknown',
      youthFactory: this.youthFactory,
    });

    // Seed a starting free-agent pool so a new game's market isn't empty: a batch per included
    // nation (so the pool scales with how many leagues are in play), each with that nation's
    // nationality. (On load this is immediately replaced by the saved pool via loadState.)
    const seededFreeAgents: Player[] = [];
    for (const country of editableCountries.filter(c => allLeagueIds.includes(c.id))) {
      for (let i = 0; i < INITIAL_FREE_AGENTS_PER_NATION; i++) {
        const pos = ALL_POSITIONS[Math.floor(this.rng() * ALL_POSITIONS.length)] as Position;
        const overall = 42 + Math.floor(this.rng() * 28); // 42–69: released players + the odd gem
        seededFreeAgents.push(this.makePlayer(pos, overall, country.nationality));
      }
    }
    this.transferManager = new TransferManager({
      marketSize: MARKET_SIZE,
      playerFactory: () => {
        const pos = ALL_POSITIONS[Math.floor(this.rng() * ALL_POSITIONS.length)] as Position;
        return this.playerGenerator.generatePlayer(pos, { overall: 65 });
      },
      initialFreeAgents: seededFreeAgents,
    });

    this.seedSquadTargets(editableCountries);
    return true;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  startGame(teamId: string, leagueIds: string[], playerIntent?: TeamTacticsIntent): boolean {
    if (!this.buildManagers(this.editableCountries, teamId, leagueIds, playerIntent)) { return false; }
    this.playerTeamId = teamId;
    this.selectedLeagueIds = leagueIds;
    this.currentMatchday = 0;
    this.seasonComplete = false;
    this.now = SEASON_START;
    this.focusFixtureId = null;
    this.lastMatchResult = null;
    this.lastMatchInsight = null;
    return true;
  }

  /**
   * Roll over to the next season: apply promotion/relegation from the just-finished standings,
   * rebuild the competition layer (fixtures/standings genuinely reset every season), and
   * construct the new ClubManager/TransferManager directly from the outgoing club's actual
   * state — budget, facilities, financial history, development history, and the already-churned
   * free-agent pool — rather than `startGame()`'s brand-new-game defaults. This is deliberately
   * independent of `startGame()`: promotion/relegation only ever happens here, and the transfer
   * pool is sourced from the previous season's churn, never a fresh random seed.
   */
  startNewSeason(): boolean {
    if (!this.playerTeamId || !this.clubManager || !this.transferManager) { return false; }
    const ranked: Record<string, string[]> = {};
    for (const [divId, lm] of Object.entries(this.leagueManagers)) {
      ranked[divId] = lm.getState().standings.map(s => s.teamId);
    }
    this.editableCountries = applyPromotionRelegation(this.editableCountries, ranked);

    const teamId = this.playerTeamId;
    const team = findTeamById(this.editableCountries, teamId);
    const division = findDivisionForTeam(this.editableCountries, teamId);
    if (!team || !division) { return false; }

    const prevClub = this.clubManager.getState();
    const prevTransfer = this.transferManager.getState();

    const intent = prevClub.tactics;
    this.stampTeamTactics(this.editableCountries, teamId, intent);
    this.playerTeam = team;

    const allLeagueIds = this.resolveLeagueIds(this.editableCountries, teamId, this.selectedLeagueIds);
    const eventBus = this.rewireEventBus(this.editableCountries);
    this.buildCompetitions(this.editableCountries, allLeagueIds, teamId, division, eventBus);

    const playerCountry = findCountryForTeam(this.editableCountries, teamId);
    const { startingXI, benchPlayers } = carryOverLineup(
      prevClub.startingXI, prevClub.benchPlayers, team.squad, team.formation,
    );
    this.clubManager = new ClubManager({
      clubId: team.id,
      clubName: team.name,
      divisionId: division.id,
      squad: team.squad,
      budget: prevClub.budget,
      formation: team.formation,
      tactics: intent,
      startingXI,
      benchPlayers,
      stadiumCapacity: prevClub.stadiumCapacity,
      stadiumSectors: prevClub.stadiumSectors,
      eventBus,
      nationality: playerCountry?.nationality ?? 'unknown',
      youthFactory: this.youthFactory,
      facilities: prevClub.facilities,
      financialLog: prevClub.financialLog,
      recentDevelopment: prevClub.recentDevelopment,
    });

    this.transferManager = new TransferManager({
      marketSize: MARKET_SIZE,
      playerFactory: () => {
        const pos = ALL_POSITIONS[Math.floor(this.rng() * ALL_POSITIONS.length)] as Position;
        return this.playerGenerator.generatePlayer(pos, { overall: 65 });
      },
      initialFreeAgents: prevTransfer.freeAgents,
    });

    this.seedSquadTargets(this.editableCountries);

    this.currentMatchday = 0;
    this.seasonComplete = false;
    this.now = SEASON_START;
    this.focusFixtureId = null;
    this.lastMatchResult = null;
    this.lastMatchInsight = null;
    return true;
  }

  buildSaveData(type: SaveType, activeTab = 'squad'): SaveData | null {
    const snap = this.snapshot();
    if (!this.playerTeamId || !snap.leagueState || !snap.clubState) { return null; }
    const keep = new Set(this.selectedLeagueIds);
    const playerCountry = findCountryForTeam(this.editableCountries, this.playerTeamId);
    if (playerCountry) { keep.add(playerCountry.id); }
    return {
      version: SAVE_VERSION,
      type,
      savedAt: new Date().toISOString(),
      teamName: snap.clubState.clubName,
      matchday: this.currentMatchday,
      playerTeamId: this.playerTeamId,
      selectedLeagueIds: this.selectedLeagueIds,
      editableCountries: this.editableCountries.filter(c => keep.has(c.id)),
      currentMatchday: this.currentMatchday,
      seasonComplete: this.seasonComplete,
      now: this.now,
      activeTab,
      lastMatchResult: this.lastMatchResult,
      leagueState: snap.leagueState,
      leagueStates: snap.leagueStates,
      cupStates: snap.cupStates,
      clubState: snap.clubState,
      transferListings: snap.transferListings,
      transferFreeAgents: this.transferManager?.getFreeAgents() ?? [],
    };
  }

  async saveGame(type: SaveType, activeTab = 'squad'): Promise<void> {
    // Snap to a clean boundary: finish any in-progress round before serialising,
    // since live mid-match state isn't persisted (v1).
    await this.finishLiveRound();
    const data = this.buildSaveData(type, activeTab);
    if (data) { await writeSave(data); }
  }

  loadGame(save: SaveData): boolean {
    // Merge the saved (partial) countries with fresh defaults so all are available.
    const savedCountryMap = new Map(save.editableCountries.map(c => [c.id, c]));
    const mergedCountries = buildEditableCountries().map(c => savedCountryMap.get(c.id) ?? c);
    const leagueIds = save.selectedLeagueIds
      ?? [findCountryForTeam(mergedCountries, save.playerTeamId)?.id].filter(Boolean) as string[];

    const savedTactics = save.clubState.tactics ?? defaultIntent(save.clubState.formation);
    if (!this.buildManagers(mergedCountries, save.playerTeamId, leagueIds, savedTactics)) { return false; }

    this.leagueManager!.loadState(save.leagueState);
    if (save.leagueStates) {
      const playerDivId = findDivisionForTeam(mergedCountries, save.playerTeamId)?.id;
      for (const [id, state] of Object.entries(save.leagueStates)) {
        if (id !== playerDivId && this.leagueManagers[id]) {
          this.leagueManagers[id].loadState(state);
        }
      }
    }
    if (save.cupStates) {
      for (const [id, state] of Object.entries(save.cupStates)) {
        this.cupManagers[id]?.loadState(state);
      }
    }
    const savedClubState = save.clubState;
    if (!savedClubState.stadiumSectors) {
      savedClubState.stadiumSectors = DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>;
    }
    if (!savedClubState.tactics) {
      savedClubState.tactics = defaultIntent(savedClubState.formation);
    }
    savedClubState.recentDevelopment ??= [];
    savedClubState.seasonStartSnapshot ??= {};
    this.clubManager!.loadState(savedClubState);
    const transferState: TransferState = {
      listings: save.transferListings,
      refreshedOnMatchday: save.currentMatchday,
      freeAgents: save.transferFreeAgents ?? [],
    };
    this.transferManager!.loadState(transferState);

    this.editableCountries = mergedCountries;
    this.playerTeamId = save.playerTeamId;
    this.selectedLeagueIds = leagueIds;
    this.currentMatchday = save.currentMatchday;
    this.seasonComplete = save.seasonComplete;
    // Saves snap to a round boundary, so `now` rests with no matches live; the engines
    // (rebuilt at SEASON_START with only future fixtures scheduled) lazily catch up to
    // `now` on the next advance. Legacy saves approximate it from the matchday.
    this.now = save.now ?? addDays(SEASON_START, save.currentMatchday * 7);
    this.focusFixtureId = null;
    this.lastMatchResult = save.lastMatchResult;
    this.lastMatchInsight = null;
    return true;
  }

  // ── the game clock ──────────────────────────────────────────────────────────

  getNow(): GameDateTime { return this.now; }

  private allManagers(): CompetitionManager[] {
    return [...Object.values(this.leagueManagers), ...Object.values(this.cupManagers)];
  }

  /** Every in-progress match across all nations/competitions. */
  liveMatches(): LiveMatch[] {
    return Object.values(this.seasons).flatMap(s => s.liveMatches());
  }

  private playerLiveMatch(): LiveMatch | null {
    return this.liveMatches().find(
      l => l.homeTeamId === this.playerTeamId || l.awayTeamId === this.playerTeamId,
    ) ?? null;
  }

  /** The player's earliest still-scheduled fixture across their league and cup. */
  private playerNextFixture(): CompetitionFixture | null {
    if (!this.playerTeamId) { return null; }
    const managers = [this.leagueManager, this.playerCupManager].filter(Boolean) as CompetitionManager[];
    let next: CompetitionFixture | null = null;
    for (const mgr of managers) {
      for (const f of mgr.getState().fixtures) {
        if (f.status !== 'scheduled') { continue; }
        if (f.homeTeamId !== this.playerTeamId && f.awayTeamId !== this.playerTeamId) { continue; }
        if (next === null || isBefore(f.scheduledTime, next.scheduledTime)) { next = f; }
      }
    }
    return next;
  }

  private findFixture(fixtureId: string): CompetitionFixture | null {
    for (const mgr of this.allManagers()) {
      const f = mgr.getState().fixtures.find(fx => fx.id === fixtureId);
      if (f) { return f; }
    }
    return null;
  }

  /** The player's match currently in focus on the Match tab (live / just-finished / next). */
  getFocusFixture(): CompetitionFixture | null {
    if (this.focusFixtureId) {
      const f = this.findFixture(this.focusFixtureId);
      if (f) { return f; }
    }
    return this.playerNextFixture();
  }

  /** Earliest not-yet-started kickoff across all competitions. */
  private nextKickoff(): GameDateTime | null {
    let min: GameDateTime | null = null;
    for (const s of Object.values(this.seasons)) {
      const t = s.peekNextKickoff();
      if (t && (min === null || isBefore(t, min))) { min = t; }
    }
    return min;
  }

  /** Advance the global clock to `target`, ticking every competition. Returns the
   *  match events fired across the advance (the caller filters them). */
  private async advanceClockTo(target: GameDateTime): Promise<OccurrenceEvent[]> {
    if (!isBefore(this.now, target)) { return []; }
    const perSeason = await Promise.all(Object.values(this.seasons).map(s => s.tickTo(target)));
    this.now = target;
    this.applyClockSideEffects();
    return perSeason.flat() as OccurrenceEvent[];
  }

  /** Like advanceClockTo but discards event arrays (simulateToEnd path). */
  private async drainClockTo(target: GameDateTime): Promise<void> {
    if (!isBefore(this.now, target)) { return; }
    await Promise.all(Object.values(this.seasons).map(s => s.drainTo(target)));
    this.now = target;
    this.applyClockSideEffects();
  }

  private applyClockSideEffects(): void {
    const newMatchday = this.leagueManager?.completedRounds() ?? this.currentMatchday;
    if (newMatchday > this.currentMatchday) {
      this.clubManager?.handleMatchdayComplete();
      if (newMatchday % MARKET_REFRESH_INTERVAL === 0) {
        this.transferManager?.refreshMarket(newMatchday);
      }
      const prevWindow = transferWindow(this.currentMatchday, LEAGUE_MATCHDAYS);
      this.currentMatchday = newMatchday;
      const nextWindow = transferWindow(newMatchday, LEAGUE_MATCHDAYS);
      if (nextWindow.open !== prevWindow.open) {
        this.eventBus?.emit('transfer.window', {
          open: nextWindow.open,
          kind: (nextWindow.kind ?? prevWindow.kind) ?? 'mid_season',
          timestamp: this.now,
        });
        if (nextWindow.open) { this.runAiMarketWindow(); } // AI clubs shop when a window opens
      }
    }
    if (!Object.values(this.seasons).some(s => s.hasNext())) {
      this.completeSeason();
    } else {
      this.seasonComplete = false;
    }
  }

  /**
   * Mark the season complete, running the whole world's end-of-season churn exactly once: the
   * player's club develops/ages/retires (with academy youth), the player's squad is written back into
   * `editableCountries`, every AI squad churns the same way, and the free-agent pool ages + takes a
   * fresh youth injection.
   */
  private completeSeason(): void {
    if (this.seasonComplete) { return; }
    this.seasonComplete = true;
    const playerOverflow = this.clubManager?.handleSeasonComplete() ?? [];
    this.reconcilePlayerSquad();
    this.churnWorld(playerOverflow);
  }

  /** Write the player's (developed/churned) squad back into its Team so a rollover doesn't lose it. */
  private reconcilePlayerSquad(): void {
    if (!this.clubManager || !this.playerTeamId) { return; }
    const cs = this.clubManager.getState();
    this.editableCountries = mapTeam(this.editableCountries, this.playerTeamId, t => ({ ...t, squad: cs.squad }));
  }

  /**
   * Age/retire every AI squad (small direct intake only), gathering each squad's overflow + the
   * player's, then churn the free-agent pool — which replaces its own retirees 1:1 and mints all the
   * overflow as fresh youth. Conserves world population; clubs rebuild from the pool during windows.
   */
  private churnWorld(playerOverflow: Position[]): void {
    const overflow: OverflowSpec[] = [];
    const playerNationality = findCountryForTeam(this.editableCountries, this.playerTeamId ?? '')?.nationality ?? 'unknown';
    for (const pos of playerOverflow) { overflow.push({ position: pos, nationality: playerNationality }); }

    const churnedTeamIds: string[] = [];
    this.editableCountries = this.editableCountries.map(country => {
      if (!this.selectedLeagueIds.includes(country.id)) { return country; }
      return {
        ...country,
        divisions: country.divisions.map(d => ({
          ...d,
          teams: d.teams.map(team => {
            if (team.id === this.playerTeamId) { return team; } // already churned via ClubManager
            const level = this.facilityForLevel(d.level);
            const res = churnSquad(team.squad, {
              rng: this.rng, youthFactory: this.youthFactory, nationality: country.nationality,
              trainingLevel: level, academyLevel: level,
            });
            for (const pos of res.overflow) { overflow.push({ position: pos, nationality: country.nationality }); }
            this.squadTargets.set(team.id, Math.min(MAX_SQUAD_SIZE, team.squad.length));
            churnedTeamIds.push(team.id);
            return { ...team, squad: res.squad };
          }),
        })),
      };
    });
    this.pushTeamUpdates(churnedTeamIds);

    if (this.transferManager) {
      this.transferManager.setFreeAgents(churnFreeAgents(this.transferManager.getFreeAgents(), {
        rng: this.rng, youthFactory: this.youthFactory, overflow,
      }));
    }
  }

  /** Push freshly-resolved Teams into the league/cup CompetitionManagers that scheduled them,
   *  so not-yet-played fixtures see the post-churn/post-market squad rather than a stale copy
   *  captured at CompetitionManager construction time. */
  private pushTeamUpdates(teamIds: Iterable<string>): void {
    for (const teamId of teamIds) {
      const team = findTeamById(this.editableCountries, teamId);
      if (!team) { continue; }
      const division = findDivisionForTeam(this.editableCountries, teamId);
      if (division) { this.leagueManagers[division.id]?.updateTeam(teamId, team); }
      const country = findCountryForTeam(this.editableCountries, teamId);
      if (country) { this.cupManagers[cupCompetitionId(country.id)]?.updateTeam(teamId, team); }
    }
  }

  private idleResult(): AdvanceResult {
    return { fixtureId: null, homeTeamName: '', awayTeamName: '', homeScore: 0, awayScore: 0, phase: 'idle', atIntermission: false, matchOver: true, events: [] };
  }

  /** Map collected occurrence events for one fixture into animation events. */
  private buildAdvanceResult(fixtureId: string, collected: OccurrenceEvent[]): AdvanceResult {
    const fixture = this.findFixture(fixtureId);
    const live = this.liveMatches().find(l => l.fixtureId === fixtureId) ?? null;
    const matchOver = live === null;
    const events: AnimEvent[] = collected
      .filter(e => e.occurrenceId === fixtureId && KEY_EVENT_TYPES.has(e.eventType))
      .map(e => {
        const p = e.payload as { minute?: number; team?: 'home' | 'away'; description?: string; homeScore?: number; awayScore?: number };
        return {
          minute: p.minute ?? 0,
          team: p.team ?? 'home',
          description: p.description ?? '',
          type: e.eventType,
          homeScore: p.homeScore ?? 0,
          awayScore: p.awayScore ?? 0,
        };
      });
    const homeScore = live?.homeScore ?? fixture?.result?.homeScore ?? 0;
    const awayScore = live?.awayScore ?? fixture?.result?.awayScore ?? 0;
    return {
      fixtureId,
      homeTeamName: fixture?.homeTeamName ?? live?.homeTeamName ?? '',
      awayTeamName: fixture?.awayTeamName ?? live?.awayTeamName ?? '',
      homeScore,
      awayScore,
      phase: live?.phase ?? 'full_time',
      atIntermission: !matchOver,
      matchOver,
      events,
    };
  }

  /** Bring the player's focus match into play, completing intervening non-player rounds. */
  private async ensurePlayerMatchLive(collected: OccurrenceEvent[]): Promise<string | null> {
    if (this.playerLiveMatch()) { return this.playerLiveMatch()!.fixtureId; }
    const nextFix = this.playerNextFixture();
    if (!nextFix) { return null; }
    this.focusFixtureId = nextFix.id;
    if (isBefore(this.now, nextFix.scheduledTime)) {
      collected.push(...await this.advanceClockTo(nextFix.scheduledTime));
    }
    return this.playerLiveMatch()?.fixtureId ?? nextFix.id;
  }

  /** Auto-stream the player's match to the next intermission (half/full time, etc.). */
  async advanceToNextStop(): Promise<AdvanceResult> {
    if (!this.playerTeamId) { return this.idleResult(); }
    this.lastMatchResult = null;

    const collected: OccurrenceEvent[] = [];
    const focusId = await this.ensurePlayerMatchLive(collected);
    if (!focusId) { await this.simulateToEnd(); return this.idleResult(); }
    this.focusFixtureId = focusId;

    let guard = 0;
    while (guard++ < MATCH_MAX_MINUTES + 10) {
      collected.push(...await this.advanceClockTo(addMinutes(this.now, 1)));
      const lm = this.liveMatches().find(l => l.fixtureId === focusId);
      if (!lm) { break; }                                                  // completed
      if (lm.phase === 'half_time' || lm.phase === 'extra_time_half') { break; } // intermission
    }
    this.notify();
    return this.buildAdvanceResult(focusId, collected);
  }

  /** Skip the player's current match to full time with no streaming. */
  async skipToFullTime(): Promise<AdvanceResult> {
    if (!this.playerTeamId) { return this.idleResult(); }
    this.lastMatchResult = null;

    const collected: OccurrenceEvent[] = [];
    const focusId = await this.ensurePlayerMatchLive(collected);
    if (!focusId) { await this.simulateToEnd(); return this.idleResult(); }
    this.focusFixtureId = focusId;

    let guard = 0;
    while (this.findFixture(focusId)?.status !== 'completed' && guard++ < MATCH_MAX_MINUTES) {
      collected.push(...await this.advanceClockTo(addMinutes(this.now, 5)));
    }
    this.notify();
    return this.buildAdvanceResult(focusId, collected);
  }

  /** Move the Match-tab focus to the player's next upcoming fixture. */
  nextMatch(): void {
    this.focusFixtureId = this.playerNextFixture()?.id ?? null;
    this.notify();
  }

  /** Simulate every remaining match across all competitions to the end of the season. */
  async simulateToEnd(): Promise<void> {
    this.lastMatchResult = null;
    let guard = 0;
    let nk = this.nextKickoff();
    while (nk && guard++ < 10_000) {
      await this.drainClockTo(addMinutes(nk, MATCH_MAX_MINUTES));
      nk = this.nextKickoff();
    }
    this.focusFixtureId = null;
    this.completeSeason();
    this.notify();
  }

  /** Finish any in-progress round to full time (used before saving). */
  private async finishLiveRound(): Promise<void> {
    let guard = 0;
    while (this.liveMatches().length && guard++ < MATCH_MAX_MINUTES) {
      await this.advanceClockTo(addMinutes(this.now, 10));
    }
  }

  // ── tactics ───────────────────────────────────────────────────────────────

  private clubChanged(): ClubState | null {
    this.syncPlayerTeam();
    this.notify();
    return this.clubManager?.getState() ?? null;
  }

  /**
   * Mirror the player's current clubState (squad, formation, tactics) onto their live
   * Team object. The player's *starting XI* is never stored on Team at all — it's
   * resolved lazily, straight from ClubState, by `resolvePlayerStarters()` (wired into
   * CompetitionManager as `getPlayerStarters`), called fresh at kickoff and live for
   * substitutions. AI teams are never synced, so their season-start tactics stay fixed.
   */
  private syncPlayerTeam(): void {
    const cs = this.clubManager?.getState();
    if (!this.playerTeam || !cs) { return; }
    this.playerTeam.squad = cs.squad;
    this.playerTeam.formation = cs.formation;
    this.playerTeam.tacticsIntent = cs.tactics;
    this.playerTeam.tacticsParams = resolveMatchParameters(cs.tactics, this.resolvePlayerStarters());
    // Seed in-match starting energy from each player's current fitness, so a tired
    // squad (fixture congestion) starts and tires flatter.
    this.playerTeam.fitness = Object.fromEntries(cs.squad.map(p => [p.id, p.fitness]));
  }

  /** The human club's current starting XI, mapped from ClubState's deliberate choice —
   *  never auto-selected/fit-scored. Called fresh by CompetitionManager at kickoff and
   *  live for in-match substitution diffing. */
  private resolvePlayerStarters(): Player[] {
    const cs = this.clubManager?.getState();
    if (!cs) { return []; }
    const byId = new Map(cs.squad.map(p => [p.id, p]));
    return cs.startingXI.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }

  toggleXI(id: string): ClubState | null {
    const cs = this.clubManager?.getState();
    if (!this.clubManager || !cs) { return null; }
    if (cs.startingXI.includes(id)) {
      this.clubManager.setStartingXI(cs.startingXI.filter(x => x !== id));
    } else {
      if (cs.startingXI.length >= 11) { return cs; }
      this.clubManager.setStartingXI([...cs.startingXI, id]);
    }
    return this.clubChanged();
  }

  setStartingXI(ids: string[]): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setStartingXI(ids);
    return this.clubChanged();
  }

  setBench(ids: string[]): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setBenchPlayers(ids);
    return this.clubChanged();
  }

  setTraining(playerId: string, regiment: RegimentId): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setTraining(playerId, regiment);
    return this.clubChanged();
  }

  setFormation(formation: Formation): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setFormation(formation);
    return this.clubChanged();
  }

  setTactics(intent: TeamTacticsIntent): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setTactics(intent);
    return this.clubChanged();
  }

  // ── transfers ─────────────────────────────────────────────────────────────

  buyPlayer(listingId: string): boolean {
    if (!this.transferManager || !this.clubManager || !this.getTransferWindow().open) { return false; }
    const ok = this.transferManager.purchase(listingId, this.clubManager);
    if (ok) { this.syncPlayerTeam(); this.notify(); }
    return ok;
  }

  sellPlayer(playerId: string): boolean {
    if (!this.clubManager || !this.getTransferWindow().open) { return false; }
    const player = this.clubManager.getState().squad.find(p => p.id === playerId);
    if (!player) { return false; }
    const sold = this.clubManager.sellPlayer(playerId, playerValue(player));
    if (!sold) { return false; }
    // The sold player joins the shared pool rather than vanishing — listed again on the next refresh.
    this.transferManager?.addFreeAgents([sold]);
    this.syncPlayerTeam();
    this.notify();
    return true;
  }

  /**
   * Bid directly for another club's player. The AI club accepts if the offer clears its asking price
   * (role-, age- and potential-aware). On success the player joins the manager's squad, the fee is
   * paid, and the selling club backfills the vacated position with an academy prospect.
   */
  bidForPlayer(teamId: string, playerId: string, amount: number): boolean {
    if (!this.clubManager || !this.playerTeamId || teamId === this.playerTeamId) { return false; }
    if (!this.getTransferWindow().open) { return false; }
    const team = findTeamById(this.editableCountries, teamId);
    if (!team) { return false; }
    const target = team.squad.find(p => p.id === playerId);
    if (!target) { return false; }
    const isStarter = selectStartingXIWithSlots(team.squad, team.formation).starters.some(p => p.id === playerId);

    const role: LineupRole = isStarter ? 'starter' : 'bench';
    if (!acceptBid(target, role, amount, this.rng)) { return false; }
    if (!this.clubManager.buyPlayer(target, amount)) { return false; } // budget check

    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    const level = findDivisionForTeam(this.editableCountries, teamId)?.level ?? 3;
    const replacement = makeYouth(target.position, this.facilityForLevel(level), nationality, this.youthFactory, this.rng);
    this.editableCountries = mapTeam(this.editableCountries, teamId, t => ({
      ...t,
      squad: [...t.squad.filter(p => p.id !== playerId), replacement],
    }));

    this.eventBus?.emit('player.transferred', {
      playerId, playerName: target.name, fromTeamId: teamId, toTeamId: this.playerTeamId, fee: amount,
    });
    this.pushNotification(`Signed ${target.name} for £${amount.toLocaleString()}.`, 'success');
    this.syncPlayerTeam();
    this.notify();
    return true;
  }

  /**
   * Mimic AI clubs trading the free-agent pool during a window: each (except the manager's) may
   * upgrade its weakest slot from the pool, releasing the cast-off back into it. Writes the reshuffled
   * squads back into `editableCountries` and the pool back into the transfer manager.
   */
  private runAiMarketWindow(): void {
    if (!this.transferManager) { return; }
    // Flatten every AI team (skip the manager's) into {id, squad}.
    const aiTeams: { id: string; squad: Player[] }[] = [];
    for (const country of this.editableCountries) {
      if (!this.selectedLeagueIds.includes(country.id)) { continue; }
      for (const division of country.divisions) {
        for (const team of division.teams) {
          if (team.id === this.playerTeamId) { continue; }
          aiTeams.push({ id: team.id, squad: team.squad });
        }
      }
    }

    const targetSizes = Object.fromEntries(this.squadTargets);
    const result = runAiMarket(aiTeams, this.transferManager.getFreeAgents(), { rng: this.rng, targetSizes });
    if (result.moves === 0) { return; }

    const byId = new Map(result.teams.map(t => [t.id, t.squad]));
    const tradedTeamIds: string[] = [];
    this.editableCountries = this.editableCountries.map(c => ({
      ...c,
      divisions: c.divisions.map(d => ({
        ...d,
        teams: d.teams.map(t => {
          const squad = byId.get(t.id);
          if (!squad) { return t; }
          tradedTeamIds.push(t.id);
          return { ...t, squad };
        }),
      })),
    }));
    this.pushTeamUpdates(tradedTeamIds);
    this.transferManager.setFreeAgents(result.freeAgents);
  }

  /** The current free-agent pool (browsable as part of the whole playerbase). */
  getFreeAgents(): Player[] {
    return this.transferManager?.getFreeAgents() ?? [];
  }

  /**
   * Unified one-click signing of any player in the world, at the asking price (deterministic — the
   * randomness is already baked into the asking price). A free agent is signed at market value; a
   * club player is bought at the club's asking price, the seller backfilling with academy youth.
   * Window- and budget-gated; returns false if not found / unaffordable / window shut.
   */
  signPlayer(playerId: string): boolean {
    if (!this.clubManager || !this.playerTeamId || !this.getTransferWindow().open) { return false; }

    // Free agent → sign at market value, remove from the pool.
    const freeAgent = this.transferManager?.getFreeAgents().find(p => p.id === playerId);
    if (freeAgent) {
      const fee = playerValue(freeAgent);
      if (!this.clubManager.buyPlayer(freeAgent, fee)) { return false; }
      this.transferManager?.setFreeAgents(this.transferManager.getFreeAgents().filter(p => p.id !== playerId));
      this.eventBus?.emit('player.transferred', {
        playerId, playerName: freeAgent.name, fromTeamId: '', toTeamId: this.playerTeamId, fee,
      });
      this.pushNotification(`Signed ${freeAgent.name} for £${fee.toLocaleString()}.`, 'success');
      this.syncPlayerTeam();
      this.notify();
      return true;
    }

    // Otherwise a club player → buy at the asking price; the seller backfills with youth.
    const located = this.findClubPlayer(playerId);
    if (!located) { return false; }
    const { team, player, isStarter } = located;
    const fee = directTransferPrice(player, isStarter ? 'starter' : 'bench');
    if (!this.clubManager.buyPlayer(player, fee)) { return false; }

    const nationality = findCountryForTeam(this.editableCountries, team.id)?.nationality ?? 'unknown';
    const level = findDivisionForTeam(this.editableCountries, team.id)?.level ?? 3;
    const replacement = makeYouth(player.position, this.facilityForLevel(level), nationality, this.youthFactory, this.rng);
    this.editableCountries = mapTeam(this.editableCountries, team.id, t => ({
      ...t,
      squad: [...t.squad.filter(p => p.id !== playerId), replacement],
    }));
    this.eventBus?.emit('player.transferred', {
      playerId, playerName: player.name, fromTeamId: team.id, toTeamId: this.playerTeamId, fee,
    });
    this.pushNotification(`Signed ${player.name} for £${fee.toLocaleString()}.`, 'success');
    this.syncPlayerTeam();
    this.notify();
    return true;
  }

  /** Locate a player within a selected-league club (excluding the manager's own). */
  private findClubPlayer(playerId: string): { team: Team; player: Player; isStarter: boolean } | null {
    for (const country of this.editableCountries) {
      if (!this.selectedLeagueIds.includes(country.id)) { continue; }
      for (const division of country.divisions) {
        for (const team of division.teams) {
          if (team.id === this.playerTeamId) { continue; }
          const player = team.squad.find(p => p.id === playerId);
          if (!player) { continue; }
          const isStarter = selectStartingXIWithSlots(team.squad, team.formation).starters.some(p => p.id === playerId);
          return { team, player, isStarter };
        }
      }
    }
    return null;
  }

  /** The fee another club would demand for a player (surfaced so the manager can frame a bid). */
  askingPriceFor(teamId: string, playerId: string): number | null {
    const team = findTeamById(this.editableCountries, teamId);
    if (!team) { return null; }
    const target = team.squad.find(p => p.id === playerId);
    if (!target) { return null; }
    const isStarter = selectStartingXIWithSlots(team.squad, team.formation).starters.some(p => p.id === playerId);
    return directTransferPrice(target, isStarter ? 'starter' : 'bench');
  }

  refreshTransfers(): TransferListing[] {
    if (!this.transferManager) { return []; }
    this.transferManager.refreshMarket(this.currentMatchday);
    this.notify();
    return this.transferManager.getActiveListings(this.currentMatchday);
  }

  // ── facilities ────────────────────────────────────────────────────────────

  upgradeFacility(key: 'medical' | 'training' | 'academy'): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.upgradeFacility(key);
    if (ok) { this.notify(); }
    return ok;
  }

  applyStadiumDesign(sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.applyStadiumDesign(sectors, cost, newCapacity);
    if (ok) { this.notify(); }
    return ok;
  }

  // ── pre-game team editor (operates on editableCountries) ────────────────────

  getEditableCountries(): EditableCountry[] {
    return this.editableCountries;
  }

  setEditableCountries(countries: EditableCountry[]): void {
    this.editableCountries = countries;
    this.notify();
  }

  private editTeam(teamId: string, fn: (t: Team) => Team): EditableCountry[] {
    this.editableCountries = mapTeam(this.editableCountries, teamId, fn);
    this.notify();
    return this.editableCountries;
  }

  private makePlayer(position: Position, quality: number, nationality: string): Player {
    return { ...this.playerGenerator.generatePlayer(position, { overall: quality }), nationality };
  }

  updateTeamName(teamId: string, name: string): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, name: name.trim() || t.name }));
  }

  updateTeamColors(teamId: string, colors: TeamColors): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, colors }));
  }

  updateTeamFormation(teamId: string, formation: Formation): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, formation }));
  }

  updatePlayerData(teamId: string, playerId: string, data: Partial<Player>): EditableCountry[] {
    return this.editTeam(teamId, t => ({
      ...t,
      squad: t.squad.map(p => p.id === playerId ? { ...p, ...data } : p),
    }));
  }

  regeneratePlayer(teamId: string, playerId: string): EditableCountry[] {
    return this.editTeam(teamId, t => ({
      ...t,
      squad: t.squad.map(p => {
        if (p.id !== playerId) { return p; }
        const q = Math.round(calculateOverall(p.attributes));
        const gen = this.playerGenerator.generatePlayer(p.position, { overall: q });
        return { ...p, name: gen.name, attributes: gen.attributes };
      }),
    }));
  }

  removePlayer(teamId: string, playerId: string): EditableCountry[] {
    return this.editTeam(teamId, t => ({
      ...t,
      squad: t.squad.filter(p => p.id !== playerId),
    }));
  }

  addGeneratedPlayer(teamId: string): EditableCountry[] {
    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    const pos = ALL_POSITIONS[Math.floor(this.rng() * ALL_POSITIONS.length)] as Position;
    const newPlayer = this.makePlayer(pos, 70, nationality);
    return this.editTeam(teamId, t => ({ ...t, squad: [...t.squad, newPlayer] }));
  }

  addPlayer(teamId: string, player: Omit<Player, 'id'>): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, squad: [...t.squad, { ...player, id: uuidv4() }] }));
  }

  generateFullTeam(teamId: string): EditableCountry[] {
    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    const starters = (['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] as Position[])
      .map(pos => this.makePlayer(pos, 70, nationality));
    const bench = (['GK', 'CB', 'CM', 'ST'] as Position[])
      .map(pos => this.makePlayer(pos, 60, nationality));
    return this.editTeam(teamId, t => ({ ...t, squad: [...starters, ...bench] }));
  }
}
