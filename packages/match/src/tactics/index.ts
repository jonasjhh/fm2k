export type { TacticalStyleId, TacticalSliders, TeamTacticsIntent } from './intent-types.ts';
export { TACTICAL_STYLE_IDS, DEFAULT_SLIDERS, defaultIntent } from './intent-types.ts';

export type { MatchParameters, MatchParameterSet, ParamModifiers } from './match-parameters.ts';
export {
  NEUTRAL_PARAMS, NEUTRAL_VALUE, PARAM_KEYS, clampParam, clampParams, applyDelta,
} from './match-parameters.ts';

export { FORMATION_TENDENCIES } from './formation-tendencies.ts';
export type { StyleTendency } from './style-tendencies.ts';
export { STYLE_TENDENCIES } from './style-tendencies.ts';

export { formationToStyle, aiIntent } from './ai-style.ts';
export { combine } from './translate.ts';
export { applySquadDistortion } from './squad-influence.ts';
export { squadSuitability, defensiveSuitability, attackEffectiveness } from './suitability.ts';
export { resolveMatchParameters, TYPICAL_EFF } from './resolve.ts';

export type { MatchInsight, InsightCategory, MatchInsightInput } from './feedback.ts';
export { buildMatchInsights } from './feedback.ts';
