import type { Player } from '../shared/types.ts';
import type { TeamTacticsIntent } from './intent-types.ts';
import { type MatchParameters, clampParam } from './match-parameters.ts';
import { combine } from './translate.ts';
import { applySquadDistortion } from './squad-influence.ts';
import { squadSuitability, defensiveSuitability, attackEffectiveness } from './suitability.ts';

/**
 * The single composition seam used by the session. Runs the full pipeline:
 *   intent  → translate (formation + style + sliders)
 *           → squad distortion (own XI)
 *           → asymmetric attack effectiveness (vs opponent XI, if known)
 *
 * `oppXi` is supplied when building a specific match, where both lineups are
 * known. Without it (e.g. previewing the player's own tactics) the attack
 * effectiveness step is skipped.
 */
export function resolveMatchParameters(
  intent: TeamTacticsIntent,
  ownXi: Player[],
  oppXi?: Player[],
): MatchParameters {
  let params = combine(intent.formation, intent.style, intent.sliders);
  params = applySquadDistortion(params, ownXi);

  if (oppXi && oppXi.length > 0) {
    const eff = attackEffectiveness(squadSuitability(intent, ownXi), defensiveSuitability(oppXi));
    // Map effectiveness (0..1) onto a multiplier centred near 1: a well-suited
    // side gains an edge (>1), a poorly-suited one is suppressed (<1). Kept
    // conservative so two suitable sides don't produce a goal fest.
    const qualityMult = 0.75 + 0.45 * eff;     // ~0.75 .. 1.2
    const freqMult = 0.85 + 0.2 * eff;         // ~0.85 .. 1.05
    params = {
      ...params,
      chanceQuality: clampParam(params.chanceQuality * qualityMult),
      shotFrequency: clampParam(params.shotFrequency * freqMult),
    };
  }

  return params;
}
