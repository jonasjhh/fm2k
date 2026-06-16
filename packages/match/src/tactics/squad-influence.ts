import type { Player, PlayerAttributes } from '../shared/types.ts';
import { type MatchParameters, clampParam } from './match-parameters.ts';

const ATTR_MAX = 99;
/** Reference attribute level treated as "average" for distortion purposes. */
const ATTR_REF = 50;

function avgAttr(xi: Player[], key: keyof PlayerAttributes): number {
  if (xi.length === 0) { return ATTR_REF; }
  return xi.reduce((acc, p) => acc + p.attributes[key], 0) / xi.length;
}

/** 0..1 normalisation of an attribute level. */
function norm01(value: number): number {
  return Math.max(0, Math.min(1, value / ATTR_MAX));
}

/**
 * Layer 3 — squad influence. Distorts (never overrides) the resolved parameters
 * based on the squad's attributes:
 *  - low stamina  → pressing less effective, fatigue worse
 *  - weak mentals → effective passing risk rises (more giveaways)
 *  - high pace    → counters more dangerous
 */
export function applySquadDistortion(p: MatchParameters, xi: Player[]): MatchParameters {
  const out: MatchParameters = { ...p };

  const stamina = norm01(avgAttr(xi, 'stamina'));
  out.pressIntensity = clampParam(out.pressIntensity * (0.85 + 0.3 * stamina));
  out.fatigueRate = clampParam(out.fatigueRate * (1.25 - 0.4 * stamina));

  const meanMental = (avgAttr(xi, 'composure') + avgAttr(xi, 'awareness')) / 2;
  out.passingRisk = clampParam(out.passingRisk + (ATTR_REF - meanMental) * 0.3);

  const speed = norm01(avgAttr(xi, 'speed'));
  out.transitionSpeed = clampParam(out.transitionSpeed * (0.85 + 0.3 * speed));

  return out;
}
