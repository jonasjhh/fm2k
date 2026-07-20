import { Player, Team, type FieldedPositions } from '../shared/types';
import type { MatchParameters, MatchParameterSet } from '../tactics/match-parameters.ts';
import type { InjuryReport, MatchInjury } from './injury.ts';
import type { FieldedGeometry } from '../lineup/bands.ts';
import type { ActionBreakdown } from './stats.ts';
import type { DuelType } from './duel/duels.ts';

/** Duels won, by duel type — one side's half of `MatchStatistics.duelsWon`. */
export type DuelTally = Record<DuelType, number>;

export interface MatchConfig {
  matchDuration: number;
  eventsPerMinute: number;
  homeTeam: Team;
  awayTeam: Team;
  /** Already-resolved starting XI (slot-ordered) — resolution (AI best-fit vs the human
   *  club's own choice) happens upstream, never inside the simulator. */
  homeStarters: Player[];
  awayStarters: Player[];
  /** When the scores are level after 90', play two 15-minute halves of extra time. */
  extraTimeIfDrawn?: boolean;
  /** Resolved tactical parameters. Override the values carried on the Team objects;
   *  default neutral (all 50), which reproduces the tactics-agnostic baseline. */
  homeParams?: MatchParameters;
  awayParams?: MatchParameters;
  /** Starting energy 0..100 per player id (e.g. seeded from ClubPlayer.fitness so a
   *  tired squad starts flatter). Missing players default to 100 (fresh). */
  homeFitness?: Record<string, number>;
  awayFitness?: Record<string, number>;
  /** Injected randomness (default Math.random) — makes a whole match deterministic in tests. */
  rng?: () => number;
  /** Dedicated injury stream (tests). Defaults to a mulberry32 seeded by ONE draw from
   *  the main rng, so injury rolls never disturb the main stream beyond that draw. */
  injuryRng?: () => number;
}

/** Phases at which a match is over (regulation, or after extra time). */
export function isTerminalPhase(phase: MatchState['phase']): boolean {
  return phase === 'full_time' || phase === 'extra_time_full';
}

export type EventType =
  | 'kickoff'
  | 'short_pass'
  | 'long_pass'
  | 'through_ball'
  | 'cross'
  | 'dribble'
  | 'shot'
  | 'goal'
  | 'save'
  | 'tackle'
  | 'interception'
  | 'clearance'
  | 'corner'
  | 'throw_in'
  | 'free_kick'
  | 'penalty'
  | 'offside'
  | 'injury'
  | 'foul'
  | 'yellow_card'
  | 'red_card'
  | 'back_pass'
  | 'progressive_carry'
  | 'gk_short'
  | 'gk_long'
  | 'aerial_duel'
  | 'loose_ball'
  | 'blocked_shot'
  | 'cutback'
  | 'rebound'
  | 'gk_claim'
  | 'substitution'
  | 'half_time'
  | 'full_time';

export interface MatchState {
  minute: number;
  homeScore: number;
  awayScore: number;
  possession: 'home' | 'away';
  ballPosition: BallPosition;
  phase:
    | 'first_half'
    | 'half_time'
    | 'second_half'
    | 'full_time'
    | 'extra_time_first'
    | 'extra_time_half'
    | 'extra_time_second'
    | 'extra_time_full';
  homeTeam: Team;
  awayTeam: Team;
  currentPlayers: {
    home: Player[];
    away: Player[];
  };
  /** Resolved tactical parameters per side (undefined = neutral baseline). */
  params?: MatchParameterSet;
  /** Per-player energy 0..100 (100 = fresh). Ephemeral; not persisted. */
  energy?: {
    home: Record<string, number>;
    away: Record<string, number>;
  };
  /** Short-lived attacking momentum per side (0 = none); set on a goal, decays each minute. */
  momentum?: {
    home: number;
    away: number;
  };
  /** Fielded slot per player id, per side (formation position, not card position).
   *  Optional so ad-hoc test MatchState literals keep compiling; when absent, callers
   *  fall back to player.position. */
  fieldedPositions?: {
    home: FieldedPositions;
    away: FieldedPositions;
  };
  /** Per-player zone-weighting geometry, per side — overrides the geometry that would
   *  otherwise be derived from fieldedPositions' role label (FIELD_LINE/FLANK). Absent for
   *  every predefined-formation match today; populated once free-positioning lands. */
  fieldedGeometry?: {
    home: FieldedGeometry;
    away: FieldedGeometry;
  };
  bookings: {
    yellow: Array<{ playerId: string; team: 'home' | 'away'; minute: number }>;
    red: Array<{ playerId: string; team: 'home' | 'away'; minute: number }>;
  };
  /** In-match injuries so far (players forced off; never re-enter). Optional so
   *  ad-hoc test MatchState literals keep compiling. */
  matchInjuries?: MatchInjury[];
}

export interface BallPosition {
  zone: 'home_box' | 'home_third' | 'middle_third' | 'away_third' | 'away_box';
  side?: 'left' | 'center' | 'right';
}

export interface MatchEvent {
  id: string;
  type: EventType;
  minute: number;
  team: 'home' | 'away';
  playerId?: string;
  description: string;
  resultingState: MatchState;
  chainedEvent?: MatchEvent;
  metadata?: Record<string, any>;
}

export interface EventContext {
  currentState: MatchState;
  probability: number;
  involvedPlayers: Player[];
}

export interface MatchResult {
  events: MatchEvent[];
  finalState: MatchState;
  statistics: MatchStatistics;
  /** Injuries picked up during the match (pre-mitigation), per side. */
  injuries: { home: InjuryReport[]; away: InjuryReport[] };
}

export interface PassTally {
  attempted: number;
  completed: number;
}

export interface MatchStatistics {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  cards: {
    yellow: { home: number; away: number };
    red: { home: number; away: number };
  };
  passes: { home: PassTally; away: PassTally };
  /** Goals scored from the 70th minute on (late-fade signal for the insight detectors). */
  lateGoals: { home: number; away: number };
  /** Goals scored within a couple of minutes of winning the ball back and carrying it
   *  forward with a long pass/through ball (counter-exposure signal for the defensive-line
   *  insight detector). */
  fastBreakGoals: { home: number; away: number };
  /** Per contested outfield action: attempts (incl. ones a defender resolved) and successes. */
  actionBreakdown: { home: ActionBreakdown; away: ActionBreakdown };
  /** Duels won by type (v2 legibility stat: who actually won the football). Absent on
   *  results recorded before the duel engine's Step 5. */
  duelsWon?: { home: DuelTally; away: DuelTally };
  /** Per-player match rating on the familiar 10-point scale (only players with events). */
  playerRatings: Record<string, number>;
}
