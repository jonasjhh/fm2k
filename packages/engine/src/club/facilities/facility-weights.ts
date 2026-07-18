import type { OperatingMode } from './facility-types.ts';

/** Every shared, cross-wing tunable lives here — per-wing costs/effects are deliberately
 *  hand-set in facility-catalogue.ts instead, since they're meant to be non-uniform. */

export const MODE_COST_MULT: Record<OperatingMode, number> = {
  full_staff: 1.00,
  core_staff: 0.45,
  skeleton_crew: 0.15,
};

export const MODE_EFFECT_MULT: Record<OperatingMode, number> = {
  full_staff: 1.00,
  core_staff: 0.40,
  skeleton_crew: 0.00,
};

/** Token passive effect a skeleton-crew wing still contributes — the building exists even
 *  with no staff driving it. Does not apply when mothballed. */
export const SKELETON_STRUCTURAL_FLOOR = 0.05;

/** Flat upkeep trickle for a mothballed wing (building maintenance only, no staff cost),
 *  as a fraction of its full_staff tier upkeep. */
export const MOTHBALLED_COST_MULT = 0.02;

/** Age threshold (inclusive) below which a player counts as "young-bracket" for youth
 *  development axes (Youth Training Pitch & Gym, Youth Sports Science Unit, etc.). */
export const YOUTH_AGE_CUTOFF = 21;

/** Consecutive weekly maintenance ticks the club's post-billing budget must end negative
 *  before every built wing, club-wide, is force-mothballed. */
export const DEFICIT_WEEKS_BEFORE_MOTHBALL = 2;
