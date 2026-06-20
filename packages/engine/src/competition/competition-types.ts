import type { GameDateTime } from '@fm2k/timeline';
import type { MatchOutcomeDecidedBy } from '@fm2k/match';

/** Discriminates the two built-in competition formats. */
export type CompetitionKind = 'league' | 'knockout';

/** Placeholder used for a knockout fixture whose participant is not yet decided. */
export const TBD_TEAM_ID = 'TBD';
export const TBD_TEAM_NAME = 'TBD';

/** A row in a league table. Knockout competitions leave `standings` empty. */
export interface CompetitionStanding {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export type DecidedBy = MatchOutcomeDecidedBy;

export interface FixtureResult {
  homeScore: number;
  awayScore: number;
  /** Knockout only: how a level tie was settled. */
  decidedBy?: DecidedBy;
  /** Knockout only: shootout score when `decidedBy === 'penalties'`. */
  shootout?: { home: number; away: number };
  /** Knockout only: the team that advances. */
  winnerTeamId?: string;
}

/**
 * A scheduled match. A superset of the historical league `Fixture`: it adds the
 * owning `competitionId` and a human `roundLabel`, and `matchday` doubles as the
 * round index. Team ids/names are mutable so knockout ties can be filled in as
 * earlier rounds resolve (until then they hold `TBD_TEAM_ID` / `TBD_TEAM_NAME`).
 */
export interface CompetitionFixture {
  readonly id: string;
  readonly matchday: number;
  readonly competitionId: string;
  readonly roundLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  readonly scheduledTime: GameDateTime;
  result: FixtureResult | null;
  status: 'scheduled' | 'completed';
}

/** One tie in a fixed single-elimination bracket. */
export interface BracketSlot {
  readonly tieId: string;
  readonly round: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  /** Set once this tie's fixture is created. */
  fixtureId: string | null;
  winnerTeamId: string | null;
  /** Where the winner advances to (null for the final). */
  readonly nextTieId: string | null;
  readonly nextSlot: 'home' | 'away' | null;
}

export interface BracketState {
  readonly rounds: number;
  readonly roundNames: string[];
  slots: BracketSlot[];
  championTeamId: string | null;
}

/** A match currently in progress (read model for the live clock). */
export interface LiveMatch {
  readonly fixtureId: string;
  readonly competitionId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeTeamName: string;
  readonly awayTeamName: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly minute: number;
  /** Match phase: first_half | half_time | second_half | full_time | extra_time_* */
  readonly phase: string;
}

/** Unified read-model for any competition. A `LeagueState` is the `kind: 'league'` case. */
export interface CompetitionState {
  readonly competitionId: string;
  readonly kind: CompetitionKind;
  name: string;
  season: string;
  standings: CompetitionStanding[];
  fixtures: CompetitionFixture[];
  bracket?: BracketState;
}

// ── format configuration (the "config" half of code-or-config) ────────────────

export interface LeagueFormatConfig {
  readonly kind: 'league';
  /** 1 = single round-robin, 2 = home-and-away (default). */
  readonly legs?: number;
  readonly pointsForWin?: number;
  readonly pointsForDraw?: number;
}

export interface KnockoutFormatConfig {
  readonly kind: 'knockout';
  /** Division level whose teams receive a bye into round 2 (e.g. 1 = top flight). */
  readonly byeLevel: number;
  /** Division levels that contest the preliminary round (e.g. [2, 3]). */
  readonly preliminaryLevels: number[];
  readonly roundNames: string[];
  /** When true, bye (top-flight) teams are drawn away in round 2. */
  readonly byeTeamPlaysAway: boolean;
  /** From this round on, the lower-indexed feeder slot hosts. */
  readonly higherSlotHostsFromRound: number;
}
