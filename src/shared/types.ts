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
