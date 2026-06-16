import type { Formation } from '../shared/types.ts';
import type { ParamModifiers } from './match-parameters.ts';

/**
 * Structural tendencies each formation contributes to the match parameters,
 * as deltas around the neutral baseline (50). These describe shape only —
 * width, compactness, attacking lanes, space conceded — not behaviour (that
 * comes from the style).
 */
export const FORMATION_TENDENCIES: Record<Formation, ParamModifiers> = {
  // 4-back — balanced shapes
  '4-4-2':   { defensiveCompactness: +6, buildUpWidth: +4 },
  '4-3-3':   { buildUpWidth: +8, shotFrequency: +5, spaceLeftBehind: +5 },
  '4-5-1':   { defensiveCompactness: +10, shotFrequency: -6, spaceLeftBehind: -4 },
  '4-2-3-1': { passingRisk: +5, chanceQuality: +6 },
  '4-1-4-1': { defensiveCompactness: +8, spaceLeftBehind: -4 },
  '4-4-1-1': { defensiveCompactness: +4, chanceQuality: +3 },
  '4-2-4':   { shotFrequency: +10, buildUpWidth: +6, spaceLeftBehind: +10, defensiveCompactness: -8 },
  // 3-back — central overload, wide exposure
  '3-5-2':   { pressIntensity: +4, buildUpWidth: -4, spaceLeftBehind: +8 },
  '3-4-3':   { buildUpWidth: +10, spaceLeftBehind: +12, pressIntensity: +5, shotFrequency: +6, defensiveCompactness: -6 },
  '3-4-2-1': { chanceQuality: +5, buildUpWidth: +4, spaceLeftBehind: +6 },
  // 5-back — solid, defensive, little attacking output
  '5-3-2':   { defensiveCompactness: +14, spaceLeftBehind: -10, shotFrequency: -6 },
  '5-4-1':   { defensiveCompactness: +18, spaceLeftBehind: -15, shotFrequency: -10 },
};
