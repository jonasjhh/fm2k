import type { Formation } from '../shared/types.ts';
import type { TacticalStyleId, TeamTacticsIntent } from './intent-types.ts';
import { DEFAULT_SLIDERS } from './intent-types.ts';

/**
 * Deterministic mapping from a formation to a sensible default tactical style,
 * used to give AI opponents varied identities to play (and learn) against.
 */
const FORMATION_STYLE: Record<Formation, TacticalStyleId> = {
  '4-4-2':   'balanced',
  '4-3-3':   'press_high',
  '4-5-1':   'hit_on_counter',
  '4-2-3-1': 'keep_the_ball',
  '4-1-4-1': 'hit_on_counter',
  '4-4-1-1': 'balanced',
  '4-2-4':   'press_high',
  '3-5-2':   'keep_the_ball',
  '3-4-3':   'attack_the_wings',
  '3-4-2-1': 'keep_the_ball',
  '5-3-2':   'defend_deep',
  '5-4-1':   'defend_deep',
};

export function formationToStyle(formation: Formation): TacticalStyleId {
  return FORMATION_STYLE[formation];
}

/** A complete AI tactical intent inferred from a team's formation. */
export function aiIntent(formation: Formation): TeamTacticsIntent {
  return { formation, style: formationToStyle(formation), sliders: { ...DEFAULT_SLIDERS } };
}
