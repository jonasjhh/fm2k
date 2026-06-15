import type { Player } from '../shared/types.ts';
import type { MatchParameterSet } from './match-parameters.ts';

export type InsightCategory =
  | 'attack' | 'defense' | 'midfield' | 'press' | 'transition' | 'neutral';

/**
 * A single post-match takeaway, always tied to something concrete (positive or
 * negative) about the player's own XI/squad.
 */
export interface MatchInsight {
  headline: string;
  detail: string;
  category: InsightCategory;
}

/** Everything the insight builder needs, available at the match.completed seam. */
export interface MatchInsightInput {
  playerSide: 'home' | 'away';
  homeScore: number;
  awayScore: number;
  params: MatchParameterSet;
  playerXi: Player[];
}

/**
 * Build the single most important post-match insight for the player's team.
 *
 * DEFERRED: detector logic is not implemented yet — this returns `null` so the
 * call site, query, and snapshot field can all be wired now and the feature
 * drops in later with no plumbing changes.
 *
 * TODO: rank detectors over the suitability gap, a standout/weak-link performer,
 * and the active style's manifested weakness (vs the opponent params), then
 * return the strongest one. May need richer match stats plumbed into the input.
 */
export function buildMatchInsight(_input: MatchInsightInput): MatchInsight | null {
  return null;
}
