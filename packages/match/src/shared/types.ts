import type { MatchParameters } from '../tactics/match-parameters.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';
import type { Band } from '../lineup/bands.ts';
export type { Band };

export type Formation =
  | '4-4-2' | '4-3-3' | '4-5-1' | '4-2-3-1' | '4-1-4-1' | '4-4-1-1' | '4-2-4'
  | '3-5-2' | '3-4-3' | '3-4-2-1'
  | '5-3-2' | '5-4-1';

/** How a match's result was decided — produced by MatchOccurrence, consumed (re-exported
 *  as DecidedBy) by @fm2k/engine's competition layer. */
export type MatchOutcomeDecidedBy = 'normal' | 'extra_time' | 'penalties';

/** A player's native/card position — what they're scouted, generated, and recruited as.
 *  Excludes DM/AM: those are formation slots a CM plays, not a position a player has. */
export type PlayerPosition = 'GK' | 'CB' | 'LB' | 'RB' | 'CM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

/** A formation slot / in-match role a player can be fielded at — a superset of
 *  PlayerPosition that also includes DM and AM (always filled by a CM). */
export type FormationPosition = PlayerPosition | 'DM' | 'AM';

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

/** A manager-chosen anchor point for one player, free of any predefined formation
 *  template: `band` is which line they play in (quantized vertical — the same 5-band
 *  resolution the presence grid reads), `lateral` is where on that line (-1 far left ..
 *  1 far right — continuous). There is no role field: a player's effective
 *  FormationPosition label is *derived* from where they stand relative to their
 *  band-mates (see deriveRolesForShape in lineup.ts). */
export interface PlayerGeometry {
  band: Exclude<Band, 'GK'>;
  lateral: number;
}

/** A team's dual formation shape (REWORK_01.md §5): one anchor per outfield XI player in
 *  each phase. Named formations are presets that seed both shapes identically; FM-style
 *  arrows are the rendered difference between a player's two anchors. The v1 sim reads
 *  only `defending` (as its single formation); the v2 duel engine reads both. */
export interface TeamShapes {
  attacking: Record<string, PlayerGeometry>;
  defending: Record<string, PlayerGeometry>;
}

export interface Player {
  id: string;
  name: string;
  nationality: string;
  age: number;
  position: PlayerPosition;
  potential: number;
  attributes: PlayerAttributes;
}

/** The 8-attribute set of the duel-engine rework (REWORK_01.md §2). Each attribute is
 *  the acting side of at least one of the five core duels, so "80 vs 70" always has a
 *  legible meaning. The old agility/awareness/composure were folded in (agi→speed,
 *  awr→defending/passing, cmp→finishing/technique). */
export interface PlayerAttributes {
  // Physical (3)
  speed: number;      // speed duels: escapes, chases, races to free balls, recovery runs
  strength: number;   // strength duels: shoulder-to-shoulder, shielding, aerial power
  stamina: number;    // fatigue resistance — how long the other seven hold up

  // Technical (5)
  passing: number;    // pass-vs-read duels + delivery checks (crosses, long balls, set pieces)
  technique: number;  // dribble-vs-tackle duels (attacking side), first touch, close control
  finishing: number;  // shot duels vs Keeping: shooting, converting chances, penalties
  defending: number;  // the defending side of dribble and pass duels: tackling, marking, reads
  goalkeeping: number;    // shot-stopping — the GK side of the shot duel; low for most outfielders
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
  /** Manager-chosen dual-shape override — when present, the match build uses the
   *  defending shape (v1 sim) instead of deriving slots from `formation`/FORMATION_LINES. */
  shapes?: TeamShapes;
  /** Explicit per-player role label overrides (playerId → FormationPosition). Applied on
   *  top of the geometry-derived role so a winger can play as ST without moving their anchor. */
  roleOverrides?: Record<string, FormationPosition>;
}

/** @deprecated Superseded by TeamTacticsIntent + the resolved MatchParameters. */
export interface TeamTactics {
  attackingMentality: 'defensive' | 'balanced' | 'attacking';
  passingStyle: 'short' | 'mixed' | 'long';
  tempo: 'slow' | 'medium' | 'fast';
  width: 'narrow' | 'balanced' | 'wide';
}
