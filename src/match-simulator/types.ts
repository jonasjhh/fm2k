export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '4-2-3-1' | '5-3-2' | '4-5-1' | '3-4-3';

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST' | 'CF';

export interface Player {
  id: string;
  name: string;
  position: Position;
  attributes: PlayerAttributes;
}

export interface PlayerAttributes {
  // Physical (3)
  speed: number;      // acceleration + sprint speed, chasing balls, recovery runs
  strength: number;   // power, duels, shielding, tackle power
  agility: number;    // quick turns, balance, jumping, goalkeeper mobility

  // Technical (5)
  passing: number;    // short passing, long passing, crossing, set piece delivery
  finishing: number;  // shooting, converting chances, shot power, penalties
  technique: number;  // ball control, dribbling, first touch
  defending: number;  // tackling, marking, interceptions, defensive technique
  stamina: number;    // fitness over time, maintaining performance, injury resistance

  // Mental (2)
  awareness: number;  // positioning, spatial intelligence, seeing opportunities, game reading, anticipation
  composure: number;  // pressure handling, big moments, mental strength
}

export interface Team {
  id: string;
  name: string;
  formation: Formation;
  starters: Player[];
  substitutes: Player[];
  tactics?: TeamTactics;
}

export interface TeamTactics {
  attackingMentality: 'defensive' | 'balanced' | 'attacking';
  passingStyle: 'short' | 'mixed' | 'long';
  tempo: 'slow' | 'medium' | 'fast';
  width: 'narrow' | 'balanced' | 'wide';
}

export type EventType =
  | 'kickoff'
  | 'pass'
  | 'dribble'
  | 'shot'
  | 'goal'
  | 'save'
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
  phase: 'first_half' | 'half_time' | 'second_half' | 'full_time';
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
