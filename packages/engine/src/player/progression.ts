import type { Player, PlayerAttributes, PlayerPosition } from '@fm2k/match';

/**
 * Player development (training). Pure and **rng-injected** so it is deterministic and
 * unit/mutation testable. `potential` is the *aptitude*: it scales the chance/magnitude of
 * improvement — it is **not a cap**. Growth is bounded instead by **diminishing returns**
 * (improving an already-high attribute is rare) and the **age curve** (older players slow
 * down and eventually decline), so not every player becomes world class.
 */

type AttrKey = keyof PlayerAttributes;

export type RegimentId =
  | 'goalkeeping' | 'defending' | 'passing' | 'crossing'
  | 'dribbling' | 'shooting' | 'heading' | 'physical' | 'recovery' | 'balanced';

export const REGIMENT_IDS: readonly RegimentId[] = [
  'goalkeeping', 'defending', 'passing', 'crossing',
  'dribbling', 'shooting', 'heading', 'physical', 'recovery', 'balanced',
];

export const DEFAULT_REGIMENT: RegimentId = 'balanced';

/** Human-readable labels for the UI. */
export const REGIMENT_LABELS: Record<RegimentId, string> = {
  goalkeeping: 'Goalkeeping',
  defending:   'Defending',
  passing:     'Passing',
  crossing:    'Crossing',
  dribbling:   'Dribbling',
  shooting:    'Shooting',
  heading:     'Heading',
  physical:    'Physical',
  recovery:    'Recovery',
  balanced:    'Balanced',
};

/** One-line description of what each regiment develops — shown in the UI guide. */
export const REGIMENT_DESCRIPTIONS: Record<RegimentId, string> = {
  goalkeeping: 'Trains goalkeeping',
  defending:   'Trains defending, with supporting gains in strength, stamina and speed',
  passing:     'Trains passing and technique',
  crossing:    'Trains passing and speed',
  dribbling:   'Trains speed and technique',
  shooting:    'Trains finishing, with supporting gains in technique',
  heading:     'Trains strength, with supporting gains in finishing and defending',
  physical:    'Trains speed, strength and stamina equally — best for young players',
  recovery:    'Trains stamina lightly, with a significantly faster fitness recovery rate',
  balanced:    'Trains every attribute equally — outfield players do not train goalkeeping',
};

/**
 * Which attributes each regiment trains, and the relative weight a gain is directed into.
 * `recovery` trains stamina lightly — its main benefit is a fitness recovery bonus applied
 * in ClubManager.recoverFitness (RECOVERY_REGIMENT_MULT).
 */
export const TRAINING_REGIMENTS: Record<RegimentId, Partial<Record<AttrKey, number>>> = {
  goalkeeping: { goalkeeping: 1 },
  defending:   { defending: 2, strength: 1, stamina: 1, speed: 1 },
  passing:     { passing: 2, technique: 2 },
  crossing:    { passing: 2, speed: 2 },
  dribbling:   { speed: 2, technique: 2 },
  shooting:    { finishing: 3, technique: 1 },
  heading:     { strength: 2, finishing: 1, defending: 1 },
  physical:    { speed: 1, strength: 1, stamina: 1 },
  recovery:    { stamina: 1 },
  balanced:    {
    speed: 1, strength: 1, stamina: 1, passing: 1, technique: 1,
    finishing: 1, defending: 1, goalkeeping: 1,
  },
};

function withoutGoalkeeping(
  weights: Partial<Record<AttrKey, number>>,
): Partial<Record<AttrKey, number>> {
  return Object.fromEntries(
    Object.entries(weights).filter(([attr]) => attr !== 'goalkeeping'),
  ) as Partial<Record<AttrKey, number>>;
}

/**
 * The attributes a regiment actually trains *for this player*. Identical to the raw table for a
 * keeper; for everyone else `goalkeeping` is stripped out.
 *
 * Goalkeeping is the one position-exclusive attribute, and leaving it in an outfielder's pool was
 * badly distorting: it is generated low and never read by the match engine, so its gap to the
 * ceiling is always wide and a try spent on it converts almost every time. Balanced banked half its
 * entire output there — free progress that changed nothing on the pitch, and worse, it made
 * switching a player *off* Balanced look like the estate had stopped working, when all that
 * happened was that the padding went away and the real (unchanged) development showed through.
 */
export function regimentWeights(
  regiment: RegimentId, position: PlayerPosition,
): Partial<Record<AttrKey, number>> {
  if (position === 'GK') { return TRAINING_REGIMENTS[regiment]; }
  const outfield = withoutGoalkeeping(TRAINING_REGIMENTS[regiment]);
  // The Goalkeeping regiment trains nothing an outfielder can use. The UI does not offer it to
  // them, so this is a guard for older saves rather than a route anyone takes on purpose — fall
  // back to general work instead of leaving an empty table for `pickWeighted`.
  if (Object.keys(outfield).length === 0) { return regimentWeights('balanced', position); }
  return outfield;
}

/** Extra fitness recovery multiplier applied when a player is on the Recovery regiment. */
export const RECOVERY_REGIMENT_MULT = 2.2;

// Physical attributes fade first — "legs before touch" — so decline is weighted toward them.
const DECLINE_WEIGHTS: Partial<Record<AttrKey, number>> = {
  speed: 3, stamina: 2, strength: 2,
  finishing: 1, defending: 1, passing: 1,
  technique: 0.5, goalkeeping: 0.5,
};

// Tuning (deliberately modest — most players plateau well short of world class).
/** Per-played-match improvement base (tiny per match). Exported so tests can derive the exact
 *  chance a training tick uses instead of restating it. */
export const MATCH_TRAINING_BASE = 0.07;
const BASE_SEASON = 0.30;  // per season-end "try" base — the bulk of development
/** Weighted improvement attempts at season end. Exported so tests can script an exact rng
 *  sequence through a season instead of hard-coding a draw count that silently drifts. */
export const SEASON_TRIES = 50;
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
 * What a club's training estate contributes to one player's development. `FacilityManager
 * .trainingAxes` produces this per player, so the position- and age-scoped wings have already
 * been resolved by the time it arrives here — these numbers apply to *this* player unconditionally.
 */
export interface GrowthAxes {
  /** Growth that applies to every attribute alike. */
  growthBonus: number
  /** How near potential this player can get — see `attainableCeiling`. */
  ceilingBonus: number
  /** Extra growth for named attributes only, on top of `growthBonus`. A gym develops legs and
   *  a technical pitch develops touch; this is what stops every wing being interchangeable. */
  attrGrowthBonus?: Partial<Record<AttrKey, number>>
  /** Multiplier on the season-end decline chance for players past 30. 1 = unfacilitated. */
  declineResist?: number
  /** Treat a player's potential as at least this, for development purposes only. Potential gates
   *  the improvement *rate* (`potentialFactor`) as well as the ceiling, so lifting it is what lets
   *  a club develop a limited player at the same speed as a good prospect — a facility that turns
   *  anyone into a usable starter. Worth nothing to a player already above it. */
  potentialFloor?: number
}

/** The growth bonus that actually applies to one attribute: the broad figure plus whatever
 *  the attribute-specific wings add for it. */
function growthFor(axes: GrowthAxes, attr: AttrKey): number {
  return axes.growthBonus + (axes.attrGrowthBonus?.[attr] ?? 0);
}

/**
 * Training facilities scale gains modestly (the ceiling, above, carries the bigger gate to
 * full potential). The argument is the effective bonus for the attribute being trained — the
 * broad `growthBonus` plus any `attrGrowthBonus` for it. 0 with nothing built; a complete
 * estate reaches roughly +0.35 for a player its specialist wings cover.
 */
export function facilityFactor(growthBonus: number): number {
  return clamp(0.9, 1.5, 0.9 + growthBonus);
}

const CEILING_SPREAD = 18; // how gradually growth tapers as an attribute nears its ceiling

/** The `ceilingBonus` at which a player's ceiling equals their potential exactly. Below it an
 *  estate is helping players reach what they always had in them; above it they surpass it. */
export const CEILING_THRESHOLD = 10;

/**
 * The attribute level a player can realistically *approach* — set by potential and gated by
 * `ceilingBonus` (the sum of every built Training wing's ceiling contribution). A soft target,
 * not a hard cap: growth tapers asymptotically near it and variance means a player may fall
 * short, so reaching it is a chance, not a guarantee. -10 is the unfacilitated baseline (the old
 * worst case); each ceiling-axis wing adds to it.
 *
 * **10 is the threshold that matters.** Below it the estate is closing the gap to potential —
 * a player at a poorly-equipped club never finds out what they could have been. At exactly 10
 * the ceiling *is* potential. Above it the player develops past their potential, which is why
 * `CEILING_THRESHOLD` wings are premium and rare: reaching potential is what a good training
 * ground does, and exceeding it is what a world-class one does.
 *
 * A `potentialFloor` (see `GrowthAxes`) reaches this by raising the `potential` passed in, so it
 * lifts the ceiling and the growth rate together rather than uncapping a player who still cannot
 * move.
 */
export function attainableCeiling(potential: number, ceilingBonus: number): number {
  return clamp(45, 99, potential - 10 + ceilingBonus);
}

/** Residual headroom *at* the ceiling, as a fraction of a full-headroom try. The ceiling severely
 *  limits growth rather than forbidding it: a player who has arrived still improves occasionally,
 *  so stagnation reads as a plateau a player drifts into, not a wall they hit on a fixed date. */
const HEADROOM_TAIL = 0.20;
/** Attribute points past the ceiling over which the residual falls by 1/e. Without this decay the
 *  residual would be a permanent licence to keep climbing and every long career would trend to 99;
 *  with it, going further past the ceiling costs exponentially more, so careers settle. */
const HEADROOM_TAIL_DECAY = 6;

/**
 * Headroom toward the (potential- and facility-derived) ceiling. Falls linearly over
 * `CEILING_SPREAD` points as an attribute approaches the ceiling, then — instead of hitting zero —
 * flattens into `HEADROOM_TAIL` and decays exponentially beyond it.
 *
 * The tail is the difference between a cap and a plateau. With a hard zero, a player whose
 * attribute reached the ceiling could *never* improve it again: a squad full of modest potentials
 * showed literally no movement at season end, which reads as the game being broken rather than as
 * players having peaked. With the tail they still edge up now and then, ever more rarely, until
 * age-driven decline overtakes the gains and they start slipping — a career arc rather than a wall.
 */
export function headroom(attrValue: number, potential: number, ceilingBonus: number): number {
  const gap = attainableCeiling(potential, ceilingBonus) - attrValue;
  const ramp = clamp(0, 1, gap / CEILING_SPREAD);
  const tail = HEADROOM_TAIL * Math.exp(Math.min(0, gap) / HEADROOM_TAIL_DECAY);
  return Math.max(ramp, tail);
}

/** The chance a single attribute improves on one tick. */
export function improveChance(
  attrValue: number, potential: number, age: number, growthBonus: number, ceilingBonus: number, base: number,
): number {
  return clamp(0, 0.95,
    base * potentialFactor(potential) * ageFactor(age) * facilityFactor(growthBonus)
      * headroom(attrValue, potential, ceilingBonus));
}

/** The potential a player is *developed as*: their own, or the floor a training estate guarantees.
 *  Deliberately not used for decline resistance — the floor is a development facility, not a
 *  reason a limited 33-year-old holds their legs together. */
function developedPotential(player: Player, axes: GrowthAxes): number {
  return Math.max(player.potential, axes.potentialFloor ?? 0);
}

/** Chance an old player declines at season end — 0 before 31, rising with age, eased by potential
 *  and by `declineResist` (individual coaching: the one axis that helps the players you already
 *  have rather than the ones you are growing). */
export function declineChance(age: number, potential: number, declineResist = 1): number {
  if (age < 31) { return 0; }
  const base = clamp(0, 0.85, (age - 30) * 0.12);
  const potentialResist = clamp(0.5, 1, 1 - (potential - 50) / 200);
  return base * potentialResist * declineResist;
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
  player: Player, regiment: RegimentId, axes: GrowthAxes, rng: () => number,
): PlayerAttributes {
  const attr = pickWeighted(regimentWeights(regiment, player.position), rng);
  const cur = player.attributes[attr];
  const chance = improveChance(
    cur, developedPotential(player, axes), player.age, growthFor(axes, attr), axes.ceilingBonus, MATCH_TRAINING_BASE,
  );
  if (rng() < chance) {
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
  player: Player, regiment: RegimentId, axes: GrowthAxes, rng: () => number,
): SeasonDevelopment {
  const attributes: PlayerAttributes = { ...player.attributes };

  for (let i = 0; i < SEASON_TRIES; i++) {
    const attr = pickWeighted(regimentWeights(regiment, player.position), rng);
    const chance = improveChance(
      attributes[attr], developedPotential(player, axes), player.age, growthFor(axes, attr),
      axes.ceilingBonus, BASE_SEASON,
    );
    if (rng() < chance) {
      attributes[attr] = Math.min(ATTR_MAX, attributes[attr] + 1);
    }
  }

  if (rng() < declineChance(player.age, player.potential, axes.declineResist ?? 1)) {
    const attr = pickWeighted(DECLINE_WEIGHTS, rng);
    const drop = rng() < 0.4 ? 2 : 1;
    attributes[attr] = Math.max(ATTR_MIN, attributes[attr] - drop);
  }

  return { attributes, age: player.age + 1 };
}

/** Default training regiment for a player based on position and age. Age overrides position:
 *  young players build their athletic base; older players prioritise recovery. */
export function defaultRegiment(position: PlayerPosition, age: number): RegimentId {
  if (age <= 21) { return 'physical'; }
  if (age >= 31) { return 'balanced'; }
  switch (position) {
    case 'GK':            return 'goalkeeping';
    case 'CB':            return 'defending';
    case 'LB': case 'RB': return 'crossing';
    case 'LM': case 'RM': case 'CM': return 'passing';
    case 'LW': case 'RW': return 'dribbling';
    case 'ST':            return 'shooting';
  }
}
