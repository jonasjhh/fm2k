// The RPG core of the match engine: every micro-outcome is an explicit, named
// skill check — a probability centred on a parity value and shifted by the skill
// difference of the players involved, then rolled on the injected rng.
//
// `checkChance` is the single formula (the same `clamp(lo, hi, parity + diff/spread)`
// every generator historically used inline); the named wrappers below give each
// check its football meaning and its own tunable spec. See MATCH-PIPELINE.md for
// where each check sits in the action pipeline.

export interface CheckSpec {
  /** Probability when both sides are equally skilled. */
  parity: number;
  /** Skill-difference points needed to shift the probability by 1.0 (bigger = flatter). */
  spread: number;
  lo: number;
  hi: number;
}

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Probability that the acting side succeeds, given both sides' relevant skill. */
export function checkChance(skill: number, opposingSkill: number, spec: CheckSpec): number {
  return clamp(spec.lo, spec.hi, spec.parity + (skill - opposingSkill) / spec.spread);
}

/** Roll the check: true = the acting side succeeds. Consumes exactly one rng draw. */
export function opposedCheck(skill: number, opposingSkill: number, spec: CheckSpec, rng: () => number): boolean {
  return rng() < checkChance(skill, opposingSkill, spec);
}

// ── perception ────────────────────────────────────────────────────────────────
// Whether the player on the ball *sees* a hard option at all. Rolled per candidate
// action before weighing; failing removes the option ("she didn't spot the run").
// Centred on an average awareness of 50, so ordinary players see the killer ball
// a bit over half the time and elite playmakers almost always do.

export const VISION_SPECS: Record<'through_ball' | 'long_pass', CheckSpec> = {
  // The defence-splitting run is the hardest thing to see.
  through_ball: { parity: 0.55, spread: 70, lo: 0.30, hi: 0.95 },
  // The switch/long ball is easier to pick out.
  long_pass: { parity: 0.75, spread: 90, lo: 0.50, hi: 0.98 },
};

/** Does the player perceive this hard-to-see option this action? One rng draw. */
export function visionCheck(
  awareness: number,
  option: keyof typeof VISION_SPECS,
  rng: () => number,
): boolean {
  return opposedCheck(awareness, 50, VISION_SPECS[option], rng);
}

// ── engagement ────────────────────────────────────────────────────────────────
// After a carrier beats the first defender, does a second one step in? Driven by
// the defending side's press intensity and how dangerous the zone is for them —
// a committed press traps with two, a passive block lets the carry run.

const ENGAGEMENT_BASE = 0.22;
const ENGAGEMENT_PRESS_SPAN = 0.28; // + up to this at maximum press intensity
const ENGAGEMENT_ZONE_BONUS: Record<string, number> = {
  away_box: 0.15,   // their own box: bodies converge
  away_third: 0.10, // their defensive third
  middle_third: 0,
  home_third: -0.08,
  home_box: -0.12,
};

/** Probability a second defender engages the carrier (no rng — caller rolls). */
export function engagementChance(pressIntensity: number, zone: string): number {
  const press = ENGAGEMENT_BASE + (pressIntensity / 100) * ENGAGEMENT_PRESS_SPAN;
  return clamp(0, 0.6, press + (ENGAGEMENT_ZONE_BONUS[zone] ?? 0));
}

/** A beaten press is committed: the second defender's win chance is scaled down by this. */
export const SECOND_DEFENDER_FACTOR = 0.6;

// ── receiver ──────────────────────────────────────────────────────────────────
// A completed through ball still has to be brought down at speed: the runner's
// first touch (technique + composure under pressure) against the defence's read.
// Failing sends the ball running loose to the defence.

export const FIRST_TOUCH_SPEC: CheckSpec = { parity: 0.82, spread: 250, lo: 0.55, hi: 0.95 };

/** Does the receiver control the through ball cleanly? One rng draw. */
export function firstTouchCheck(receiverSkill: number, defenceRead: number, rng: () => number): boolean {
  return opposedCheck(receiverSkill, defenceRead, FIRST_TOUCH_SPEC, rng);
}
