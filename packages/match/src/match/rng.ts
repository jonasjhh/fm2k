/** Small deterministic PRNG (mulberry32) — reproducible streams from a numeric seed.
 *  Lives in its own module so both the distribution harness and the simulator (which
 *  derives its dedicated injury stream from one main-stream draw) can use it without
 *  an import cycle. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A team's per-match "form": how their day breaks in the final third. Both values are
 *  in shot-conversion-probability points and fold into the shot duel's additive bonus
 *  (see `shotBonus` in flow.ts) — nothing else. Positive = a good day. */
export interface MatchForm {
  /** Clinical-ness: added to this team's own shot-duel bonus (hot → more goals). */
  attack: number;
  /** Solidity: subtracted from opponents' shot-duel bonus (solid → keeps them out). */
  defense: number;
}

/** Neutral form — no effect on conversion. Use for fully deterministic tests. */
export const NEUTRAL_MATCH_FORM: MatchForm = { attack: 0, defense: 0 };

/** Standard deviation (conversion-prob points) of the per-match form draw. Kept small so
 *  form decides *whether chances go in*, never territory — tactics stay dominant. */
export const MATCH_FORM_SIGMA = 0.05;
/** Hard cap (±) on either component, so no team ever draws an absurd day. */
export const MATCH_FORM_CAP = 0.1;

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** One standard-normal sample via Box–Muller, consuming two draws from `rng`. */
function gaussian(rng: () => number): number {
  // guard the log against an exact 0 draw
  const u1 = rng() || Number.EPSILON;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Draw a team's per-match form: two independent Gaussian components (attack, defense),
 *  centred on `mean` (0 for pure noise; a form bias when supplied), clamped to ±CAP.
 *  Consumes exactly four rng draws. Deterministic for a seeded rng. */
export function drawMatchForm(
  rng: () => number,
  mean: { attack?: number; defense?: number } = {},
): MatchForm {
  return {
    attack: clamp(-MATCH_FORM_CAP, MATCH_FORM_CAP, (mean.attack ?? 0) + gaussian(rng) * MATCH_FORM_SIGMA),
    defense: clamp(-MATCH_FORM_CAP, MATCH_FORM_CAP, (mean.defense ?? 0) + gaussian(rng) * MATCH_FORM_SIGMA),
  };
}
