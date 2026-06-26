import { Player, Team, type FieldedPositions } from '../shared/types';
import type { MatchParameterSet } from '../tactics/match-parameters.ts';
import type { InjuryReport } from './injury.ts';
import type { FieldedGeometry } from './action-selector.ts';

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
  | 'foul'
  | 'yellow_card'
  | 'red_card'
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
}
