import type { FormationPosition } from '../shared/types.ts';

// ── band / role vocabulary ──────────────────────────────────────────────────────
// The shared positional vocabulary: which band a role label sits in, how bands
// collapse to coarse field lines, and the flank bucketing used when deriving role
// labels from continuous shape geometry. Pure data — consumed by the lineup
// helpers, fatigue, the duel engine's field model and the tactics/squad UIs.

export type FieldLine = 'GK' | 'DEF' | 'MID' | 'ATT';

/** Finer-grained band a role sits in before collapsing to the 4 coarse field
 *  lines — the vertical resolution of the dual-shape editor and the duel
 *  engine's presence grid. */
export type Band = 'GK' | 'DEF' | 'DM' | 'MID' | 'AM' | 'ATT';

export const BAND_OF_ROLE: Record<FormationPosition, Band> = {
  GK: 'GK',
  LB: 'DEF', CB: 'DEF', RB: 'DEF',
  DM: 'DM',
  LM: 'MID', CM: 'MID', RM: 'MID',
  AM: 'AM',
  LW: 'ATT', ST: 'ATT', RW: 'ATT',
};

// Defenders behave as defenders; every flavor of midfielder (holding, central, wide,
// attacking) behaves as a midfielder; strikers and wingers behave as attackers.
export const BAND_TO_FIELD_LINE: Record<Band, FieldLine> = {
  GK: 'GK', DEF: 'DEF', DM: 'MID', MID: 'MID', AM: 'MID', ATT: 'ATT',
};

export const FIELD_LINE: Record<FormationPosition, FieldLine> = Object.fromEntries(
  (Object.keys(BAND_OF_ROLE) as FormationPosition[]).map(
    role => [role, BAND_TO_FIELD_LINE[BAND_OF_ROLE[role]]],
  ),
) as Record<FormationPosition, FieldLine>;

/** Maximum number of players a single band may hold at once (free-positioning). */
export const MAX_BAND_SIZE = 5;

/** Bands in attack-to-defense order — the canonical "how advanced is this role" ranking,
 *  shared by every UI that needs to lay players out by band (the free-positioning pitch view,
 *  and the table/pill display order in effectiveDisplayOrder). */
export const BAND_ORDER: Exclude<Band, 'GK'>[] = ['ATT', 'AM', 'MID', 'DM', 'DEF'];

/** A player's zone-weighting geometry, decoupled from their role label. Carried on
 *  MatchState.fieldedGeometry for teams playing a custom (dual-shape) formation. */
export interface FieldGeometry {
  line: FieldLine;
  flank: 'left' | 'right' | 'center';
}

export type FieldedGeometry = Record<string, FieldGeometry>;

// Anything within this band of dead-center counts as "center" rather than a flank —
// matches the left/center/right granularity role labels use.
const LATERAL_CENTER_THRESHOLD = 0.34;

/** Bucket a continuous lateral position (-1 far left .. 1 far right) into the same
 *  left/center/right granularity role labels use for predefined formations. */
export function flankOfLateral(lateral: number): 'left' | 'right' | 'center' {
  if (lateral <= -LATERAL_CENTER_THRESHOLD) { return 'left'; }
  if (lateral >= LATERAL_CENTER_THRESHOLD) { return 'right'; }
  return 'center';
}
