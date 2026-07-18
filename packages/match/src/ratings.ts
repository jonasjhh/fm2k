import type { Player, PlayerAttributes } from './shared/types.ts';

// Finishing + technique dominate, rest equal. Keeping is deliberately weightless for
// now: v1 never rated GKs on a goalkeeping stat, so this preserves pre-reshape overalls;
// Step 5 rederives overall from duel exposure.
export const OVERALL_WEIGHTS: Record<keyof PlayerAttributes, number> = {
  finishing:  0.16,
  technique:  0.16,
  passing:    0.13,
  speed:      0.14,
  strength:   0.13,
  defending:  0.14,
  stamina:    0.14,
  goalkeeping:    0,
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
