// The five core duels of the v2 engine (REWORK_01.md §3) — every contest in a match
// is one of these, named after the two attributes it pits against each other. A duel
// produces a MARGIN, not just a winner: margins drive escalation, loose-ball
// favourability, shot quality and foul probability. One rng draw per duel.
//
// Follows the CheckSpec precedent (skill-checks.ts): each duel is a named, exported,
// tunable spec object so it can be tested and calibrated in isolation.

import type { PlayerAttributes } from '../../shared/types.ts';

export type DuelType = 'speed' | 'strength' | 'dribble' | 'pass' | 'shot';

export interface DuelSpec {
  readonly type: DuelType;
  /** The acting side's attribute (the carrier / runner / passer / shooter). */
  readonly attackerAttr: keyof PlayerAttributes;
  /** The resisting side's attribute. */
  readonly defenderAttr: keyof PlayerAttributes;
  /** Attacker win probability when both attributes are equal. */
  readonly baseChance: number;
  /** Attribute-difference points needed to shift the probability by 1.0. */
  readonly spread: number;
  readonly lo: number;
  readonly hi: number;
}

/** Symmetric physical races/contests: even odds at equal skill, meaningfully skill-elastic. */
export const SPEED_DUEL: DuelSpec = {
  type: 'speed', attackerAttr: 'speed', defenderAttr: 'speed',
  baseChance: 0.5, spread: 900, lo: 0.08, hi: 0.92,
};

export const STRENGTH_DUEL: DuelSpec = {
  type: 'strength', attackerAttr: 'strength', defenderAttr: 'strength',
  baseChance: 0.5, spread: 900, lo: 0.08, hi: 0.92,
};

/** Take-on: Technique vs Defending. The defender is slightly favoured at equal skill —
 *  beating your man should feel earned. */
export const DRIBBLE_DUEL: DuelSpec = {
  type: 'dribble', attackerAttr: 'technique', defenderAttr: 'defending',
  baseChance: 0.44, spread: 1000, lo: 0.08, hi: 0.9,
};

/** Pass vs read: Passing vs Defending. Most passes complete — the duel is against the
 *  best-positioned reader, and interceptions are the exception, not the rule. */
export const PASS_DUEL: DuelSpec = {
  type: 'pass', attackerAttr: 'passing', defenderAttr: 'defending',
  baseChance: 0.78, spread: 1200, lo: 0.45, hi: 0.97,
};

/** Shot: Finishing vs Keeping. Goals are rare; the spread is flat so a hot striker
 *  against a poor keeper converts noticeably more, not absurdly more. */
export const SHOT_DUEL: DuelSpec = {
  type: 'shot', attackerAttr: 'finishing', defenderAttr: 'keeping',
  baseChance: 0.16, spread: 800, lo: 0.02, hi: 0.45,
};

/** Penalty: heavily attacker-favoured, compressed spread — (Finishing+Technique)/2 vs
 *  Keeping (the caller blends the attacker attribute; the spec still names finishing). */
export const PENALTY_DUEL: DuelSpec = {
  type: 'shot', attackerAttr: 'finishing', defenderAttr: 'keeping',
  baseChance: 0.76, spread: 300, lo: 0.6, hi: 0.9,
};

export const ALL_DUEL_SPECS: readonly DuelSpec[] = [
  SPEED_DUEL, STRENGTH_DUEL, DRIBBLE_DUEL, PASS_DUEL, SHOT_DUEL, PENALTY_DUEL,
];

export interface DuelModifiers {
  /** Flat probability shift on the attacker's win chance (second defender, delivery
   *  quality, momentum, wall/distance on set pieces …). */
  readonly bonus?: number;
}

export interface DuelOutcome {
  readonly spec: DuelSpec;
  readonly attackerWins: boolean;
  /** Signed margin in (-1, 1): chance − roll. Positive = attacker won by that much
   *  headroom; the magnitude is the "how badly" every downstream rule reads. */
  readonly margin: number;
  /** The attacker's final win probability after modifiers (for tests/telemetry). */
  readonly chance: number;
}

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Attacker win probability for a duel, before the roll. */
export function duelChance(
  attackerSkill: number, defenderSkill: number, spec: DuelSpec, mods?: DuelModifiers,
): number {
  return clamp(spec.lo, spec.hi,
    spec.baseChance + (attackerSkill - defenderSkill) / spec.spread + (mods?.bonus ?? 0));
}

/** Resolve one duel. Consumes exactly one rng draw. */
export function resolveDuel(
  attackerSkill: number, defenderSkill: number, spec: DuelSpec,
  rng: () => number, mods?: DuelModifiers,
): DuelOutcome {
  const chance = duelChance(attackerSkill, defenderSkill, spec, mods);
  const roll = rng();
  return { spec, attackerWins: roll < chance, margin: chance - roll, chance };
}

// ── escalation rule (REWORK_01.md §3) ───────────────────────────────────────────
// A speed duel won by a LARGE margin is a clean escape; a NARROW win drops into a
// strength duel (the defender arrives in time to make it physical). Pure pace beats
// you cleanly or not at all; pace + strength always wins the second phase.

export const CLEAN_ESCAPE_MARGIN = 0.22;

/** Does a won speed duel escalate into a strength duel? */
export function escalates(outcome: DuelOutcome): boolean {
  return outcome.attackerWins && outcome.margin < CLEAN_ESCAPE_MARGIN;
}

// ── delivery checks (REWORK_01.md §3) ───────────────────────────────────────────
// Any long-distance ball (cross, long ball, switch, corner, free-kick delivery) is
// first a solo Passing check whose margin modifies the receiving duel: bad delivery →
// the receiving contest starts as a loose ball; great delivery → receiver bonus.

export interface DeliverySpec {
  readonly baseChance: number;
  readonly spread: number;
  readonly lo: number;
  readonly hi: number;
  /** Static resist skill when the caller has no live defender to read the ball
   *  (e.g. the long throw checks pure technique-of-the-throw vs a fixed bar). */
  readonly anchor?: number;
}

export const CROSS_DELIVERY: DeliverySpec = { baseChance: 0.55, spread: 250, lo: 0.2, hi: 0.9 };
/** Long throw into the box (§4): checked against the taker's STRENGTH, not Passing.
 *  Anchored at 80 — a 65-strength taker barely clears the bar, a 90 is a weapon. */
export const LONG_THROW_DELIVERY: DeliverySpec = { baseChance: 0.5, spread: 60, lo: 0.15, hi: 0.85, anchor: 80 };
export const LONG_BALL_DELIVERY: DeliverySpec = { baseChance: 0.6, spread: 250, lo: 0.25, hi: 0.92 };
export const THROUGH_BALL_DELIVERY: DeliverySpec = { baseChance: 0.5, spread: 220, lo: 0.15, hi: 0.88 };
export const SET_PIECE_DELIVERY: DeliverySpec = { baseChance: 0.65, spread: 250, lo: 0.3, hi: 0.94 };

export interface DeliveryOutcome {
  readonly onTarget: boolean;
  /** Signed margin (chance − roll); positive scale feeds the receiver's duel bonus. */
  readonly margin: number;
}

/** Solo Passing check for a long-distance ball. Consumes exactly one rng draw.
 *  `resist` is the defensive read on the ball (nearest defender's Defending) so
 *  delivery quality is relative, not absolute — without it the spec's anchor
 *  (default 50) keeps legacy behaviour. */
export function deliveryCheck(
  passing: number, spec: DeliverySpec, rng: () => number, resist?: number,
): DeliveryOutcome {
  const bar = resist ?? spec.anchor ?? 50;
  const chance = clamp(spec.lo, spec.hi, spec.baseChance + (passing - bar) / spec.spread);
  const roll = rng();
  return { onTarget: roll < chance, margin: chance - roll };
}

/** Delivery margin → flat bonus on the receiver's duel (great ball = easier contest). */
export const DELIVERY_BONUS_SCALE = 0.2;
export function deliveryBonus(delivery: DeliveryOutcome): number {
  return clamp(-0.1, 0.1, delivery.margin * DELIVERY_BONUS_SCALE);
}

// ── emergent fouls (REWORK_01.md §4) ────────────────────────────────────────────
// Fouls are never rolled independently: a strength or dribble duel that the DEFENDER
// loses badly has a foul probability scaled by the loss margin — the lunge that comes
// in late because he was already beaten.

export const FOUL_MARGIN_FLOOR = 0.12;   // losses narrower than this never foul
export const FOUL_MARGIN_SCALE = 0.55;   // probability per unit of margin beyond the floor
export const FOUL_CHANCE_CAP = 0.3;

/** Probability the beaten defender fouls, given the attacker's winning margin. */
export function foulChance(outcome: DuelOutcome): number {
  if (!outcome.attackerWins) { return 0; }
  if (outcome.spec.type !== 'strength' && outcome.spec.type !== 'dribble') { return 0; }
  return clamp(0, FOUL_CHANCE_CAP, (outcome.margin - FOUL_MARGIN_FLOOR) * FOUL_MARGIN_SCALE);
}

// ── last-man professional foul (REWORK_01.md §4) ────────────────────────────────
// A defender beaten in a speed race in the final band with NO spare man behind him
// gets a choice-weighted roll: haul the runner down (a card is certain, red likely)
// or hope the keeper saves. Only reachable escapes can be fouled — a runner clear
// by a big margin is out of grabbing range, so the cynical option scales inversely
// with how cleanly he was beaten.

export const PRO_FOUL_REACH = 0.35;       // race margins beyond this put the runner out of reach
export const PRO_FOUL_CHANCE = 0.4;       // the choice: cynical foul vs trust the keeper
export const PRO_FOUL_RED_CHANCE = 0.7;   // denying a clear goalscoring chance

/** Probability the beaten last man commits a professional foul. The caller is
 *  responsible for the positional conditions (final band, no spare man). */
export function lastManFoulChance(outcome: DuelOutcome): number {
  if (!outcome.attackerWins || outcome.spec.type !== 'speed') { return 0; }
  return outcome.margin < PRO_FOUL_REACH ? PRO_FOUL_CHANCE : 0;
}
