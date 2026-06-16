import type { Formation } from '../shared/types.ts';
import type { TacticalStyleId, TacticalSliders } from './intent-types.ts';
import {
  type MatchParameters, NEUTRAL_PARAMS, applyDelta, clampParam, clampParams,
} from './match-parameters.ts';
import { FORMATION_TENDENCIES } from './formation-tendencies.ts';
import { STYLE_TENDENCIES } from './style-tendencies.ts';

/**
 * Layer 2 — the tactical translation layer.
 *
 * Combines a formation (structure) and a style (behaviour), then applies the
 * optional sliders as additive deltas on top, and clamps to 0..100. Sliders
 * stack with the style rather than overriding it (e.g. a counter style + a
 * high-line slider partially cancel out the deep block).
 */
export function combine(
  formation: Formation,
  style: TacticalStyleId,
  sliders: TacticalSliders,
): MatchParameters {
  const base: MatchParameters = { ...NEUTRAL_PARAMS };
  applyDelta(base, FORMATION_TENDENCIES[formation]);
  applyDelta(base, STYLE_TENDENCIES[style].modifiers);

  base.tempo += sliders.tempo - 50;
  base.passingRisk += sliders.risk - 50;

  // A higher defensive line concedes more space behind and is less compact.
  const lineDelta = sliders.defensiveLine - 50;
  base.spaceLeftBehind += lineDelta * 0.6;
  base.defensiveCompactness -= lineDelta * 0.4;
  base.pressIntensity += lineDelta * 0.3;

  return clampParams(base);
}

export { clampParam };
