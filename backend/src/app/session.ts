import {
  CompetitionManager, LeagueFormat, KnockoutFormat, QualifierFormat, Season,
  ClubManager, TransferManager, EventBus,
  DEFAULT_STADIUM_SECTORS, calculateTotalCapacity, calculateOverall, v4 as uuidv4,
  isBefore, addMinutes, addDays, daysBetween,
  defaultIntent, aiIntent, resolveMatchParameters, NEUTRAL_PARAMS, buildMatchInsights,
  makeYouth, academyBiasForLevel, generatorYouthFactory, acceptBid, valuePlayer, playerValue, transferWindow, runAiMarket,
  churnSquad, churnFreeAgents, MAX_SQUAD_SIZE, selectStartingXIWithSlots, carryOverLineup,
  prizeMoneyFor, CUP_PRIZE, buildSlotAssignments, MAX_BENCH_SIZE,
} from '@fm2k/engine';
import { matchHeadline, transferHeadline, injuryHeadline, isExpired, type Article } from '@fm2k/newspaper';
import { PlayerGenerator } from '@fm2k/players';
import type {
  LeagueState, CompetitionState, CompetitionFixture, LiveMatch, ClubState, TransferListing, TransferState,
  PlayerPosition, GameEvents, StadiumSectorConfig, Player, Formation, Team, TeamColors, GameDateTime, OccurrenceEvent,
  TeamTacticsIntent, MatchInsight, MatchStatistics, RegimentId, YouthFactory, LineupRole, TransferWindow, OverflowSpec,
  FormationPosition, Band, FacilityGroupId, WingId, OperatingMode,
} from '@fm2k/engine';
import { buildEditableCountries } from '../domain/editable-country.ts';
import type { EditableCountry } from '../domain/editable-country.ts';
import {
  buildWorld, worldToEditableCountries, teamById, divisionForTeam, countryForTeam,
  teamsInDivision, teamsInCountry, divisionsInCountry,
  removePlayerFromWorld, addPlayerToWorld, setTeamSquad, updateTeam, updatePlayer,
  worldToFlat, worldFromFlat,
} from '../domain/world.ts';
import type { World, WorldDivision } from '../domain/world.ts';
import { applyPromotionRelegation } from '../domain/promotion.ts';
import type { QualifierResult } from '../domain/promotion.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import {
  writeSave, SAVE_VERSION, type SaveData, type SaveType,
} from '../data/save-data.ts';
import {
  BUDGET_START, STADIUM_START, SEASON_START, EVENTS_PER_MINUTE, MARKET_SIZE,
  MARKET_REFRESH_INTERVAL, ALL_PLAYER_POSITIONS, LEAGUE_MATCHDAYS, CUP_ROUND_NAMES, cupCompetitionId,
  qualifierCompetitionId,
} from './config.ts';

/** Significant match events the UI animates (goals, cards, saves, subs, phase changes). */
const KEY_EVENT_TYPES = new Set(['goal', 'yellow_card', 'red_card', 'save', 'half_time', 'full_time', 'match.substitution_applied']);

/** Ordinal suffix for a 1-based position ("1st", "2nd", "3rd", "4th"...). */
function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) { return 'th'; }
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

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

/** Why an advance segment stopped: a real intermission/finish, a sending-off that
 *  demands a tactical response, or simply the end of a streaming chunk. */
export type PauseReason = 'half_time' | 'full_time' | 'red_card' | 'chunk';

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
  pauseReason: PauseReason;
  events: AnimEvent[];
  /** Tactical read at the interval (player's fixture only, from first-half statistics). */
  halfTimeInsights?: MatchInsight[];
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
  /** Ranked post-match insights for the player's team (strongest first; empty = no story). */
  lastMatchInsights: MatchInsight[];
  /** Full statistics of the player's most recently completed match (post-match stat sheet). */
  lastMatchStatistics: MatchStatistics | null;
  /** Append-only one-off messages (retirements, transfer windows) the web turns into toasts. */
  notifications: GameNotification[];
  /** Newspaper articles still within their retention window (older ones are pruned, not just capped). */
  headlines: Article[];
}

/** Result of `buildManagers()`: the managers it built, or an explicit reason it couldn't
 *  (unknown team/division — an expected validation failure, not a bug). */
type BuildManagersResult =
  | { ok: true; clubManager: ClubManager; transferManager: TransferManager; leagueManager: CompetitionManager }
  | { ok: false; reason: string };

/**
 * Owns the engine managers + EventBus for a single game and exposes lifecycle
 * operations. Reads are served via `snapshot()`. The frontend never touches the
 * managers directly.
 */
export class GameSession {
  private readonly rng: () => number;
  private readonly playerGenerator: PlayerGenerator;
  private readonly youthFactory: YouthFactory;
  private seasons!: Record<string, Season>;
  private leagueManagers!: Record<string, CompetitionManager>;
  private cupManagers!: Record<string, CompetitionManager>;
  /** Promotion/relegation playoffs, keyed by boundary id — created mid-season once both
   *  adjacent divisions finish their regular season (see `scheduleQualifiersIfNeeded`). */
  private qualifierManagers!: Record<string, CompetitionManager>;
  /** Boundary ids already scheduled this season, so `scheduleQualifiersIfNeeded` is idempotent. */
  private scheduledQualifierBoundaries!: Set<string>;
  private leagueManager!: CompetitionManager | null;
  private playerCupManager!: CompetitionManager | null;
  private clubManager!: ClubManager | null;
  private transferManager!: TransferManager | null;
  private eventBus!: EventBus<GameEvents> | null;
  private eventBusCleanup!: (() => void) | null;

  private playerTeamId!: string | null;
  private selectedLeagueIds!: string[];
  private currentMatchday!: number;
  private seasonComplete!: boolean;
  private now!: GameDateTime;
  private focusFixtureId!: string | null;
  private lastMatchResult!: LastMatchResult | null;
  private lastMatchInsights!: MatchInsight[];
  private lastMatchStatistics!: MatchStatistics | null;
  private notifications!: GameNotification[];
  private nextNotificationId!: number;
  private headlines!: Article[];
  private nextHeadlineId!: number;
  /** Per-team squad sizes AI clubs refill toward during windows (captured pre-churn). */
  private squadTargets!: Map<string, number>;
  /** Accrued game-calendar days since the last weekly facility-maintenance tick; ticks (and
   *  resets toward 0) every time it reaches 7 — see advanceClockTo/drainClockTo. */
  private daysSinceMaintenanceTick!: number;
  /** The player's live Team object inside the divisions (same reference the sim uses). */
  private playerTeam!: Team | null;
  /** The live, flat, mutable game world. Exists for the whole session lifetime — built
   *  fresh from static defaults at construction and on `resetSession()`, mutated in
   *  place by the pre-game editor before a game starts and by signings/churn/
   *  promotion-relegation once one is running. There's deliberately no separate
   *  pre-game data model: `snapshot()`/`getEditableCountries()` always project
   *  whatever `this.world` currently holds. */
  private world!: World;
  private readonly listeners = new Set<() => void>();

  /** `rng` is injectable so generated players (position + attributes) are deterministic in tests. */
  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.playerGenerator = new PlayerGenerator('female', 'all', rng);
    this.youthFactory = generatorYouthFactory(rng);
    this.resetState();
  }

  /** Reset every piece of session state — including a fresh `World` built from static
   *  defaults — back to a just-constructed game's defaults. Used by the constructor and
   *  by `resetSession()` (returning to the main menu), so both stay in lockstep. */
  private resetState(): void {
    this.eventBusCleanup?.();
    this.seasons = {};
    this.leagueManagers = {};
    this.cupManagers = {};
    this.qualifierManagers = {};
    this.scheduledQualifierBoundaries = new Set();
    this.leagueManager = null;
    this.playerCupManager = null;
    this.clubManager = null;
    this.transferManager = null;
    this.eventBus = null;
    this.eventBusCleanup = null;
    this.playerTeamId = null;
    this.selectedLeagueIds = [];
    this.currentMatchday = 0;
    this.seasonComplete = false;
    this.now = SEASON_START;
    this.focusFixtureId = null;
    this.lastMatchResult = null;
    this.lastMatchInsights = [];
    this.lastMatchStatistics = null;
    this.notifications = [];
    this.nextNotificationId = 1;
    this.headlines = [];
    this.nextHeadlineId = 1;
    this.squadTargets = new Map();
    this.playerTeam = null;
    this.world = buildWorld(buildEditableCountries());
    this.daysSinceMaintenanceTick = 0;
  }

  /** Discard the current game (if any) and any pre-game edits, returning to a fresh
   *  default world — call when the player returns to the main menu, so re-entering the
   *  team editor or starting a new game always begins from clean defaults rather than
   *  whatever the last game left behind (e.g. post-season promotion/relegation). */
  resetSession(): void {
    this.resetState();
    this.notify();
  }

  /** AI clubs have no facility levels; approximate them from division tier (top tier = best). */
  private facilityForLevel(divisionLevel: number): number {
    return Math.max(1, Math.min(4, 5 - divisionLevel));
  }

  /** Maps the old flat 1–4 facility level onto Training Facilities' (growthBonus, ceilingBonus)
   *  axes — an exact equivalence (see packages/engine's progression.ts) used for AI clubs, which
   *  approximate their facilities from division tier rather than owning real wings/staff. */
  private trainingBonusesForLevel(level: number): { growthBonus: number; ceilingBonus: number } {
    return [{ growthBonus: 0, ceilingBonus: 0 }, { growthBonus: 0.1, ceilingBonus: 6 },
      { growthBonus: 0.2, ceilingBonus: 11 }, { growthBonus: 0.3, ceilingBonus: 15 }][level - 1];
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

  /** Queue a generated newspaper article and drop any now-expired ones — rolls over by game
   *  date rather than a raw count cap, so a new game week's edition replaces last week's. */
  private pushHeadline(article: Omit<Article, 'id'>): void {
    const stamped: Article = { ...article, id: this.nextHeadlineId++ };
    this.headlines = [...this.headlines, stamped].filter(a => !isExpired(a, this.now));
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
      editableCountries: worldToEditableCountries(this.world),
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
      lastMatchInsights: this.lastMatchInsights,
      lastMatchStatistics: this.lastMatchStatistics,
      notifications: this.notifications,
      // Pruned at read-time too — `this.now` can advance with no new headline pushed, and a
      // week-old article shouldn't visibly linger just because nothing newsworthy happened since.
      headlines: this.headlines.filter(a => !isExpired(a, this.now)),
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
    world: World,
    playerTeamId: string,
    playerIntent: TeamTacticsIntent,
  ): void {
    for (const t of world.teams.values()) {
      const teamIntent = t.id === playerTeamId ? playerIntent : aiIntent(t.formation);
      t.tacticsIntent = teamIntent;
      // A rough season-start approximation — ClubManager doesn't exist yet at this point
      // for the player's own team. syncPlayerTeam() resolves the real per-match XI later.
      t.tacticsParams = resolveMatchParameters(teamIntent, selectStartingXIWithSlots(t.squad, t.formation).starters);
    }
  }

  /** Always include the player's own nation, even if the caller's `leagueIds` omitted it. */
  private resolveLeagueIds(world: World, teamId: string, leagueIds: string[]): string[] {
    const playerCountryId = countryForTeam(world, teamId)?.id;
    return playerCountryId && !leagueIds.includes(playerCountryId)
      ? [...leagueIds, playerCountryId]
      : leagueIds;
  }

  /** Assemble the insight input for the player's fixture and run the detectors. Shared by
   *  the post-match seam (full statistics + end energy) and the half-time readout (partial
   *  statistics, no energy). The opposing XI is approximated as their best-fit selection —
   *  close enough for the style-matchup verdict, which reads squad profiles, not form. */
  private buildPlayerInsights(opts: {
    playerSide: 'home' | 'away';
    opponentTeamId: string;
    homeScore: number;
    awayScore: number;
    statistics?: MatchStatistics;
    endEnergy?: Record<string, number>;
  }): MatchInsight[] {
    const cs = this.clubManager?.getState();
    const oppTeam = teamById(this.world, opts.opponentTeamId);
    const playerParams = this.playerTeam?.tacticsParams ?? NEUTRAL_PARAMS;
    const oppParams = oppTeam?.tacticsParams ?? NEUTRAL_PARAMS;
    return buildMatchInsights({
      playerSide: opts.playerSide,
      homeScore: opts.homeScore,
      awayScore: opts.awayScore,
      params: opts.playerSide === 'home'
        ? { home: playerParams, away: oppParams }
        : { home: oppParams, away: playerParams },
      playerXi: this.clubManager?.getActiveLineup() ?? [],
      playerIntent: cs?.tactics,
      opponentXi: oppTeam ? selectStartingXIWithSlots(oppTeam.squad, oppTeam.formation).starters : [],
      statistics: opts.statistics,
      endEnergy: opts.endEnergy,
    });
  }

  /** Fresh EventBus + the session-level listeners that drive notifications/lastMatchResult/
   *  lastMatchInsights. Used whenever the competition layer is rebuilt (new game or season
   *  rollover) since the old bus's subscriptions are tied to the CompetitionManagers being
   *  discarded. */
  private rewireEventBus(world: World): EventBus<GameEvents> {
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
      this.lastMatchStatistics = payload.statistics ?? null;

      // Post-match tactical readout: what worked, what to change (detectors in @fm2k/match).
      this.lastMatchInsights = this.buildPlayerInsights({
        playerSide: isHome ? 'home' : 'away',
        opponentTeamId: isHome ? payload.awayTeamId : payload.homeTeamId,
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        statistics: payload.statistics,
        endEnergy: isHome ? payload.homeEnergy : payload.awayEnergy,
      });
    }));

    // Newspaper headlines: unlike `lastMatchResult` above, this fires for *every* fixture in
    // the player's division/cup (not just their own match) — that's the whole point, an upset
    // or blowout elsewhere in the league is exactly what's newsworthy.
    unsubs.push(eventBus.on('match.completed', (payload) => {
      const article = matchHeadline({
        homeTeamName: payload.homeTeamName ?? payload.homeTeamId,
        awayTeamName: payload.awayTeamName ?? payload.awayTeamId,
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        homePosition: payload.homePosition,
        awayPosition: payload.awayPosition,
        timestamp: payload.timestamp,
      }, this.rng);
      if (article) { this.pushHeadline(article); }
    }));
    unsubs.push(eventBus.on('player.transferred', (p) => {
      const isPlayerClub = p.toTeamId === this.playerTeamId || p.fromTeamId === this.playerTeamId;
      const teamName = teamById(world, p.toTeamId)?.name ?? p.toTeamId;
      this.pushHeadline(transferHeadline({
        playerName: p.playerName, teamName, fee: p.fee, isPlayerClub, timestamp: this.now,
      }, this.rng));
    }));
    unsubs.push(eventBus.on('player.injured', (p) => {
      // Only the player's own ClubManager emits this — it's always their squad.
      this.pushNotification(
        `${p.playerName} is injured (out ${p.matchesRemaining} match${p.matchesRemaining === 1 ? '' : 'es'}) — pick a replacement.`,
        'warning',
      );
      this.pushHeadline(injuryHeadline({
        playerName: p.playerName, injuryType: p.injuryType, timestamp: this.now,
      }, this.rng));
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
    world: World,
    allLeagueIds: string[],
    teamId: string,
    division: WorldDivision,
    eventBus: EventBus<GameEvents>,
  ): CompetitionManager {
    const playerCountry = countryForTeam(world, teamId);
    const seasons: Record<string, Season> = {};
    const leagueManagers: Record<string, CompetitionManager> = {};
    const cupManagers: Record<string, CompetitionManager> = {};

    for (const countryId of allLeagueIds) {
      const country = world.countries.get(countryId);
      if (!country) { continue; }
      const isPlayerNation = country.id === playerCountry?.id;
      const competitions: CompetitionManager[] = [];
      const countryDivisions = divisionsInCountry(world, countryId);

      for (const div of countryDivisions) {
        const isPlayerDivision = div.id === division.id;
        const lm = new CompetitionManager({
          format: new LeagueFormat(),
          teams: teamsInDivision(world, div.id),
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

      const allTeams = teamsInCountry(world, countryId);
      const levelByTeamId = new Map<string, number>();
      for (const div of countryDivisions) {
        for (const t of teamsInDivision(world, div.id)) { levelByTeamId.set(t.id, div.level); }
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
    return this.leagueManager;
  }

  /** Once both divisions on either side of a boundary have finished their regular season,
   *  schedule the single promotion/relegation playoff between the upper division's
   *  3rd-from-bottom team and the lower division's 3rd-place team (lower division at home,
   *  one week after the last matchday). Idempotent per boundary per season — relies on
   *  `this.now` already sitting at the moment the regular season just finished. */
  private scheduleQualifiersIfNeeded(): void {
    for (const country of this.world.countries.values()) {
      if (!this.selectedLeagueIds.includes(country.id)) { continue; }
      const ordered = divisionsInCountry(this.world, country.id);
      for (let i = 0; i < ordered.length - 1; i++) {
        const upperDiv = ordered[i];
        const lowerDiv = ordered[i + 1];
        const boundaryKey = qualifierCompetitionId(upperDiv.id, lowerDiv.id);
        if (this.scheduledQualifierBoundaries.has(boundaryKey)) { continue; }
        const upperLm = this.leagueManagers[upperDiv.id];
        const lowerLm = this.leagueManagers[lowerDiv.id];
        if (!upperLm || !lowerLm || upperLm.hasNext() || lowerLm.hasNext()) { continue; }

        const upperStandings = upperLm.getState().standings;
        const lowerStandings = lowerLm.getState().standings;
        if (upperStandings.length < 3 || lowerStandings.length < 3) { continue; }
        const upperTeamId = upperStandings[upperStandings.length - 3].teamId;
        const lowerTeamId = lowerStandings[2].teamId;
        const upperTeam = teamById(this.world, upperTeamId);
        const lowerTeam = teamById(this.world, lowerTeamId);
        if (!upperTeam || !lowerTeam) { continue; }

        const isPlayerMatch = upperTeamId === this.playerTeamId || lowerTeamId === this.playerTeamId;
        const qm = new CompetitionManager({
          format: new QualifierFormat({
            homeTeam: lowerTeam, awayTeam: upperTeam, scheduledTime: addDays(this.now, 7),
          }),
          teams: [lowerTeam, upperTeam],
          startDate: this.now,
          seasonStart: SEASON_START,
          competitionId: boundaryKey,
          name: `${upperDiv.name} / ${lowerDiv.name} Qualifier`,
          eventsPerMinute: EVENTS_PER_MINUTE,
          eventBus: isPlayerMatch ? this.eventBus ?? undefined : undefined,
          playerTeamId: isPlayerMatch ? this.playerTeamId ?? undefined : undefined,
          getPlayerStarters: isPlayerMatch ? () => this.resolvePlayerStarters() : undefined,
        });
        this.qualifierManagers[boundaryKey] = qm;
        this.scheduledQualifierBoundaries.add(boundaryKey);
        this.seasons[country.id]?.addCompetition(qm);
      }
    }
  }

  /** Read the outcome of every completed qualifier into the shape `applyPromotionRelegation`
   *  needs: the lower-division challenger (home), the upper-division defender (away), and who
   *  won — "winner gets promoted/keeps their spot". */
  private collectQualifierResults(): Record<string, QualifierResult> {
    const results: Record<string, QualifierResult> = {};
    for (const [boundaryKey, qm] of Object.entries(this.qualifierManagers)) {
      const fixture = qm.getState().fixtures[0];
      const winnerTeamId = fixture?.result?.winnerTeamId;
      if (!fixture || !winnerTeamId) { continue; }
      results[boundaryKey] = {
        winnerTeamId, lowerTeamId: fixture.homeTeamId, upperTeamId: fixture.awayTeamId,
      };
    }
    return results;
  }

  /** The player's cup prize for the just-finished season, if their club reached at least
   *  the semi-final — read from the bracket's full history (nothing is discarded as ties
   *  resolve), so winner/runner-up/semifinalist are all derivable after the fact. */
  private determineCupPrize(teamId: string): { amount: number; description: string } | null {
    const bracket = this.playerCupManager?.getState().bracket;
    if (!bracket) { return null; }
    if (bracket.championTeamId === teamId) {
      return { amount: CUP_PRIZE.winner, description: 'Won the cup!' };
    }
    const final = bracket.slots.find(s => s.round === bracket.rounds);
    if (final && (final.homeTeamId === teamId || final.awayTeamId === teamId)) {
      return { amount: CUP_PRIZE.runnerUp, description: 'Runner-up in the cup' };
    }
    const lostSemi = bracket.slots
      .filter(s => s.round === bracket.rounds - 1)
      .some(s => (s.homeTeamId === teamId || s.awayTeamId === teamId) && s.winnerTeamId !== teamId);
    if (lostSemi) {
      return { amount: CUP_PRIZE.semifinalist, description: 'Reached the cup semi-final' };
    }
    return null;
  }

  /** Seed AI refill targets from current squad sizes (clamped to the cap). */
  private seedSquadTargets(world: World): void {
    this.squadTargets.clear();
    for (const t of world.teams.values()) {
      this.squadTargets.set(t.id, Math.min(MAX_SQUAD_SIZE, t.squad.length));
    }
  }

  /** Build every manager for a brand-new game: fresh ClubManager (starting budget, default
   *  stadium, auto-picked XI) and fresh TransferManager (a small randomly-seeded free-agent
   *  pool). Also used by `loadGame()`, which immediately overwrites the result wholesale via
   *  `loadState()`. Season rollovers use `startNewSeason()`'s own independent body instead —
   *  see its doc comment for why this fresh-defaults construction is wrong for that case. */
  private buildManagers(
    teamId: string,
    leagueIds: string[],
    playerIntent?: TeamTacticsIntent,
  ): BuildManagersResult {
    const world = this.world;
    const team = teamById(world, teamId);
    const division = divisionForTeam(world, teamId);
    if (!team || !division) { return { ok: false, reason: `unknown team or division for teamId "${teamId}"` }; }

    // Resolve tactical parameters onto every team's live object BEFORE the
    // competition managers (which capture these references when scheduling the
    // season). The player uses their chosen intent; AI teams get a style derived
    // from their formation so opponents vary.
    const intent = playerIntent ?? defaultIntent(team.formation);
    this.stampTeamTactics(world, teamId, intent);
    this.playerTeam = team;

    const allLeagueIds = this.resolveLeagueIds(world, teamId, leagueIds);
    const eventBus = this.rewireEventBus(world);
    const leagueManager = this.buildCompetitions(world, allLeagueIds, teamId, division, eventBus);

    const playerCountry = countryForTeam(world, teamId);
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
      benchPlayers: initialXI.substitutes.slice(0, MAX_BENCH_SIZE).map(p => p.id),
      stadiumCapacity: calculateTotalCapacity(defaultSectors) || STADIUM_START,
      stadiumSectors: defaultSectors,
      eventBus,
      nationality: playerCountry?.nationality ?? 'Unknown',
      youthFactory: this.youthFactory,
    });

    // Seed a starting free-agent pool so a new game's market isn't empty: a batch per included
    // nation (so the pool scales with how many leagues are in play), each with that nation's
    // nationality. (On load this is immediately replaced by the saved pool via loadState.)
    const seededFreeAgents: Player[] = [];
    for (const countryId of allLeagueIds) {
      const country = world.countries.get(countryId);
      if (!country) { continue; }
      for (let i = 0; i < INITIAL_FREE_AGENTS_PER_NATION; i++) {
        const pos = ALL_PLAYER_POSITIONS[Math.floor(this.rng() * ALL_PLAYER_POSITIONS.length)] as PlayerPosition;
        const overall = 42 + Math.floor(this.rng() * 28); // 42–69: released players + the odd gem
        seededFreeAgents.push(this.makePlayer(pos, overall, country.nationality));
      }
    }
    this.transferManager = new TransferManager({
      marketSize: MARKET_SIZE,
      playerFactory: () => {
        const pos = ALL_PLAYER_POSITIONS[Math.floor(this.rng() * ALL_PLAYER_POSITIONS.length)] as PlayerPosition;
        return this.playerGenerator.generatePlayer(pos, { overall: 65 });
      },
      initialFreeAgents: seededFreeAgents,
    });

    this.seedSquadTargets(world);
    return { ok: true, clubManager: this.clubManager, transferManager: this.transferManager, leagueManager };
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  startGame(teamId: string, leagueIds: string[], playerIntent?: TeamTacticsIntent): boolean {
    if (!this.buildManagers(teamId, leagueIds, playerIntent).ok) { return false; }
    this.qualifierManagers = {};
    this.scheduledQualifierBoundaries = new Set();
    this.playerTeamId = teamId;
    this.selectedLeagueIds = leagueIds;
    this.currentMatchday = 0;
    this.seasonComplete = false;
    this.now = SEASON_START;
    this.daysSinceMaintenanceTick = 0;
    this.focusFixtureId = null;
    this.lastMatchResult = null;
    this.lastMatchInsights = [];
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
    const teamId = this.playerTeamId;
    const ranked: Record<string, string[]> = {};
    for (const [divId, lm] of Object.entries(this.leagueManagers)) {
      ranked[divId] = lm.getState().standings.map(s => s.teamId);
    }
    const qualifierResults = this.collectQualifierResults();

    // Capture the just-finished league placement + cup run before promotion/relegation and
    // the competition rebuild below make this season's standings/bracket unreachable.
    const oldDivision = divisionForTeam(this.world, teamId);
    const oldDivisionStandings = oldDivision ? ranked[oldDivision.id] : undefined;
    const leaguePosition = oldDivisionStandings ? oldDivisionStandings.indexOf(teamId) + 1 : 0;
    const cupPrize = this.determineCupPrize(teamId);

    applyPromotionRelegation(this.world, ranked, qualifierResults);
    this.qualifierManagers = {};
    this.scheduledQualifierBoundaries = new Set();

    const team = teamById(this.world, teamId);
    const division = divisionForTeam(this.world, teamId);
    if (!team || !division) { return false; }

    const prevClub = this.clubManager.getState();
    const prevTransfer = this.transferManager.getState();

    const intent = prevClub.tactics;
    this.stampTeamTactics(this.world, teamId, intent);
    this.playerTeam = team;

    const allLeagueIds = this.resolveLeagueIds(this.world, teamId, this.selectedLeagueIds);
    const eventBus = this.rewireEventBus(this.world);
    this.buildCompetitions(this.world, allLeagueIds, teamId, division, eventBus);

    const playerCountry = countryForTeam(this.world, teamId);
    const { startingXI: carriedXI, benchPlayers } = carryOverLineup(
      prevClub.startingXI.filter((id): id is string => id !== null), prevClub.benchPlayers, team.squad, team.formation,
    );
    // carryOverLineup returns a flat, complete (11-id) roster with no positional guarantee —
    // slot-order it for the new season, the same way a brand-new club's initial XI already is.
    // carriedXI always has exactly 11 real ids, so this never leaves a null hole.
    const startingXI = buildSlotAssignments(carriedXI, benchPlayers, team.squad, team.formation).slice(0, 11) as string[];
    this.clubManager = new ClubManager({
      clubId: team.id,
      clubName: team.name,
      divisionId: division.id,
      squad: team.squad,
      budget: prevClub.budget,
      formation: team.formation,
      tactics: intent,
      startingXI,
      benchPlayers: benchPlayers.slice(0, MAX_BENCH_SIZE),
      stadiumCapacity: prevClub.stadiumCapacity,
      stadiumSectors: prevClub.stadiumSectors,
      eventBus,
      nationality: playerCountry?.nationality ?? 'Unknown',
      youthFactory: this.youthFactory,
      facilities: prevClub.facilities,
      financialLog: prevClub.financialLog,
      recentDevelopment: prevClub.recentDevelopment,
    });

    if (oldDivision && leaguePosition > 0) {
      const amount = prizeMoneyFor(oldDivision.level, leaguePosition);
      const description = `Finished ${leaguePosition}${ordinalSuffix(leaguePosition)} in ${oldDivision.name}`;
      this.clubManager.recordPrizeMoney('league_prize', amount, description, this.now);
      this.pushNotification(`${description} — £${amount.toLocaleString()} prize money!`, 'success');
    }
    if (cupPrize) {
      this.clubManager.recordPrizeMoney('cup_prize', cupPrize.amount, cupPrize.description, this.now);
      this.pushNotification(`${cupPrize.description} — £${cupPrize.amount.toLocaleString()} prize money!`, 'success');
    }

    this.transferManager = new TransferManager({
      marketSize: MARKET_SIZE,
      playerFactory: () => {
        const pos = ALL_PLAYER_POSITIONS[Math.floor(this.rng() * ALL_PLAYER_POSITIONS.length)] as PlayerPosition;
        return this.playerGenerator.generatePlayer(pos, { overall: 65 });
      },
      initialFreeAgents: prevTransfer.freeAgents,
    });

    this.seedSquadTargets(this.world);

    this.currentMatchday = 0;
    this.seasonComplete = false;
    this.now = SEASON_START;
    this.daysSinceMaintenanceTick = 0;
    this.focusFixtureId = null;
    this.lastMatchResult = null;
    this.lastMatchInsights = [];
    return true;
  }

  buildSaveData(type: SaveType, activeTab = 'squad'): SaveData | null {
    const snap = this.snapshot();
    if (!this.playerTeamId || !snap.leagueState || !snap.clubState) { return null; }
    const keep = new Set(this.selectedLeagueIds);
    const playerCountry = countryForTeam(this.world, this.playerTeamId);
    if (playerCountry) { keep.add(playerCountry.id); }
    const flat = worldToFlat(this.world, keep);
    return {
      ...flat,
      version: SAVE_VERSION,
      type,
      savedAt: new Date().toISOString(),
      teamName: snap.clubState.clubName,
      matchday: this.currentMatchday,
      playerTeamId: this.playerTeamId,
      selectedLeagueIds: this.selectedLeagueIds,
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
    // Merge the saved (partial) world with fresh defaults so every league is available,
    // even ones the save didn't include. Must merge against FRESH defaults, not
    // whatever `this.world` currently holds (e.g. pre-game edits) — same care as
    // `resetState()` takes.
    const freshWorld = buildWorld(buildEditableCountries());
    const savedCountryIds = new Set<string>(save.countries.map(c => c.id));
    const missingCountryIds = [...freshWorld.countries.keys()].filter(id => !savedCountryIds.has(id));
    const freshOnly = worldToFlat(freshWorld, missingCountryIds);
    this.world = worldFromFlat({
      players: [...save.players, ...freshOnly.players],
      teams: [...save.teams, ...freshOnly.teams],
      teamDivision: { ...save.teamDivision, ...freshOnly.teamDivision },
      divisions: [...save.divisions, ...freshOnly.divisions],
      countries: [...save.countries, ...freshOnly.countries],
    });
    const leagueIds = save.selectedLeagueIds
      ?? [countryForTeam(this.world, save.playerTeamId)?.id].filter(Boolean) as string[];

    const savedTactics = save.clubState.tactics ?? defaultIntent(save.clubState.formation);
    const built = this.buildManagers(save.playerTeamId, leagueIds, savedTactics);
    if (!built.ok) { return false; }

    built.leagueManager.loadState(save.leagueState);
    if (save.leagueStates) {
      const playerDivId = divisionForTeam(this.world, save.playerTeamId)?.id;
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
    built.clubManager.loadState(savedClubState);
    const transferState: TransferState = {
      listings: save.transferListings,
      refreshedOnMatchday: save.currentMatchday,
      freeAgents: save.transferFreeAgents ?? [],
    };
    built.transferManager.loadState(transferState);

    this.playerTeamId = save.playerTeamId;
    this.selectedLeagueIds = leagueIds;
    this.currentMatchday = save.currentMatchday;
    this.seasonComplete = save.seasonComplete;
    // Saves snap to a round boundary, so `now` rests with no matches live; the engines
    // (rebuilt at SEASON_START with only future fixtures scheduled) lazily catch up to
    // `now` on the next advance. Legacy saves approximate it from the matchday.
    this.now = save.now ?? addDays(SEASON_START, save.currentMatchday * 7);
    this.daysSinceMaintenanceTick = 0;
    this.focusFixtureId = null;
    this.lastMatchResult = save.lastMatchResult;
    this.lastMatchInsights = [];
    return true;
  }

  // ── the game clock ──────────────────────────────────────────────────────────

  getNow(): GameDateTime { return this.now; }

  private allManagers(): CompetitionManager[] {
    return [
      ...Object.values(this.leagueManagers), ...Object.values(this.cupManagers),
      ...Object.values(this.qualifierManagers),
    ];
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
    const managers = [
      this.leagueManager, this.playerCupManager, ...Object.values(this.qualifierManagers),
    ].filter(Boolean) as CompetitionManager[];
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
    const previousNow = this.now;
    const perSeason = await Promise.all(Object.values(this.seasons).map(s => s.tickTo(target)));
    this.now = target;
    this.applyClockSideEffects();
    const elapsedDays = daysBetween(previousNow, this.now);
    this.clubManager?.recoverFitness(elapsedDays);
    this.tickFacilityMaintenanceIfDue(elapsedDays);
    return perSeason.flat() as OccurrenceEvent[];
  }

  /** Like advanceClockTo but discards event arrays (simulateToEnd path). */
  private async drainClockTo(target: GameDateTime): Promise<void> {
    if (!isBefore(this.now, target)) { return; }
    const previousNow = this.now;
    await Promise.all(Object.values(this.seasons).map(s => s.drainTo(target)));
    this.now = target;
    this.applyClockSideEffects();
    const elapsedDays = daysBetween(previousNow, this.now);
    this.clubManager?.recoverFitness(elapsedDays);
    this.tickFacilityMaintenanceIfDue(elapsedDays);
  }

  /** Accrues elapsed game-calendar days and runs one weekly facility-maintenance tick (bills
   *  upkeep, allowing the budget to go negative; force-mothballs every built wing club-wide if
   *  the budget has been negative two consecutive ticks) for every full week accrued — possibly
   *  several at once after a long skip (e.g. simulateToEnd). */
  private tickFacilityMaintenanceIfDue(elapsedDays: number): void {
    if (!this.clubManager) { return; }
    this.daysSinceMaintenanceTick += elapsedDays;
    const MAINTENANCE_INTERVAL_DAYS = 7;
    while (this.daysSinceMaintenanceTick >= MAINTENANCE_INTERVAL_DAYS) {
      this.daysSinceMaintenanceTick -= MAINTENANCE_INTERVAL_DAYS;
      this.clubManager.tickFacilityMaintenance();
    }
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
    this.scheduleQualifiersIfNeeded();
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
    setTeamSquad(this.world, this.playerTeamId, cs.squad);
  }

  /**
   * Age/retire every AI squad (small direct intake only), gathering each squad's overflow + the
   * player's, then churn the free-agent pool — which replaces its own retirees 1:1 and mints all the
   * overflow as fresh youth. Conserves world population; clubs rebuild from the pool during windows.
   * Mutates each team's squad in place via `setTeamSquad`, so not-yet-played fixtures (which hold the
   * same `Team` reference) see the post-churn squad with no separate push step needed.
   */
  private churnWorld(playerOverflow: PlayerPosition[]): void {
    const overflow: OverflowSpec[] = [];
    const playerNationality = countryForTeam(this.world, this.playerTeamId ?? '')?.nationality ?? 'Unknown';
    for (const pos of playerOverflow) { overflow.push({ position: pos, nationality: playerNationality }); }

    for (const team of this.world.teams.values()) {
      if (team.id === this.playerTeamId) { continue; } // already churned via ClubManager
      const division = divisionForTeam(this.world, team.id);
      const country = countryForTeam(this.world, team.id);
      if (!division || !country || !this.selectedLeagueIds.includes(country.id)) { continue; }
      const level = this.facilityForLevel(division.level);
      const res = churnSquad(team.squad, {
        rng: this.rng, youthFactory: this.youthFactory, nationality: country.nationality,
        ...this.trainingBonusesForLevel(level), academyBias: academyBiasForLevel(level),
      });
      for (const pos of res.overflow) { overflow.push({ position: pos, nationality: country.nationality }); }
      this.squadTargets.set(team.id, Math.min(MAX_SQUAD_SIZE, res.squad.length));
      setTeamSquad(this.world, team.id, res.squad);
    }

    if (this.transferManager) {
      this.transferManager.setFreeAgents(churnFreeAgents(this.transferManager.getFreeAgents(), {
        rng: this.rng, youthFactory: this.youthFactory, overflow,
      }));
    }
  }

  private idleResult(): AdvanceResult {
    return { fixtureId: null, homeTeamName: '', awayTeamName: '', homeScore: 0, awayScore: 0, phase: 'idle', atIntermission: false, matchOver: true, pauseReason: 'full_time', events: [] };
  }

  /** Map collected occurrence events for one fixture into animation events. */
  private buildAdvanceResult(fixtureId: string, collected: OccurrenceEvent[], pauseReason: PauseReason): AdvanceResult {
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

    // Half-time readout for the player's own fixture: run the insight detectors over
    // the first-half statistics (no end-energy yet — the fade detector stays quiet).
    let halfTimeInsights: MatchInsight[] | undefined;
    const atHalfTime = live?.phase === 'half_time' || live?.phase === 'extra_time_half';
    if (live && atHalfTime && this.playerTeamId) {
      const playerSide = live.homeTeamId === this.playerTeamId ? 'home'
        : live.awayTeamId === this.playerTeamId ? 'away' : null;
      if (playerSide) {
        halfTimeInsights = this.buildPlayerInsights({
          playerSide,
          opponentTeamId: playerSide === 'home' ? live.awayTeamId : live.homeTeamId,
          homeScore: live.homeScore,
          awayScore: live.awayScore,
          statistics: live.statistics,
        });
      }
    }

    return {
      fixtureId,
      homeTeamName: fixture?.homeTeamName ?? live?.homeTeamName ?? '',
      awayTeamName: fixture?.awayTeamName ?? live?.awayTeamName ?? '',
      homeScore,
      awayScore,
      phase: live?.phase ?? 'full_time',
      atIntermission: !matchOver,
      matchOver,
      pauseReason: matchOver ? 'full_time' : pauseReason,
      events,
      ...(halfTimeInsights && { halfTimeInsights }),
    };
  }

  /** Bring the player's focus match into play, completing intervening non-player rounds. */
  private async ensurePlayerMatchLive(collected: OccurrenceEvent[]): Promise<string | null> {
    const live = this.playerLiveMatch();
    if (live) { return live.fixtureId; }
    const nextFix = this.playerNextFixture();
    if (!nextFix) { return null; }
    this.focusFixtureId = nextFix.id;
    if (isBefore(this.now, nextFix.scheduledTime)) {
      collected.push(...await this.advanceClockTo(nextFix.scheduledTime));
    }
    return this.playerLiveMatch()?.fixtureId ?? nextFix.id;
  }

  /** Auto-stream the player's match to the next stop: an intermission or full time,
   *  a sending-off in the player's fixture (a tactical response moment), or — when
   *  `maxMinutes` is set — the end of a streaming chunk (lets the UI interleave a
   *  user-driven pause between chunks without any mid-tick interruption, keeping
   *  the rng stream untouched by when the pauses happen). */
  async advanceToNextStop(opts: { maxMinutes?: number } = {}): Promise<AdvanceResult> {
    if (!this.playerTeamId) { return this.idleResult(); }
    this.lastMatchResult = null;

    const collected: OccurrenceEvent[] = [];
    const focusId = await this.ensurePlayerMatchLive(collected);
    if (!focusId) { await this.simulateToEnd(); return this.idleResult(); }
    this.focusFixtureId = focusId;

    let pauseReason: PauseReason = 'full_time';
    let guard = 0;
    while (guard++ < MATCH_MAX_MINUTES + 10) {
      const before = collected.length;
      collected.push(...await this.advanceClockTo(addMinutes(this.now, 1)));
      const lm = this.liveMatches().find(l => l.fixtureId === focusId);
      if (!lm) { pauseReason = 'full_time'; break; }                       // completed
      if (lm.phase === 'half_time' || lm.phase === 'extra_time_half') { pauseReason = 'half_time'; break; }
      if (collected.slice(before).some(e => e.occurrenceId === focusId && e.eventType === 'red_card')) {
        pauseReason = 'red_card';
        break;
      }
      if (opts.maxMinutes !== undefined && guard >= opts.maxMinutes) { pauseReason = 'chunk'; break; }
    }
    this.notify();
    return this.buildAdvanceResult(focusId, collected, pauseReason);
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
    return this.buildAdvanceResult(focusId, collected, 'full_time');
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
    this.playerTeam.customSlots = cs.customSlots ?? undefined;
    // Seed in-match starting energy from each player's current fitness, so a tired
    // squad (fixture congestion) starts and tires flatter. ClubPlayer.fitness is 0-1000
    // internally; packages/match's energy model stays on its existing 0-100 scale.
    this.playerTeam.fitness = Object.fromEntries(cs.squad.map(p => [p.id, p.fitness / 10]));
  }

  /** The human club's XI as it stands right now: the deliberately-chosen starting XI
   *  with any queued in-match substitutions applied in place (slot-ordered) — never
   *  auto-selected/fit-scored. Called fresh by CompetitionManager at kickoff and live
   *  each tick, which is what makes queued substitutions reach the simulator. */
  private resolvePlayerStarters(): Player[] {
    return this.clubManager?.getActiveLineup() ?? [];
  }

  /** Queue an in-match substitution for the player's club (validated by ClubManager:
   *  per-match limit, bench eligibility, fitness/suspension). */
  queueSubstitution(playerOutId: string, playerInId: string): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.queueSubstitution(playerOutId, playerInId);
    if (ok) { this.clubChanged(); }
    return ok;
  }

  /** Toggle whether `id` is a starter, preserving every other slot's position: dropping a
   *  starter leaves their slot `null` rather than compacting the array; adding a bench player
   *  fills the first empty slot rather than appending past the 11-slot bound. No-op (returns
   *  the unchanged state) if there's no empty slot to add them into. */
  toggleXI(id: string): ClubState | null {
    const cs = this.clubManager?.getState();
    if (!this.clubManager || !cs) { return null; }
    const idx = cs.startingXI.indexOf(id);
    if (idx !== -1) {
      const next = [...cs.startingXI];
      next[idx] = null;
      this.clubManager.setStartingXI(next);
    } else {
      const emptyIdx = cs.startingXI.indexOf(null);
      if (emptyIdx === -1) { return cs; }
      const next = [...cs.startingXI];
      next[emptyIdx] = id;
      this.clubManager.setStartingXI(next);
    }
    return this.clubChanged();
  }

  setStartingXI(slots: (string | null)[]): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setStartingXI(slots);
    return this.clubChanged();
  }

  setEmptySlotRole(slotIndex: number, role: FormationPosition): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setEmptySlotRole(slotIndex, role);
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

  setPlayerGeometry(playerId: string, geometry: { band: Exclude<Band, 'GK'>; lateral: number }): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setPlayerGeometry(playerId, geometry);
    return this.clubChanged();
  }

  setPlayerRole(playerId: string, role: FormationPosition): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setPlayerRole(playerId, role);
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
    const team = teamById(this.world, teamId);
    if (!team) { return false; }
    const target = team.squad.find(p => p.id === playerId);
    if (!target) { return false; }
    const isStarter = selectStartingXIWithSlots(team.squad, team.formation).starters.some(p => p.id === playerId);

    const role: LineupRole = isStarter ? 'starter' : 'bench';
    if (!acceptBid(target, role, amount, this.rng)) { return false; }
    if (!this.clubManager.buyPlayer(target, amount)) { return false; } // budget check

    const nationality = countryForTeam(this.world, teamId)?.nationality ?? 'Unknown';
    const level = divisionForTeam(this.world, teamId)?.level ?? 3;
    const replacement = makeYouth(target.position, academyBiasForLevel(this.facilityForLevel(level)), nationality, this.youthFactory, this.rng);
    removePlayerFromWorld(this.world, playerId);
    addPlayerToWorld(this.world, replacement, teamId);

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
   * squads back into the world (in place, so scheduled fixtures see them) and the pool back into the
   * transfer manager.
   */
  private runAiMarketWindow(): void {
    if (!this.transferManager) { return; }
    // Flatten every AI team (skip the manager's) into {id, squad}.
    const aiTeams: { id: string; squad: Player[] }[] = [];
    for (const team of this.world.teams.values()) {
      if (team.id === this.playerTeamId) { continue; }
      const country = countryForTeam(this.world, team.id);
      if (!country || !this.selectedLeagueIds.includes(country.id)) { continue; }
      aiTeams.push({ id: team.id, squad: team.squad });
    }

    const targetSizes = Object.fromEntries(this.squadTargets);
    const result = runAiMarket(aiTeams, this.transferManager.getFreeAgents(), { rng: this.rng, targetSizes });
    if (result.moves.length === 0) { return; }

    for (const t of result.teams) { setTeamSquad(this.world, t.id, t.squad); }
    this.transferManager.setFreeAgents(result.freeAgents);

    // A club signing from the pool is the newsworthy half of AI activity; a release isn't.
    for (const move of result.moves) {
      if (move.direction !== 'signed') { continue; }
      const player = teamById(this.world, move.teamId)?.squad.find(p => p.id === move.playerId);
      if (!player) { continue; }
      this.eventBus?.emit('player.transferred', {
        playerId: move.playerId, playerName: move.playerName, fromTeamId: '', toTeamId: move.teamId,
        fee: playerValue(player),
      });
    }
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
    const fee = valuePlayer(player, { role: isStarter ? 'starter' : 'bench' });
    if (!this.clubManager.buyPlayer(player, fee)) { return false; }

    const nationality = countryForTeam(this.world, team.id)?.nationality ?? 'Unknown';
    const level = divisionForTeam(this.world, team.id)?.level ?? 3;
    const replacement = makeYouth(player.position, academyBiasForLevel(this.facilityForLevel(level)), nationality, this.youthFactory, this.rng);
    removePlayerFromWorld(this.world, playerId);
    addPlayerToWorld(this.world, replacement, team.id);
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
    for (const team of this.world.teams.values()) {
      if (team.id === this.playerTeamId) { continue; }
      const country = countryForTeam(this.world, team.id);
      if (!country || !this.selectedLeagueIds.includes(country.id)) { continue; }
      const player = team.squad.find(p => p.id === playerId);
      if (!player) { continue; }
      const isStarter = selectStartingXIWithSlots(team.squad, team.formation).starters.some(p => p.id === playerId);
      return { team, player, isStarter };
    }
    return null;
  }

  /** The fee another club would demand for a player (surfaced so the manager can frame a bid). */
  askingPriceFor(teamId: string, playerId: string): number | null {
    const team = teamById(this.world, teamId);
    if (!team) { return null; }
    const target = team.squad.find(p => p.id === playerId);
    if (!target) { return null; }
    const isStarter = selectStartingXIWithSlots(team.squad, team.formation).starters.some(p => p.id === playerId);
    return valuePlayer(target, { role: isStarter ? 'starter' : 'bench' });
  }

  refreshTransfers(): TransferListing[] {
    if (!this.transferManager) { return []; }
    this.transferManager.refreshMarket(this.currentMatchday);
    this.notify();
    return this.transferManager.getActiveListings(this.currentMatchday);
  }

  // ── facilities ────────────────────────────────────────────────────────────

  buildWing(group: FacilityGroupId, wingId: WingId): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.buildWing(group, wingId);
    if (ok) { this.notify(); }
    return ok;
  }

  demolishWing(group: FacilityGroupId, wingId: WingId): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.demolishWing(group, wingId);
    if (ok) { this.notify(); }
    return ok;
  }

  setWingMode(group: FacilityGroupId, wingId: WingId, mode: OperatingMode): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.setWingMode(group, wingId, mode);
    if (ok) { this.notify(); }
    return ok;
  }

  setWingStaffTier(group: FacilityGroupId, wingId: WingId, staffTier: 1 | 2 | 3): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.setWingStaffTier(group, wingId, staffTier);
    if (ok) { this.notify(); }
    return ok;
  }

  mothballWing(group: FacilityGroupId, wingId: WingId): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.mothballWing(group, wingId);
    if (ok) { this.notify(); }
    return ok;
  }

  unmothballWing(group: FacilityGroupId, wingId: WingId): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.unmothballWing(group, wingId);
    if (ok) { this.notify(); }
    return ok;
  }

  applyStadiumDesign(sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.applyStadiumDesign(sectors, cost, newCapacity);
    if (ok) { this.notify(); }
    return ok;
  }

  // ── pre-game team editor (operates on the live World) ───────────────────────
  // There's no separate pre-game data model: every method here mutates `this.world`
  // directly (the same World a started game runs on) and returns a fresh
  // `worldToEditableCountries()` projection — the nested shape `TeamEditor.tsx` expects.

  getEditableCountries(): EditableCountry[] {
    return worldToEditableCountries(this.world);
  }

  setEditableCountries(countries: EditableCountry[]): void {
    this.world = buildWorld(countries);
    this.notify();
  }

  private makePlayer(position: PlayerPosition, quality: number, nationality: string): Player {
    return { ...this.playerGenerator.generatePlayer(position, { overall: quality }), nationality };
  }

  updateTeamName(teamId: string, name: string): EditableCountry[] {
    const team = teamById(this.world, teamId);
    if (team) { updateTeam(this.world, teamId, { name: name.trim() || team.name }); }
    this.notify();
    return worldToEditableCountries(this.world);
  }

  updateTeamColors(teamId: string, colors: TeamColors): EditableCountry[] {
    updateTeam(this.world, teamId, { colors });
    this.notify();
    return worldToEditableCountries(this.world);
  }

  updateTeamFormation(teamId: string, formation: Formation): EditableCountry[] {
    updateTeam(this.world, teamId, { formation });
    this.notify();
    return worldToEditableCountries(this.world);
  }

  updatePlayerData(teamId: string, playerId: string, data: Partial<Player>): EditableCountry[] {
    const player = this.world.players.get(playerId);
    if (player && player.clubId === teamId) { updatePlayer(this.world, playerId, data); }
    this.notify();
    return worldToEditableCountries(this.world);
  }

  regeneratePlayer(teamId: string, playerId: string): EditableCountry[] {
    const player = this.world.players.get(playerId);
    if (player && player.clubId === teamId) {
      const q = Math.round(calculateOverall(player.attributes));
      const gen = this.playerGenerator.generatePlayer(player.position, { overall: q });
      updatePlayer(this.world, playerId, { name: gen.name, attributes: gen.attributes });
    }
    this.notify();
    return worldToEditableCountries(this.world);
  }

  removePlayer(teamId: string, playerId: string): EditableCountry[] {
    const player = this.world.players.get(playerId);
    if (player && player.clubId === teamId) { removePlayerFromWorld(this.world, playerId); }
    this.notify();
    return worldToEditableCountries(this.world);
  }

  addGeneratedPlayer(teamId: string): EditableCountry[] {
    if (teamById(this.world, teamId)) {
      const nationality = countryForTeam(this.world, teamId)?.nationality ?? 'Unknown';
      const pos = ALL_PLAYER_POSITIONS[Math.floor(this.rng() * ALL_PLAYER_POSITIONS.length)] as PlayerPosition;
      addPlayerToWorld(this.world, this.makePlayer(pos, 70, nationality), teamId);
    }
    this.notify();
    return worldToEditableCountries(this.world);
  }

  addPlayer(teamId: string, player: Omit<Player, 'id'>): EditableCountry[] {
    if (teamById(this.world, teamId)) { addPlayerToWorld(this.world, { ...player, id: uuidv4() }, teamId); }
    this.notify();
    return worldToEditableCountries(this.world);
  }

  generateFullTeam(teamId: string): EditableCountry[] {
    if (teamById(this.world, teamId)) {
      const nationality = countryForTeam(this.world, teamId)?.nationality ?? 'Unknown';
      const starters = (['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] as PlayerPosition[])
        .map(pos => this.makePlayer(pos, 70, nationality));
      const bench = (['GK', 'CB', 'CM', 'ST'] as PlayerPosition[])
        .map(pos => this.makePlayer(pos, 60, nationality));
      setTeamSquad(this.world, teamId, [...starters, ...bench]);
    }
    this.notify();
    return worldToEditableCountries(this.world);
  }
}
