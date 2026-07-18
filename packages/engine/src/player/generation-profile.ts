import type { CountryKey } from '@fm2k/names';
import type { AttributeCategory, OverallDistribution } from '@fm2k/players';

/**
 * The single place holding "what does division N in country X look like" — the domain-aware
 * counterpart to the distribution-agnostic `@fm2k/players` generator. Tuning knobs only; the
 * generator itself has no idea what a "division" or a "nation" is.
 *
 * World bands (user-set, 2026-07-17): division 3 ≈ 10–40, division 2 ≈ 20–50, division 1
 * ≈ 40–70 — with a prime-age bump carrying veterans past 70, and a very rare world-class
 * star tail in the top flight reaching 85+.
 */

/** Small national quality offsets around the common base — leagues overlap heavily. */
const NATION_OFFSET: Record<CountryKey, number> = {
  england: 3,
  spain:   3,
  germany: 2,
  france:  2,
  italy:   1,
  norway:  -2,
  sweden:  -2,
  denmark: -3,
};

/** Top-flight mean before nation offset and age bump. */
const BASE_OVR = 55;
/** σ ≈ 7–8 puts ~95% of a division inside its ±15 band while letting tails overlap. */
const BASE_STDDEV = 7;
const STDDEV_PER_TIER = 0.5;

/** Division penalty below the top flight: −20 for tier 1 (div 2), −30 for tier 2 (div 3),
 *  another −10 per tier past that. */
function tierPenalty(tier: number): number {
  return tier === 0 ? 0 : 10 + tier * 10;
}

/** Target-overall distribution for a division — the AGE-NEUTRAL base; callers add
 *  `ageOverallBump` (and possibly `starBonus`) on the sampled value. */
export function divisionOverallDistribution(nationality: CountryKey, divisionLevel: number): OverallDistribution {
  const tier = divisionLevel - 1; // 0 at the top flight
  const mean = Math.max(15, BASE_OVR + (NATION_OFFSET[nationality] ?? 0) - tierPenalty(tier));
  const stdDev = BASE_STDDEV + tier * STDDEV_PER_TIER;
  return { mean, stdDev };
}

/** Career curve on the target overall: youngsters arrive raw, the prime (26–31) peaks
 *  at +8 (so top-flight veterans in their prime brush 70+), easing off toward 35. */
export function ageOverallBump(age: number): number {
  if (age <= 17) { return 0; }
  if (age < 26) { return Math.round(((age - 17) / (26 - 17)) * 8); }
  if (age <= 31) { return 8; }
  return Math.max(4, 8 - (age - 31));
}

/** The very rare world-class talent, top flight only (≈85+ once the age bump lands). */
export const STAR_CHANCE = 0.012;
export const STAR_BONUS = 20;

export function starBonus(divisionLevel: number, rng: () => number): number {
  return divisionLevel === 1 && rng() < STAR_CHANCE ? STAR_BONUS : 0;
}

/** Lower divisions' technical game falls off faster than their physical game — a
 *  rough-edged amateur with good legs is more plausible than a technically gifted one. */
export function divisionCategoryBias(divisionLevel: number): Partial<Record<AttributeCategory, number>> {
  const tier = divisionLevel - 1; // 0 at the top flight
  return { technical: tier === 0 ? 0 : -3 * tier };
}
