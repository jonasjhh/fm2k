import type { TacticalStyleId } from './intent-types.ts';
import type { ParamModifiers } from './match-parameters.ts';

export interface StyleTendency {
  /** Plain-English name shown in the UI. */
  label: string;
  /** One-line meaning understandable to a football novice. */
  blurb: string;
  /** The built-in trade-off — surfaced later by the feedback system. */
  weakness: string;
  /** Behavioural deltas around the neutral baseline (50). */
  modifiers: ParamModifiers;
}

/**
 * Behaviour tendencies each style contributes. Every non-balanced style encodes
 * at least one upside AND at least one adverse modifier (its weakness) so that
 * no style is pure upside. 'balanced' is the neutral baseline (no modifiers):
 * it masters nothing, which is its own weakness.
 */
export const STYLE_TENDENCIES: Record<TacticalStyleId, StyleTendency> = {
  keep_the_ball: {
    label: 'Keep the Ball',
    blurb: 'Patient short passing to control the game.',
    weakness: 'Slow to break down a deep block and exposed if dispossessed high up.',
    modifiers: {
      passingRisk: -12, tempo: -10, chanceQuality: +12, pressIntensity: +5,
      transitionSpeed: -10, shotFrequency: -5,
    },
  },
  press_high: {
    label: 'Press High',
    blurb: 'Hunt the ball aggressively high up the pitch.',
    weakness: 'Leaves space in behind — vulnerable to balls over the top and counters.',
    modifiers: {
      pressIntensity: +25, fatigueRate: +20, spaceLeftBehind: +14,
      transitionSpeed: +8, defensiveCompactness: -8,
    },
  },
  hit_on_counter: {
    label: 'Hit on the Counter',
    blurb: 'Sit back, stay compact, then break at speed.',
    weakness: 'Cedes possession and struggles to break down teams that also sit back.',
    modifiers: {
      pressIntensity: -15, defensiveCompactness: +12, transitionSpeed: +22,
      shotFrequency: -6, tempo: -5,
    },
  },
  long_ball: {
    label: 'Long Ball',
    blurb: 'Go direct and skip the midfield.',
    weakness: 'Surrenders midfield control and possession; low-percentage build-up.',
    modifiers: {
      passingRisk: +18, transitionSpeed: +12, tempo: +8, chanceQuality: -8, buildUpWidth: -4,
    },
  },
  attack_the_wings: {
    label: 'Attack the Wings',
    blurb: 'Get wide and deliver crosses into the box.',
    weakness: 'Predictable through the middle; crossing is wasteful without aerial threat.',
    modifiers: {
      buildUpWidth: +22, shotFrequency: +6, chanceQuality: -4, spaceLeftBehind: +6,
    },
  },
  defend_deep: {
    label: 'Defend Deep',
    blurb: 'Sit back, soak up pressure and stay solid.',
    weakness: 'Almost no attacking output — concede first and you are in trouble.',
    modifiers: {
      defensiveCompactness: +34, shotFrequency: -22, transitionSpeed: -10,
      passingRisk: -10, spaceLeftBehind: -16,
    },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'No strong bias — a flexible, even approach.',
    weakness: 'Masters nothing; out-gunned by a side committed to its strengths.',
    modifiers: {},
  },
};
