import {
  CompetitionManager, LeagueFormat, KnockoutFormat, Season,
  ClubManager, TransferManager, PlayerGenerator, EventBus,
  DEFAULT_STADIUM_SECTORS, calculateTotalCapacity, calculateOverall, sellPrice, v4 as uuidv4,
  isBefore, addMinutes, addDays,
  defaultIntent, aiIntent, resolveMatchParameters, NEUTRAL_PARAMS, buildMatchInsight,
} from '@fm2k/engine';
import type {
  LeagueState, CompetitionState, CompetitionFixture, LiveMatch, ClubState, TransferListing, TransferState,
  Position, GameEvents, StadiumSectorConfig, Player, Formation, Team, TeamColors, GameDateTime, OccurrenceEvent,
  TeamTacticsIntent, MatchInsight,
} from '@fm2k/engine';
import {
  buildEditableCountries, mapTeam, findTeamById, findDivisionForTeam, findCountryForTeam,
} from '../domain/editable-country.ts';
import type { EditableCountry } from '../domain/editable-country.ts';
import { applyPromotionRelegation } from '../domain/promotion.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import {
  writeSave, SAVE_VERSION, type SaveData, type SaveType,
} from '../data/save-data.ts';
import {
  BUDGET_START, STADIUM_START, SEASON_START, EVENTS_PER_MINUTE, MARKET_SIZE,
  MARKET_REFRESH_INTERVAL, ALL_POSITIONS, LEAGUE_MATCHDAYS, CUP_ROUND_NAMES, cupCompetitionId,
} from './config.ts';
import { scaleAttributes } from './player-scaling.ts';

/** Significant match events the UI animates (goals, cards, saves, phase changes). */
const KEY_EVENT_TYPES = new Set(['goal', 'yellow_card', 'red_card', 'save', 'half_time', 'full_time']);

/** Minutes added to a kickoff to be sure a match (incl. extra time) has finished. */
const MATCH_MAX_MINUTES = 130;

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
  /** Single post-match insight for the player's team (null until the detector logic ships). */
  lastMatchInsight: MatchInsight | null;
}

/**
 * Owns the engine managers + EventBus for a single game and exposes lifecycle
 * operations. Reads are served via `snapshot()`. The frontend never touches the
 * managers directly.
 */
export class GameSession {
  private readonly rng: () => number;
  private readonly playerGenerator: PlayerGenerator;
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
  /** The player's live Team object inside the divisions (same reference the sim uses). */
  private playerTeam: Team | null = null;
  private editableCountries: EditableCountry[] = buildEditableCountries();
  private readonly listeners = new Set<() => void>();

  /** `rng` is injectable so generated players (position + attributes) are deterministic in tests. */
  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.playerGenerator = new PlayerGenerator('female', 'all', rng);
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
      lastMatchInsight: this.lastMatchInsight,
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
          t.tacticsParams = resolveMatchParameters(teamIntent, t.starters);
        }
      }
    }
  }

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

    // Ensure the player's nation is always included even if not in leagueIds.
    const playerCountry = findCountryForTeam(editableCountries, teamId);
    const allLeagueIds = playerCountry && !leagueIds.includes(playerCountry.id)
      ? [...leagueIds, playerCountry.id]
      : leagueIds;

    this.eventBusCleanup?.();
    const eventBus = new EventBus<GameEvents>();
    this.eventBus = eventBus;

    this.eventBusCleanup = eventBus.on('match.completed', (payload) => {
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
    });

    // Build a per-nation Season: its league divisions plus its national cup. The
    // EventBus is wired only to the player's own division and the player's cup so
    // their results drive lastMatchResult, gate receipts, and injuries.
    const seasons: Record<string, Season> = {};
    const leagueManagers: Record<string, CompetitionManager> = {};
    const cupManagers: Record<string, CompetitionManager> = {};

    for (const countryId of allLeagueIds) {
      const country = editableCountries.find(c => c.id === countryId);
      if (!country) { continue; }
      const isPlayerNation = country.id === playerCountry?.id;
      const competitions: CompetitionManager[] = [];

      for (const div of country.divisions) {
        const lm = new CompetitionManager({
          format: new LeagueFormat(),
          teams: div.teams,
          startDate: SEASON_START,
          seasonStart: SEASON_START,
          competitionId: div.id,
          name: div.name,
          eventsPerMinute: EVENTS_PER_MINUTE,
          eventBus: div.id === division.id ? eventBus : undefined,
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
      });
      cupManagers[cupId] = cup;
      competitions.push(cup);

      seasons[country.id] = new Season({ nationId: country.id, startDate: SEASON_START, competitions });
    }

    const defaultSectors = DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>;
    const clubManager = new ClubManager({
      clubId: team.id,
      clubName: team.name,
      divisionId: division.id,
      squad: [...team.starters, ...team.substitutes],
      budget: BUDGET_START,
      formation: team.formation,
      tactics: intent,
      startingXI: team.starters.slice(0, 11).map(p => p.id),
      benchPlayers: team.substitutes.map(p => p.id),
      stadiumCapacity: calculateTotalCapacity(defaultSectors) || STADIUM_START,
      stadiumSectors: defaultSectors,
      eventBus,
    });

    const transferManager = new TransferManager({
      marketSize: MARKET_SIZE,
      playerFactory: () => {
        const pos = ALL_POSITIONS[Math.floor(this.rng() * ALL_POSITIONS.length)] as Position;
        const gen = this.playerGenerator.generatePlayer(pos, 1, 20);
        return { ...gen, id: uuidv4(), attributes: scaleAttributes(gen.attributes, 65) };
      },
    });

    this.seasons = seasons;
    this.leagueManagers = leagueManagers;
    this.cupManagers = cupManagers;
    this.leagueManager = leagueManagers[division.id];
    this.playerCupManager = playerCountry ? cupManagers[cupCompetitionId(playerCountry.id)] : null;
    this.clubManager = clubManager;
    this.transferManager = transferManager;
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
   * Roll over to the next season: apply promotion/relegation from the just-finished
   * standings, then rebuild every division (and the player's club) from the updated
   * memberships.
   */
  startNewSeason(): boolean {
    if (!this.playerTeamId) { return false; }
    const ranked: Record<string, string[]> = {};
    for (const [divId, lm] of Object.entries(this.leagueManagers)) {
      ranked[divId] = lm.getState().standings.map(s => s.teamId);
    }
    this.editableCountries = applyPromotionRelegation(this.editableCountries, ranked);
    // Carry the player's tactical intent across seasons.
    const prevTactics = this.clubManager?.getState().tactics;
    return this.startGame(this.playerTeamId, this.selectedLeagueIds, prevTactics);
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
    this.clubManager!.loadState(savedClubState);
    const transferState: TransferState = {
      listings: save.transferListings,
      refreshedOnMatchday: save.currentMatchday,
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

    const newMatchday = this.leagueManager?.completedRounds() ?? this.currentMatchday;
    if (newMatchday > this.currentMatchday) {
      this.clubManager?.handleMatchdayComplete();
      if (newMatchday % MARKET_REFRESH_INTERVAL === 0) {
        this.transferManager?.refreshMarket(newMatchday);
      }
      this.currentMatchday = newMatchday;
    }
    this.seasonComplete = !Object.values(this.seasons).some(s => s.hasNext());
    return perSeason.flat() as OccurrenceEvent[];
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
      await this.advanceClockTo(addMinutes(nk, MATCH_MAX_MINUTES));
      nk = this.nextKickoff();
    }
    this.focusFixtureId = null;
    this.seasonComplete = true;
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
   * Mirror the player's current clubState (XI, formation, tactics) onto their
   * live Team object. Because the simulator now builds lazily at kickoff, the
   * player's chosen squad/formation/tactics are used on a per-match basis — the
   * next match to start picks up whatever is set here. AI teams are never synced,
   * so their season-start tactics stay fixed.
   */
  private syncPlayerTeam(): void {
    const cs = this.clubManager?.getState();
    if (!this.playerTeam || !cs) { return; }
    const byId = new Map(cs.squad.map(p => [p.id, p]));
    const pick = (ids: string[]): Player[] =>
      ids.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    this.playerTeam.starters = pick(cs.startingXI);
    this.playerTeam.substitutes = pick(cs.benchPlayers);
    this.playerTeam.formation = cs.formation;
    this.playerTeam.tacticsIntent = cs.tactics;
    this.playerTeam.tacticsParams = resolveMatchParameters(cs.tactics, this.playerTeam.starters);
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
    if (!this.transferManager || !this.clubManager) { return false; }
    const ok = this.transferManager.purchase(listingId, this.clubManager);
    if (ok) { this.syncPlayerTeam(); this.notify(); }
    return ok;
  }

  sellPlayer(playerId: string): boolean {
    if (!this.clubManager) { return false; }
    const player = this.clubManager.getState().squad.find(p => p.id === playerId);
    if (!player) { return false; }
    const ok = this.clubManager.sellPlayer(playerId, sellPrice(player.attributes));
    if (ok) { this.syncPlayerTeam(); this.notify(); }
    return ok;
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
    const gen = this.playerGenerator.generatePlayer(position, 1, 20);
    return { ...gen, id: uuidv4(), nationality, attributes: scaleAttributes(gen.attributes, quality) };
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
    return this.editTeam(teamId, t => {
      const upd = (list: Player[]) => list.map(p => p.id === playerId ? { ...p, ...data } : p);
      return { ...t, starters: upd(t.starters), substitutes: upd(t.substitutes) };
    });
  }

  regeneratePlayer(teamId: string, playerId: string): EditableCountry[] {
    return this.editTeam(teamId, t => {
      const upd = (list: Player[]) => list.map(p => {
        if (p.id !== playerId) { return p; }
        const q = Math.round(calculateOverall(p.attributes));
        const gen = this.playerGenerator.generatePlayer(p.position, 1, 20);
        return { ...p, name: gen.name, attributes: scaleAttributes(gen.attributes, q) };
      });
      return { ...t, starters: upd(t.starters), substitutes: upd(t.substitutes) };
    });
  }

  removePlayer(teamId: string, playerId: string): EditableCountry[] {
    return this.editTeam(teamId, t => ({
      ...t,
      starters: t.starters.filter(p => p.id !== playerId),
      substitutes: t.substitutes.filter(p => p.id !== playerId),
    }));
  }

  addGeneratedPlayer(teamId: string): EditableCountry[] {
    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    const pos = ALL_POSITIONS[Math.floor(this.rng() * ALL_POSITIONS.length)] as Position;
    const newPlayer = this.makePlayer(pos, 70, nationality);
    return this.editTeam(teamId, t => ({ ...t, starters: [...t.starters, newPlayer] }));
  }

  addPlayer(teamId: string, player: Omit<Player, 'id'>): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, starters: [...t.starters, { ...player, id: uuidv4() }] }));
  }

  generateFullTeam(teamId: string): EditableCountry[] {
    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    return this.editTeam(teamId, t => ({
      ...t,
      starters: (['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] as Position[])
        .map(pos => this.makePlayer(pos, 70, nationality)),
      substitutes: (['GK', 'CB', 'CM', 'ST'] as Position[])
        .map(pos => this.makePlayer(pos, 60, nationality)),
    }));
  }
}
