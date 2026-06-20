import type { Player, PlayerAttributes } from '../shared/types.ts';
import type { TeamTacticsIntent, TacticalStyleId } from './intent-types.ts';

/** Attribute scale midpoint (attributes run 1..99). */
const ATTR_MAX = 99;

type AttrWeights = Partial<Record<keyof PlayerAttributes, number>>;

/**
 * Which attributes a squad needs to execute each style well. Weights sum to ~1
 * so a profile score stays on the 1..99 attribute scale before normalising.
 */
const STYLE_PROFILES: Record<TacticalStyleId, AttrWeights> = {
  keep_the_ball:    { passing: 0.4, technique: 0.35, composure: 0.25 },
  press_high:       { stamina: 0.35, speed: 0.3, defending: 0.2, strength: 0.15 },
  hit_on_counter:   { speed: 0.45, finishing: 0.3, technique: 0.25 },
  long_ball:        { strength: 0.35, finishing: 0.3, speed: 0.2, passing: 0.15 },
  attack_the_wings: { speed: 0.35, passing: 0.3, technique: 0.2, finishing: 0.15 },
  defend_deep:      { defending: 0.45, awareness: 0.3, strength: 0.25 },
  balanced:         {
    passing: 0.15, technique: 0.15, defending: 0.15, speed: 0.15,
    finishing: 0.15, awareness: 0.15, stamina: 0.1,
  },
};

/** The generic ability to defend against an opponent's attack. */
const DEFENSIVE_PROFILE: AttrWeights = {
  defending: 0.4, awareness: 0.25, strength: 0.2, stamina: 0.15,
};

function weightedAttr(attrs: PlayerAttributes, weights: AttrWeights): number {
  let sum = 0;
  for (const key in weights) {
    const w = weights[key as keyof PlayerAttributes];
    if (w !== undefined) { sum += attrs[key as keyof PlayerAttributes] * w; }
  }
  return sum;
}

function profileScore(weights: AttrWeights, xi: Player[]): number {
  if (xi.length === 0) { return 0.5; }
  const total = xi.reduce((acc, p) => acc + weightedAttr(p.attributes, weights), 0);
  const avg = total / xi.length;
  return Math.max(0, Math.min(1, avg / ATTR_MAX));
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
