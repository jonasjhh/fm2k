import type { GameDateTime } from '@fm2k/timeline';
import type { Team } from '../shared/types.ts';
import type { CompetitionKind, CompetitionState, DecidedBy } from './competition-types.ts';

/** A completed match handed to a format for it to record. */
export interface MatchOutcome {
  readonly fixtureId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly decidedBy?: DecidedBy;
  readonly shootout?: { home: number; away: number };
  readonly winnerTeamId?: string;
}

/** A match the format wants the manager to schedule into the TickEngine. */
export interface ScheduledMatch {
  readonly fixtureId: string;
  readonly homeTeam: Team;
  readonly awayTeam: Team;
  readonly scheduledTime: GameDateTime;
  readonly knockout: boolean;
}

/** Everything a format needs to build/advance a competition. */
export interface FormatContext {
  readonly competitionId: string;
  readonly name: string;
  readonly season: string;
  readonly teams: Team[];
  readonly teamsById: Map<string, Team>;
  /** Division level per team id (knockout seeding). */
  readonly levelByTeamId: Map<string, number>;
  readonly startDate: GameDateTime;
  /** The league season's start (cup scheduling is relative to it). */
  readonly seasonStart: GameDateTime;
  readonly rng: () => number;
}

/**
 * The standardised competition API. Built-ins (`LeagueFormat`, `KnockoutFormat`)
 * are constructed from config objects; any custom object implementing this
 * interface is an equally valid "code-based" competition.
 *
 * `init`/`apply` are the only state producers. `apply` mutates the supplied draft
 * (records the result, updates standings or advances the bracket) and returns any
 * matches newly unlocked for scheduling.
 */
export interface CompetitionFormat {
  readonly kind: CompetitionKind;

  /** Build the initial state and the matches known up front. */
  init(ctx: FormatContext): { state: CompetitionState; toSchedule: ScheduledMatch[] };

  /** Record a completed match into the draft; return matches now schedulable. */
  apply(draft: CompetitionState, outcome: MatchOutcome, ctx: FormatContext): ScheduledMatch[];

  /** Count of fully-completed rounds (league matchdays or cup rounds). */
  completedRounds(state: CompetitionState): number;

  /** Rebuild occurrences for the in-flight (scheduled, teams-known) fixtures after a load. */
  rescheduleFromState(state: CompetitionState, ctx: FormatContext): ScheduledMatch[];
}
