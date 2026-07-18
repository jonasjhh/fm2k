import type { Player, PlayerAttributes } from '../shared/types.ts';
import type { TeamTacticsIntent, TacticalStyleId } from './intent-types.ts';

type AttrWeights = Partial<Record<keyof PlayerAttributes, number>>;

/**
 * Which attributes a squad needs to execute each style well. Weights sum to ~1
 * so a profile score stays on the 1..99 attribute scale before normalising.
 */
const STYLE_PROFILES: Record<TacticalStyleId, AttrWeights> = {
  keep_the_ball:    { passing: 0.5, technique: 0.5 },
  press_high:       { stamina: 0.35, speed: 0.3, defending: 0.2, strength: 0.15 },
  hit_on_counter:   { speed: 0.45, finishing: 0.3, technique: 0.25 },
  long_ball:        { strength: 0.35, finishing: 0.3, speed: 0.2, passing: 0.15 },
  attack_the_wings: { speed: 0.35, passing: 0.3, technique: 0.2, finishing: 0.15 },
  defend_deep:      { defending: 0.7, strength: 0.3 },
  balanced:         {
    passing: 0.16, technique: 0.16, defending: 0.16, speed: 0.16,
    finishing: 0.16, strength: 0.1, stamina: 0.1,
  },
};

/** The generic ability to defend against an opponent's attack. */
const DEFENSIVE_PROFILE: AttrWeights = {
  defending: 0.55, strength: 0.25, stamina: 0.2,
};

function weightedAttr(attrs: PlayerAttributes, weights: AttrWeights): number {
  let sum = 0;
  for (const key in weights) {
    const w = weights[key as keyof PlayerAttributes];
    if (w !== undefined) { sum += attrs[key as keyof PlayerAttributes] * w; }
  }
  return sum;
}

/** Suitability of a perfectly ordinary squad — a profile that matches the squad's own
 *  level exactly. Suitability measures FIT (does this squad's shape match the job?),
 *  not quality: absolute skill is contested duel by duel, so a squad whose profile
 *  attrs simply equal its overall level scores this baseline at any tier. */
export const BASELINE_SUIT = 0.46;

const OUTFIELD_ATTRS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'passing', 'finishing', 'technique', 'defending', 'stamina',
];

function meanOutfieldAttr(xi: Player[]): number {
  const total = xi.reduce((acc, p) =>
    acc + OUTFIELD_ATTRS.reduce((s, k) => s + p.attributes[k], 0) / OUTFIELD_ATTRS.length, 0);
  return Math.max(1, total / xi.length);
}

function profileScore(weights: AttrWeights, xi: Player[]): number {
  if (xi.length === 0) { return BASELINE_SUIT; }
  const total = xi.reduce((acc, p) => acc + weightedAttr(p.attributes, weights), 0);
  const avg = total / xi.length;
  // Relative to the squad's own level: >1 means the profile plays to its strengths.
  const ratio = avg / meanOutfieldAttr(xi);
  return Math.max(0, Math.min(1, BASELINE_SUIT * ratio));
}

/** How well the XI fits its own chosen style — 0..1. The primary driver of effectiveness. */
export function squadSuitability(intent: TeamTacticsIntent, xi: Player[]): number {
  return profileScore(STYLE_PROFILES[intent.style], xi);
}

/** How well the XI is equipped to defend, regardless of its own style — 0..1. */
export function defensiveSuitability(xi: Player[]): number {
  return profileScore(DEFENSIVE_PROFILE, xi);
}

/**
 * Asymmetric attack effectiveness (0..1). Driven mainly by the attacker's own
 * suitability; the opponent's defensive suitability only shaves a little off a
 * well-suited side but punishes a poorly-suited one harder. The `(1 - ownSuit)`
 * factor makes the opponent term vanish as ownSuit → 1 and grow as ownSuit → 0.
 */
export function attackEffectiveness(ownSuit: number, oppDefSuit: number, k = 0.3): number {
  return ownSuit * (1 - oppDefSuit * k * (1 - ownSuit));
}
