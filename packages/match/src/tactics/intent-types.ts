import type { Formation } from '../shared/types.ts';

/**
 * Manager-facing tactical styles. The id is internal; each style also carries a
 * plain-English label + blurb (see STYLE_TENDENCIES) so a football novice
 * understands it in the UI.
 */
export type TacticalStyleId =
  | 'keep_the_ball'     // patient short passing, control the game
  | 'press_high'        // hunt the ball aggressively up the pitch
  | 'hit_on_counter'    // sit back, then break fast
  | 'long_ball'         // go direct, skip the midfield
  | 'attack_the_wings'  // get wide and cross
  | 'defend_deep'       // sit back, soak pressure, stay solid
  | 'balanced';         // no strong bias

export const TACTICAL_STYLE_IDS: TacticalStyleId[] = [
  'keep_the_ball', 'press_high', 'hit_on_counter', 'long_ball',
  'attack_the_wings', 'defend_deep', 'balanced',
];

/** Optional fine-tuning on top of the chosen style. Each 0..100, 50 = neutral. */
export interface TacticalSliders {
  tempo: number;
  risk: number;
  defensiveLine: number;
  pressIntensity: number;
}

/** What the manager chooses — stored on ClubState. INTENT ONLY (no effects). */
export interface TeamTacticsIntent {
  formation: Formation;
  style: TacticalStyleId;
  sliders: TacticalSliders;
}

export const DEFAULT_SLIDERS: TacticalSliders = { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 };

export function defaultIntent(formation: Formation): TeamTacticsIntent {
  return { formation, style: 'balanced', sliders: { ...DEFAULT_SLIDERS } };
}
