import type { Player } from '../shared/types.ts';
import type { TeamTacticsIntent } from './intent-types.ts';
import { type MatchParameters, clampParam } from './match-parameters.ts';
import { combine } from './translate.ts';
import { applySquadDistortion } from './squad-influence.ts';
import { squadSuitability, defensiveSuitability, attackEffectiveness } from './suitability.ts';

/** Attack effectiveness of an even, league-average matchup — the no-edge baseline.
 *  Exported for the post-match insight detectors (matchup verdict vs "typical"). */
export const TYPICAL_EFF = 0.46;

/** Keep a suitability multiplier in a sane band so no single match explodes. */
function clampMult(m: number): number {
  return Math.max(0.7, Math.min(1.3, m));
}

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
    // Centre the multiplier on a *typical* matchup (eff ≈ TYPICAL_EFF) so an even
    // contest is unchanged, then swing around it: a good style→squad→opponent
    // match raises chance quality, a poor one suppresses it. The spread is sized
    // so the expert's matchup read is worth ~±12% on conversion — meaningful, but
    // still well below the player-attribute lever. Frequency moves more gently.
    const qualityMult = clampMult(1 + (eff - TYPICAL_EFF) * 1.4);  // ~0.73 .. 1.24
    const freqMult = clampMult(1 + (eff - TYPICAL_EFF) * 0.6);     // gentler on volume
    params = {
      ...params,
      chanceQuality: clampParam(params.chanceQuality * qualityMult),
      shotFrequency: clampParam(params.shotFrequency * freqMult),
    };
  }

  return params;
}
