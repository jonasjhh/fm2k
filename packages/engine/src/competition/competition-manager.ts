import { StateManager } from '@fm2k/state';
import { TickEngine, EventLog } from '@fm2k/timeline';
import type { GameDateTime, OccurrenceEvent } from '@fm2k/timeline';
import type { EventBus } from '@fm2k/state';
import { MatchOccurrence } from '@fm2k/match';
import type { Player, Team, InjuryReport } from '@fm2k/match';
import type { GameEvents } from '../game-events.ts';
import type {
  CompetitionFormat, FormatContext, MatchOutcome, ScheduledMatch,
} from './competition-format.ts';
import type { CompetitionState, DecidedBy, LiveMatch } from './competition-types.ts';

export interface CompetitionManagerConfig {
  readonly format: CompetitionFormat;
  readonly teams: Team[];
  readonly startDate: GameDateTime;
  readonly competitionId: string;
  readonly name?: string;
  readonly season?: string;
  readonly seasonStart?: GameDateTime;
  readonly eventsPerMinute?: number;
  readonly eventBus?: EventBus<GameEvents>;
  /** Division level per team id (knockout seeding); empty for leagues. */
  readonly levelByTeamId?: Map<string, number>;
  readonly rng?: () => number;
  /** If one of `teams` is the human club, its id — `getPlayerStarters` then resolves
   *  that side's XI lazily (at kickoff, and live for substitutions) instead of the
   *  eager best-fit default every other team gets. */
  readonly playerTeamId?: string;
  readonly getPlayerStarters?: () => Player[];
}

/** Raw shape of a MatchOccurrence's `match.completed` payload. */
interface CompletedPayload {
  homeTeamId: string;
  awayTeamId: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore: number;
  awayScore: number;
  decidedBy?: DecidedBy;
  shootout?: { home: number; away: number };
  winnerTeamId?: string;
  // Final per-player in-match energy/injuries — see GameEvents['match.completed'].
  homeEnergy?: Record<string, number>;
  awayEnergy?: Record<string, number>;
  homeInjuries?: InjuryReport[];
  awayInjuries?: InjuryReport[];
}

/**
 * Generic competition runner: owns the StateManager + TickEngine and delegates all
 * format-specific behaviour (scheduling, standings, bracket progression) to a
 * `CompetitionFormat`. Replaces the league-only orchestration that used to live in
 * `LeagueManager`.
 */
export class CompetitionManager {
  private engine: TickEngine;
  private readonly stateManager: StateManager<CompetitionState>;
  private readonly format: CompetitionFormat;
  private readonly ctx: FormatContext;
  private readonly startDate: GameDateTime;
  private readonly eventsPerMinute: number;
  private readonly eventBus?: EventBus<GameEvents>;
  private readonly playerTeamId?: string;
  private readonly getPlayerStarters?: () => Player[];

  constructor(config: CompetitionManagerConfig) {
    this.format = config.format;
    this.eventsPerMinute = config.eventsPerMinute ?? 3;
    this.eventBus = config.eventBus;
    this.startDate = config.startDate;
    this.playerTeamId = config.playerTeamId;
    this.getPlayerStarters = config.getPlayerStarters;

    this.ctx = {
      competitionId: config.competitionId,
      name: config.name ?? config.competitionId,
      season: config.season ?? '2025/26',
      teams: config.teams,
      teamsById: new Map(config.teams.map(t => [t.id, t])),
      levelByTeamId: config.levelByTeamId ?? new Map(),
      startDate: config.startDate,
      seasonStart: config.seasonStart ?? config.startDate,
      rng: config.rng ?? Math.random,
    };

    const { state, toSchedule } = this.format.init(this.ctx);
    this.stateManager = new StateManager<CompetitionState>(state);
    this.engine = this.newEngine();
    this.scheduleAll(toSchedule);
  }

  private newEngine(): TickEngine {
    return new TickEngine({
      startTime: this.startDate,
      eventLog: new EventLog(),
      onEvents: async (events) => this.handleEvents(events),
    });
  }

  /** Push an updated Team (e.g. after AI squad churn/transfers) so not-yet-scheduled
   *  matches pick up the new lineup; safe because fixture scheduling reads ctx.teamsById
   *  fresh for each match. */
  updateTeam(teamId: string, team: Team): void {
    this.ctx.teamsById.set(teamId, team);
  }

  getState(): CompetitionState { return this.stateManager.getState(); }

  subscribe(listener: (state: CompetitionState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  hasNext(): boolean { return this.engine.hasNext(); }

  peekNextTickTime(): GameDateTime | null { return this.engine.peekNextTickTime(); }

  /** Start time of the next not-yet-started match (null if none scheduled). */
  peekNextKickoff(): GameDateTime | null {
    return this.engine.getScheduledOccurrences()[0]?.scheduledTime ?? null;
  }

  /** True while one or more matches are in progress. */
  hasLive(): boolean { return this.engine.getActiveOccurrences().length > 0; }

  /** Snapshot of the in-progress matches (partial scores/minute/phase). */
  getLiveMatches(): LiveMatch[] {
    return this.engine.getActiveOccurrences().map(o => {
      const s = (o as MatchOccurrence).getMatchState();
      return {
        fixtureId: o.id,
        competitionId: this.ctx.competitionId,
        homeTeamId: s.homeTeam.id,
        awayTeamId: s.awayTeam.id,
        homeTeamName: s.homeTeam.name,
        awayTeamName: s.awayTeam.name,
        homeScore: s.homeScore,
        awayScore: s.awayScore,
        minute: s.minute,
        phase: s.phase,
      };
    });
  }

  completedRounds(): number { return this.format.completedRounds(this.getState()); }

  loadState(state: CompetitionState): void {
    this.stateManager.setState(state);
    // Rebuild the engine from scratch so only the not-yet-played fixtures are
    // scheduled (completed fixtures must not re-fire or double-count).
    this.engine = this.newEngine();
    this.scheduleAll(this.format.rescheduleFromState(this.getState(), this.ctx));
  }

  /**
   * Advance this competition's clock to `target`, minute by minute. Matches whose
   * span includes `target` are left **in progress** (active, with partial state) —
   * this is the pausable global-clock primitive. Advancing to a time beyond a
   * match's end completes it (and runs any shootout) along the way.
   */
  async tickTo(target: GameDateTime): Promise<readonly OccurrenceEvent[]> {
    const results = await this.engine.tickTo(target);
    return results.flatMap(r => [...r.events]);
  }

  /** Advance until the next round (matchday / cup round) fully completes. */
  /** Like tickTo but discards event arrays. Use from simulateToEnd where events are
   *  handled via the bus callback and the return value is never read. */
  async drainTo(target: GameDateTime): Promise<void> {
    await this.engine.drainTo(target);
  }

  async simulateNextRound(): Promise<void> {
    const before = this.completedRounds();
    while (this.engine.hasNext()) {
      await this.engine.tickToNext();
      if (this.completedRounds() > before) { break; }
    }
  }

  async simulateFullSeason(): Promise<void> {
    while (this.engine.hasNext()) { await this.engine.tickToNext(); }
  }

  private scheduleAll(matches: ScheduledMatch[]): void {
    for (const m of matches) {
      this.engine.schedule(new MatchOccurrence({
        id: m.fixtureId,
        scheduledTime: m.scheduledTime,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeStarters: m.homeStarters,
        awayStarters: m.awayStarters,
        playerTeamId: this.playerTeamId,
        getPlayerStarters: this.getPlayerStarters,
        eventsPerMinute: this.eventsPerMinute,
        knockout: m.knockout,
        rng: this.ctx.rng,
      }));
    }
  }

  private handleEvents(events: readonly OccurrenceEvent[]): void {
    for (const event of events) {
      if (event.eventType !== 'match.completed') { continue; }
      const p = event.payload as unknown as CompletedPayload;

      const outcome: MatchOutcome = {
        fixtureId: event.occurrenceId,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        decidedBy: p.decidedBy,
        shootout: p.shootout,
        winnerTeamId: p.winnerTeamId,
      };

      let toSchedule: ScheduledMatch[] = [];
      let applied = false;
      this.stateManager.updateState(draft => {
        const fixture = draft.fixtures.find(f => f.id === event.occurrenceId);
        // Skip re-fires of fixtures already completed (e.g. state loaded from a save).
        if (!fixture || fixture.status === 'completed') { return; }
        toSchedule = this.format.apply(draft, outcome, this.ctx);
        applied = true;
      });

      if (!applied) { continue; }
      this.scheduleAll(toSchedule);

      if (this.eventBus) {
        const state = this.getState();
        const fixture = state.fixtures.find(f => f.id === event.occurrenceId);
        this.eventBus.emit('match.completed', {
          homeTeamId: p.homeTeamId,
          awayTeamId: p.awayTeamId,
          homeTeamName: p.homeTeam ?? fixture?.homeTeamName,
          awayTeamName: p.awayTeam ?? fixture?.awayTeamName,
          homeScore: p.homeScore,
          awayScore: p.awayScore,
          timestamp: event.timestamp,
          competitionId: this.ctx.competitionId,
          roundLabel: fixture?.roundLabel,
          decidedBy: p.decidedBy,
          shootout: p.shootout,
          winnerTeamId: p.winnerTeamId,
          homeEnergy: p.homeEnergy,
          awayEnergy: p.awayEnergy,
          homeInjuries: p.homeInjuries,
          awayInjuries: p.awayInjuries,
          homeStanding: state.standings.find(s => s.teamId === p.homeTeamId),
          awayStanding: state.standings.find(s => s.teamId === p.awayTeamId),
          homePosition: state.standings.findIndex(s => s.teamId === p.homeTeamId) >= 0 ? state.standings.findIndex(s => s.teamId === p.homeTeamId) + 1 : undefined,
          awayPosition: state.standings.findIndex(s => s.teamId === p.awayTeamId) >= 0 ? state.standings.findIndex(s => s.teamId === p.awayTeamId) + 1 : undefined,
          leagueSize: state.standings.length > 0 ? state.standings.length : undefined,
        });
      }
    }
  }
}
