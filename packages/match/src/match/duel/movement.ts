// The lightweight 22-player movement sim (REWORK_01.md §5, design ruling #2): every
// player has a live xy position and travels toward their current-phase anchor at
// fatigue-modified Speed. No collision, no pathing — straight-line target seeking.
// Transitions, counters and pressing risk all emerge from this: until a player has
// travelled to their new-phase anchor, their presence is wherever they actually are.

import type { Player } from '../../shared/types.ts';
import { physicalFatigueMult } from '../fatigue.ts';
import type { XY } from './field.ts';
import { distance } from './field.ts';

/** Pitch lengths per minute for a MATCH-AVERAGE runner, fully fresh. Travel is
 *  relative to the match's mean Speed (see relativePace) so the game's tempo doesn't
 *  scale with tier — a full transition between aggressive attacking anchors and the
 *  defending shape (~0.4 of the pitch) takes an average runner about two minutes,
 *  the quickest on the pitch a good chunk less. */
export const BASE_TRAVEL_PER_MINUTE = 0.2;

/** How much faster/slower than the match average a player can travel. */
export const PACE_RATIO_LO = 0.6;
export const PACE_RATIO_HI = 1.4;

/** Speed relative to the match's mean — WITHIN a match the quick full-back covers
 *  more grass than the slow centre-half, but two evenly-matched teams produce the
 *  same movement texture at any tier (absolute speed is contested in speed DUELS,
 *  not in shape travel). */
export function relativePace(speed: number, refSpeed: number): number {
  const ref = Math.max(1, refSpeed);
  return Math.max(PACE_RATIO_LO, Math.min(PACE_RATIO_HI, speed / ref));
}

export function travelPerMinute(speed: number, energy: number, refSpeed: number): number {
  return BASE_TRAVEL_PER_MINUTE * relativePace(speed, refSpeed) * physicalFatigueMult(energy);
}

/** One player's position after `minutes` of travel toward their target. */
export function moveToward(pos: XY, target: XY, maxDist: number): XY {
  const d = distance(pos, target);
  if (d <= maxDist) { return { ...target }; }
  const t = maxDist / d;
  return { x: pos.x + (target.x - pos.x) * t, y: pos.y + (target.y - pos.y) * t };
}

/** Advance every player toward their target for `minutes`. Players without a target
 *  (e.g. just subbed on, shapes not covering them) hold their position. `refSpeed`
 *  is the match-wide mean Speed both sides are measured against. */
export function advancePositions(
  positions: Record<string, XY>,
  targets: Record<string, XY>,
  players: readonly Player[],
  energy: Record<string, number>,
  minutes: number,
  refSpeed: number,
): Record<string, XY> {
  const speedById = new Map(players.map(p => [p.id, p.attributes.speed] as const));
  const out: Record<string, XY> = {};
  for (const [id, pos] of Object.entries(positions)) {
    const target = targets[id];
    if (!target) { out[id] = pos; continue; }
    const maxDist = travelPerMinute(speedById.get(id) ?? 50, energy[id] ?? 100, refSpeed) * minutes;
    out[id] = moveToward(pos, target, maxDist);
  }
  return out;
}
