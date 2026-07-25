import type { Player, PlayerAttributes } from './shared/types.ts';

// Outfield: finishing + technique dominate, goalkeeping excluded.
export const OVERALL_WEIGHTS: Record<keyof PlayerAttributes, number> = {
  finishing:   0.16,
  technique:   0.16,
  passing:     0.13,
  speed:       0.14,
  strength:    0.13,
  defending:   0.14,
  stamina:     0.14,
  goalkeeping: 0,
};

// GK: goalkeeping dominates; finishing, technique, defending excluded.
export const GK_OVERALL_WEIGHTS: Record<keyof PlayerAttributes, number> = {
  goalkeeping: 0.40,
  speed:       0.15,
  strength:    0.15,
  stamina:     0.15,
  passing:     0.15,
  finishing:   0,
  technique:   0,
  defending:   0,
};

/** A player's overall rating from their attributes (weighted mean on the 1..99 scale).
 *  Pass `isGk: true` to use goalkeeper weights (excludes finishing/technique/defending). */
export function calculateOverall(attrs: PlayerAttributes, isGk = false): number {
  const weights = isGk ? GK_OVERALL_WEIGHTS : OVERALL_WEIGHTS;
  return (Object.keys(weights) as Array<keyof PlayerAttributes>).reduce(
    (sum, key) => sum + attrs[key] * weights[key],
    0,
  );
}

/** Average overall rating of a starting XI. */
export function getTeamOVR(starters: Player[]): number {
  if (starters.length === 0) { return 0; }
  return Math.round(starters.reduce((s, p) => s + calculateOverall(p.attributes, p.position === 'GK'), 0) / starters.length);
}
