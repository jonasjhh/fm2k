import type { CountryKey } from '@fm2k/names';
import type { AttributeCategory, OverallDistribution } from '@fm2k/players';

/**
 * The single place holding "what does division N in country X look like" — the domain-aware
 * counterpart to the distribution-agnostic `@fm2k/players` generator. Tuning knobs only; the
 * generator itself has no idea what a "division" or a "nation" is.
 */

const NATION_BASE_OVR: Record<CountryKey, number> = {
  england: 72,
  spain:   72,
  germany: 71,
  france:  71,
  italy:   70,
  norway:  63,
  sweden:  63,
  denmark: 62,
};

// Penalty per division level below 1 (so level 2 = -9, level 3 = -18).
const DIVISION_PENALTY = 9;

/** Target-overall distribution for a division, shifted down per level — no min/max floor, so the
 *  tails go where the bell curve puts them (a division 3's best can brush division 1 quality;
 *  its worst can fall to true amateur level). */
export function divisionOverallDistribution(nationality: CountryKey, divisionLevel: number): OverallDistribution {
  const base = NATION_BASE_OVR[nationality] ?? 60;
  const mean = Math.max(20, base - (divisionLevel - 1) * DIVISION_PENALTY);
  return { mean, stdDev: 8 };
}

/** Lower divisions' technical/mental game falls off faster than their physical game — a
 *  rough-edged amateur with good legs is more plausible than a technically gifted one. */
export function divisionCategoryBias(divisionLevel: number): Partial<Record<AttributeCategory, number>> {
  const tier = divisionLevel - 1; // 0 at the top flight
  return { technical: tier === 0 ? 0 : -3 * tier, mental: tier === 0 ? 0 : -4 * tier };
}
