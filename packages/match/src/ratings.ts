import type { Player, PlayerAttributes } from './shared/types.ts';

// Weights from the plan: finishing + technique dominate, rest equal.
export const OVERALL_WEIGHTS: Record<keyof PlayerAttributes, number> = {
  finishing:  0.15,
  technique:  0.15,
  passing:    0.1,
  speed:      0.1,
  strength:   0.1,
  defending:  0.1,
  stamina:    0.1,
  agility:    0.1,
  awareness:  0.1,
  composure:  0.1,
};

/** A player's overall rating from their attributes (weighted mean on the 1..99 scale). */
export function calculateOverall(attrs: PlayerAttributes): number {
  return (Object.keys(OVERALL_WEIGHTS) as Array<keyof PlayerAttributes>).reduce(
    (sum, key) => sum + attrs[key] * OVERALL_WEIGHTS[key],
    0,
  );
}

/** Average overall rating of a starting XI. */
export function getTeamOVR(starters: Player[]): number {
  if (starters.length === 0) { return 0; }
  return Math.round(starters.reduce((s, p) => s + calculateOverall(p.attributes), 0) / starters.length);
}
