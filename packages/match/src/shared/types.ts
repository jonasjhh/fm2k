import type { MatchParameters } from '../tactics/match-parameters.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';

export type Formation =
  | '4-4-2' | '4-3-3' | '4-5-1' | '4-2-3-1' | '4-1-4-1' | '4-4-1-1' | '4-2-4'
  | '3-5-2' | '3-4-3' | '3-4-2-1'
  | '5-3-2' | '5-4-1';

/** How a match's result was decided — produced by MatchOccurrence, consumed (re-exported
 *  as DecidedBy) by @fm2k/engine's competition layer. */
export type MatchOutcomeDecidedBy = 'normal' | 'extra_time' | 'penalties';

/** A player's native/card position — what they're scouted, generated, and recruited as.
 *  Excludes CDM/CAM: those are formation slots a CM plays, not a position a player has. */
export type PlayerPosition = 'GK' | 'CB' | 'LB' | 'RB' | 'CM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

/** A formation slot / in-match role a player can be fielded at — a superset of
 *  PlayerPosition that also includes CDM and CAM (always filled by a CM, never a
 *  player's own PlayerPosition). */
export type FormationPosition = PlayerPosition | 'CDM' | 'CAM';

/** Single source of truth for all PlayerPosition values — a Record keyed by the full
 *  union, so TypeScript refuses to compile if a position is ever added without an entry
 *  here. Other layers should import ALL_PLAYER_POSITIONS rather than hand-maintain their
 *  own list. */
export const PLAYER_POSITION_LABELS: Record<PlayerPosition, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre Back',
  LB: 'Left Back',
  RB: 'Right Back',
  CM: 'Centre Midfielder',
  LM: 'Left Midfielder',
  RM: 'Right Midfielder',
  LW: 'Left Winger',
  RW: 'Right Winger',
  ST: 'Striker',
};

export const ALL_PLAYER_POSITIONS: readonly PlayerPosition[] =
  Object.keys(PLAYER_POSITION_LABELS) as PlayerPosition[];

/** playerId -> the FormationPosition they're fielded at right now (formation slot), as
 *  opposed to Player.position (card/generation-time PlayerPosition). */
export type FieldedPositions = Record<string, FormationPosition>;

export interface Player {
  id: string;
  name: string;
  nationality: string;
  age: number;
  position: PlayerPosition;
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
  /** Full roster. Who's starting/on the bench is a match-build-time decision — never
   *  persisted here (see selectStartingXIWithSlots in @fm2k/engine, and SideInput/
   *  MatchConfig's explicit starters fields). */
  squad: Player[];
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
