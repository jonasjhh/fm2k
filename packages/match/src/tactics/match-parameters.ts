/**
 * Universal, formation/style-agnostic dials that the PURE match simulator
 * consumes. The simulator knows ONLY these (plus player attributes); it has no
 * concept of formations or styles. Every field is on a 0..100 scale where
 * 50 = average ("neutral").
 */
export interface MatchParameters {
  pressIntensity: number;       // ↑ tackle/interception prob & turnover; ↑ own fatigue
  defensiveCompactness: number; // ↑ suppresses opponent chance quality
  passingRisk: number;          // shifts weight from short passing → through-balls/dribbles
  tempo: number;                // ↑ actions per minute
  transitionSpeed: number;      // ↑ ball-advance distance on success (counters)
  shotFrequency: number;        // ↑ shot weight when in attacking zones
  chanceQuality: number;        // ↑ goal probability of worked chances
  fatigueRate: number;          // Global fatigue rate multiplier — scales all drain uniformly
  spaceLeftBehind: number;      // ↑ opponent ball-advance / shot-zone access (high-line cost)
  buildUpWidth: number;         // bias flank vs centre in ball advancement
}

/** Partial set of deltas applied on top of the neutral baseline. */
export type ParamModifiers = Partial<Record<keyof MatchParameters, number>>;

export const NEUTRAL_VALUE = 50;

export const PARAM_KEYS: (keyof MatchParameters)[] = [
  'pressIntensity', 'defensiveCompactness', 'passingRisk', 'tempo', 'transitionSpeed',
  'shotFrequency', 'chanceQuality', 'fatigueRate', 'spaceLeftBehind', 'buildUpWidth',
];

/** Every parameter at 50 — the "no tactics chosen" baseline. */
export const NEUTRAL_PARAMS: MatchParameters = {
  pressIntensity: NEUTRAL_VALUE,
  defensiveCompactness: NEUTRAL_VALUE,
  passingRisk: NEUTRAL_VALUE,
  tempo: NEUTRAL_VALUE,
  transitionSpeed: NEUTRAL_VALUE,
  shotFrequency: NEUTRAL_VALUE,
  chanceQuality: NEUTRAL_VALUE,
  fatigueRate: NEUTRAL_VALUE,
  spaceLeftBehind: NEUTRAL_VALUE,
  buildUpWidth: NEUTRAL_VALUE,
};

export function clampParam(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function clampParams(p: MatchParameters): MatchParameters {
  const out = {} as MatchParameters;
  for (const key of PARAM_KEYS) { out[key] = clampParam(p[key]); }
  return out;
}

/** Add a set of deltas into a parameter object in place. */
export function applyDelta(target: MatchParameters, delta: ParamModifiers): void {
  for (const key of PARAM_KEYS) {
    const d = delta[key];
    if (d !== undefined) { target[key] += d; }
  }
}

// Home advantage as a chance-quality bump (~+10% conversion at neutral).
// Exported so the occurrence applies the same bump when re-resolving mid-match tactics.
const HOME_ADVANTAGE_CQ = 16;
export function withHomeAdvantage(p: MatchParameters): MatchParameters {
  return { ...p, chanceQuality: clampParam(p.chanceQuality + HOME_ADVANTAGE_CQ) };
}

/** Resolved parameters for both sides, handed to the simulator. */
export interface MatchParameterSet {
  home: MatchParameters;
  away: MatchParameters;
}
