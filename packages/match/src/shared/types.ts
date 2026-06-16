import type { MatchParameters } from '../tactics/match-parameters.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';

export type Formation =
  | '4-4-2' | '4-3-3' | '4-5-1' | '4-2-3-1' | '4-1-4-1' | '4-4-1-1' | '4-2-4'
  | '3-5-2' | '3-4-3' | '3-4-2-1'
  | '5-3-2' | '5-4-1';

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST' | 'CF';

export interface Player {
  id: string;
  name: string;
  nationality: string;
  age: number;
  position: Position;
  potential: number;
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

export interface TeamColors {
  primary: string;
  secondary: string;
}

export interface Team {
  id: string;
  name: string;
  formation: Formation;
  starters: Player[];
  substitutes: Player[];
  colors: TeamColors;
  tactics?: TeamTactics;
  /** Manager intent (formation + style + sliders); resolved into tacticsParams. */
  tacticsIntent?: TeamTacticsIntent;
  /** Resolved tactical parameters consumed by the pure simulator (see tactics layer). */
  tacticsParams?: MatchParameters;
  /** Per-player starting energy 0..100 (seeded from ClubPlayer.fitness) for this match. */
  fitness?: Record<string, number>;
}

/** @deprecated Superseded by TeamTacticsIntent + the resolved MatchParameters. */
export interface TeamTactics {
  attackingMentality: 'defensive' | 'balanced' | 'attacking';
  passingStyle: 'short' | 'mixed' | 'long';
  tempo: 'slow' | 'medium' | 'fast';
  width: 'narrow' | 'balanced' | 'wide';
}
