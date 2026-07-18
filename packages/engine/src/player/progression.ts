import type { Player, PlayerAttributes } from '@fm2k/match';

/**
 * Player development (training). Pure and **rng-injected** so it is deterministic and
 * unit/mutation testable. `potential` is the *aptitude*: it scales the chance/magnitude of
 * improvement — it is **not a cap**. Growth is bounded instead by **diminishing returns**
 * (improving an already-high attribute is rare) and the **age curve** (older players slow
 * down and eventually decline), so not every player becomes world class.
 */

type AttrKey = keyof PlayerAttributes;

export type RegimentId =
  | 'physical' | 'finishing' | 'playmaking' | 'technique'
  | 'defending' | 'goalkeeping' | 'balanced';

export const REGIMENT_IDS: readonly RegimentId[] = [
  'physical', 'finishing', 'playmaking', 'technique',
  'defending', 'goalkeeping', 'balanced',
];

export const DEFAULT_REGIMENT: RegimentId = 'balanced';

/** Human-readable labels for the UI. */
export const REGIMENT_LABELS: Record<RegimentId, string> = {
  physical: 'Physical',
  finishing: 'Finishing',
  playmaking: 'Playmaking',
  technique: 'Technique',
  defending: 'Defending',
  goalkeeping: 'Goalkeeping',
  balanced: 'Balanced',
};

/**
 * Which attributes each regiment trains, and the relative weight a gain is directed into.
 * Covers all 8 attributes across the set; `balanced` spreads thinly over everything.
 */
export const TRAINING_REGIMENTS: Record<RegimentId, Partial<Record<AttrKey, number>>> = {
  physical:    { speed: 1, strength: 1, stamina: 1 },
  finishing:   { finishing: 2, technique: 1 },
  playmaking:  { passing: 2, technique: 1 },
  technique:   { technique: 2, speed: 1 },
  defending:   { defending: 2, strength: 1 },
  goalkeeping: { keeping: 3 },
  balanced:    {
    speed: 1, strength: 1, stamina: 1, passing: 1, technique: 1,
    finishing: 1, defending: 1, keeping: 1,
  },
};

// Physical attributes fade first — "legs before touch" — so decline is weighted toward them.
const DECLINE_WEIGHTS: Partial<Record<AttrKey, number>> = {
  speed: 3, stamina: 2, strength: 2,
  finishing: 1, defending: 1, passing: 1,
  technique: 0.5, keeping: 0.5,
};

// Tuning (deliberately modest — most players plateau well short of world class).
const BASE_MATCH = 0.07;   // per-played-match improvement base (tiny per match)
const BASE_SEASON = 0.30;  // per season-end "try" base — the bulk of development
const SEASON_TRIES = 50;   // weighted improvement attempts at season end
const ATTR_MAX = 99;
const ATTR_MIN = 1;

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Aptitude → growth multiplier. Low potential barely grows; high potential grows strongly. */
export function potentialFactor(potential: number): number {
  return clamp(0.15, 1.6, (potential - 35) / 40);
}

/** Young players learn fastest; growth tapers through the prime and is small when old. */
export function ageFactor(age: number): number {
  if (age <= 21) { return 1.5; }
  if (age <= 25) { return 1.2; }
  if (age <= 29) { return 1.0; }
  if (age <= 32) { return 0.6; }
  return 0.2;
}

/**
 * Training facilities scale gains modestly (the ceiling, above, carries the bigger gate to
 * full potential). `growthBonus` is the sum of every built Training wing's contribution
 * (FacilityManager.trainingAxes) — 0 with nothing built (the old worst case), up to roughly
 * +0.24 fully built (deliberately short of the old best case, since the new system also adds
 * genuinely new strategic depth the flat level never had).
 */
export function facilityFactor(growthBonus: number): number {
  return clamp(0.9, 1.5, 0.9 + growthBonus);
}

const CEILING_SPREAD = 18; // how gradually growth tapers as an attribute nears its ceiling

/**
 * The attribute level a player can realistically *approach* — set by potential and gated by
 * `ceilingBonus` (the sum of every built Training wing's ceiling contribution). A soft target,
 * not a hard cap: growth tapers asymptotically near it and variance means a player may fall
 * short, so reaching it is a chance, not a guarantee. -10 is the unfacilitated baseline (the old
 * worst case); each ceiling-axis wing adds to it.
 */
export function attainableCeiling(potential: number, ceilingBonus: number): number {
  return clamp(45, 99, potential - 10 + ceilingBonus);
}

/** Headroom toward the (potential- and facility-derived) ceiling; growth stops as it nears 0. */
export function headroom(attrValue: number, potential: number, ceilingBonus: number): number {
  return clamp(0, 1, (attainableCeiling(potential, ceilingBonus) - attrValue) / CEILING_SPREAD);
}

/** The chance a single attribute improves on one tick. */
export function improveChance(
  attrValue: number, potential: number, age: number, growthBonus: number, ceilingBonus: number, base: number,
): number {
  return clamp(0, 0.95,
    base * potentialFactor(potential) * ageFactor(age) * facilityFactor(growthBonus)
      * headroom(attrValue, potential, ceilingBonus));
}

/** Chance an old player declines at season end — 0 before 31, rising with age, eased by potential. */
export function declineChance(age: number, potential: number): number {
  if (age < 31) { return 0; }
  const base = clamp(0, 0.85, (age - 30) * 0.12);
  const potentialResist = clamp(0.5, 1, 1 - (potential - 50) / 200);
  return base * potentialResist;
}

/** Pick one attribute key from a weight table, deterministically given `rng`. */
function pickWeighted(weights: Partial<Record<AttrKey, number>>, rng: () => number): AttrKey {
  const entries = Object.entries(weights) as [AttrKey, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) { return key; }
  }
  return entries[entries.length - 1][0];
}

/**
 * A single played match: a *tiny* chance to improve one of the regiment's attributes by +1.
 * Returns the (possibly unchanged) attributes — never mutates the input.
 */
export function trainOnMatch(
  player: Player, regiment: RegimentId, growthBonus: number, ceilingBonus: number, rng: () => number,
): PlayerAttributes {
  const attr = pickWeighted(TRAINING_REGIMENTS[regiment], rng);
  const cur = player.attributes[attr];
  if (rng() < improveChance(cur, player.potential, player.age, growthBonus, ceilingBonus, BASE_MATCH)) {
    return { ...player.attributes, [attr]: Math.min(ATTR_MAX, cur + 1) };
  }
  return player.attributes;
}

export interface SeasonDevelopment {
  attributes: PlayerAttributes;
  age: number;
}

/**
 * The season-end development step for one player: several weighted improvement tries, an
 * age increment, and — for players 31+ — a chance to decline instead (physical-first).
 * An older player can still improve; decline is only a *chance*.
 */
export function developOverSeason(
  player: Player, regiment: RegimentId, growthBonus: number, ceilingBonus: number, rng: () => number,
): SeasonDevelopment {
  const attributes: PlayerAttributes = { ...player.attributes };

  for (let i = 0; i < SEASON_TRIES; i++) {
    const attr = pickWeighted(TRAINING_REGIMENTS[regiment], rng);
    if (rng() < improveChance(attributes[attr], player.potential, player.age, growthBonus, ceilingBonus, BASE_SEASON)) {
      attributes[attr] = Math.min(ATTR_MAX, attributes[attr] + 1);
    }
  }

  if (rng() < declineChance(player.age, player.potential)) {
    const attr = pickWeighted(DECLINE_WEIGHTS, rng);
    const drop = rng() < 0.4 ? 2 : 1;
    attributes[attr] = Math.max(ATTR_MIN, attributes[attr] - drop);
  }

  return { attributes, age: player.age + 1 };
}
