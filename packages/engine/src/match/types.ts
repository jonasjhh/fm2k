import { Player, Team } from '../shared/types';

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
