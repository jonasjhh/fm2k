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

// Spread widens per division below the top flight, so lower divisions get a believable bottom
// tail (a fixed stdDev of 8 left division 3's worst player at P(<=20) ~= 0.1% — practically never
// — while still keeping the top flight's P(>=90) rare, as intended).
const BASE_STDDEV = 7;
const STDDEV_PER_TIER = 4;

/** Target-overall distribution for a division, shifted down and widened per level below the top
 *  flight — no min/max floor, so the tails go where the bell curve puts them (a division 3's best
 *  can brush division 1 quality; its worst can fall to true amateur level). */
export function divisionOverallDistribution(nationality: CountryKey, divisionLevel: number): OverallDistribution {
  const base = NATION_BASE_OVR[nationality] ?? 60;
  const tier = divisionLevel - 1; // 0 at the top flight
  const mean = Math.max(20, base - tier * DIVISION_PENALTY);
  const stdDev = BASE_STDDEV + tier * STDDEV_PER_TIER;
  return { mean, stdDev };
}

/** Lower divisions' technical/mental game falls off faster than their physical game — a
 *  rough-edged amateur with good legs is more plausible than a technically gifted one. */
export function divisionCategoryBias(divisionLevel: number): Partial<Record<AttributeCategory, number>> {
  const tier = divisionLevel - 1; // 0 at the top flight
  return { technical: tier === 0 ? 0 : -3 * tier, mental: tier === 0 ? 0 : -4 * tier };
}
