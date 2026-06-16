import type { Formation, Player, PlayerAttributes, Position } from '../shared/types.ts';
import { type MatchParameters } from '../tactics/match-parameters.ts';
import { FIELD_LINE, type FieldLine } from './action-selector.ts';

/**
 * In-match fatigue model — pure, deterministic, and isolated here so the energy
 * maths can be unit/mutation-tested without running a whole match.
 *
 * Energy is 0..100 per player (100 = fresh). Each minute a player on the pitch
 * loses `perMinuteDrain(...)` energy; `fatigueMultiplier(...)` then scales their
 * effective attributes for that minute. The drain reacts to how hard the team is
 * being asked to run (tempo + press + the reserved `fatigueRate` param), how much
 * the role runs (position load, shaped by the formation), and the player's own
 * stamina (resistance). All param factors are exactly 1.0 at neutral (50).
 */

// ── tuning constants (Phase E will rebalance these over the whole sim) ──────────
const BASE_DRAIN = 0.22;            // reference energy/min before any factor

function norm(attr: number): number { return Math.max(0, Math.min(1, attr / 99)); }

/** How much a role runs, by pitch line (before the formation shape adjustment). */
const LINE_BASE_LOAD: Record<FieldLine, number> = {
  GK: 0.3, DEF: 0.8, MID: 1.2, ATT: 1.0,
};

/**
 * Formation shape adjustments (multipliers on the line base; omitted = 1.0).
 * Captures where a shape makes a line cover more ground: wing-backs in a back five
 * bomb on, a lone striker presses alone, a packed midfield shares the load, an
 * exposed front line scrambles back.
 */
const FORMATION_LOAD: Partial<Record<Formation, Partial<Record<FieldLine, number>>>> = {
  '5-3-2':   { DEF: 1.25 },             // wing-backs cover the whole flank
  '5-4-1':   { DEF: 1.20, ATT: 1.30 },  // wing-backs + a lone striker chasing
  '3-5-2':   { DEF: 1.20, MID: 1.15 },  // back three + driving wide midfielders
  '4-5-1':   { MID: 0.90, ATT: 1.30 },  // crowded midfield shares it; striker isolated
  '4-1-4-1': { MID: 0.92, ATT: 1.25 },
  '4-2-4':   { DEF: 1.10, ATT: 1.15 },  // thin midfield leaves both lines exposed
};

/** Running load of a role in a given formation. */
export function positionLoad(formation: Formation, position: Position): number {
  const line = FIELD_LINE[position];
  const shape = FORMATION_LOAD[formation]?.[line] ?? 1;
  return LINE_BASE_LOAD[line] * shape;
}

/** Higher stamina → less energy burned (≈1.32 at stamina 20 → 0.61 at stamina 99). */
export function staminaResistance(stamina: number): number {
  return 1.5 - 0.9 * norm(stamina);
}

/** Tempo param → drain factor (1.0 at neutral 50; running faster costs more). */
export function tempoFactor(tempo: number): number { return 0.7 + 0.6 * (tempo / 100); }

/** Press param → drain factor (1.0 at neutral 50; pressing harder costs more). */
export function pressFactor(pressIntensity: number): number { return 0.8 + 0.4 * (pressIntensity / 100); }

/** The reserved `fatigueRate` param, finally consumed (1.0 at neutral 50). */
export function fatigueRateFactor(fatigueRate: number): number { return 0.7 + 0.6 * (fatigueRate / 100); }

/** Energy a player loses this minute given the team's params and the player. */
export function perMinuteDrain(
  player: Player,
  formation: Formation,
  params: MatchParameters,
): number {
  return BASE_DRAIN
    * positionLoad(formation, player.position)
    * tempoFactor(params.tempo)
    * pressFactor(params.pressIntensity)
    * fatigueRateFactor(params.fatigueRate)
    * staminaResistance(player.attributes.stamina);
}

// ── effect on attributes ────────────────────────────────────────────────────
// Tiredness hits the legs before the touch: physical attributes fall further than
// technical/mental ones at the same energy. Both are 1.0 when fresh.

/** Physical multiplier: 100→1.0, 50→~0.86, 0→~0.72. */
export function physicalFatigueMult(energy: number): number {
  return 0.72 + 0.28 * (Math.max(0, Math.min(100, energy)) / 100);
}

/** Skill multiplier: 100→1.0, 50→~0.93, 0→~0.85 (touch degrades more slowly). */
export function skillFatigueMult(energy: number): number {
  return 0.85 + 0.15 * (Math.max(0, Math.min(100, energy)) / 100);
}

const PHYSICAL_KEYS: (keyof PlayerAttributes)[] = ['speed', 'strength', 'agility', 'stamina'];

/** A copy of the player's attributes scaled for current energy (legs before touch). */
export function applyFatigue(attrs: PlayerAttributes, energy: number): PlayerAttributes {
  const phys = physicalFatigueMult(energy);
  const skill = skillFatigueMult(energy);
  const out = {} as PlayerAttributes;
  for (const key of Object.keys(attrs) as (keyof PlayerAttributes)[]) {
    const mult = PHYSICAL_KEYS.includes(key) ? phys : skill;
    out[key] = attrs[key] * mult;
  }
  return out;
}
