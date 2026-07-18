// Step 5 (REWORK_01.md §7): the remaining tactical sliders become MECHANICAL —
// they modify the movement targets (geometry), never the dice. Line height shifts
// the defending shape up the pitch, pressing volunteers nearby defenders toward the
// ball, compactness narrows the defending shape, width stretches the attacking one,
// and transition speed is pure urgency travelling into the attacking shape. Their
// football consequences (space behind, turnovers, crossing lanes, counters) then
// emerge from the live positions the duels are resolved on.

import type { XY } from './field.ts';
import { distance } from './field.ts';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Team-frame y shift of the defending shape at slider 100 (≈ two thirds of a band). */
export const MAX_LINE_SHIFT = 0.1;

/** spaceLeftBehind (the line-height cost) → defending-shape shift toward halfway.
 *  Positive pushes the whole defending shape up; the space behind it is real. */
export function lineShift(spaceLeftBehind: number): number {
  return ((spaceLeftBehind - 50) / 50) * MAX_LINE_SHIFT;
}

/** Lateral stretch of the attacking shape at slider 100 / squeeze at 0. */
export const MAX_WIDTH_STRETCH = 0.3;

/** buildUpWidth → attacking targets' x scaled around the centre line: wide teams put
 *  their players in genuinely wider positions (more crossing geography), narrow teams
 *  overload the middle. The GK is never moved. */
export function applyWidth(
  targets: Record<string, XY>, buildUpWidth: number, gkId: string | null,
): Record<string, XY> {
  const scale = 1 + ((buildUpWidth - 50) / 50) * MAX_WIDTH_STRETCH;
  const out: Record<string, XY> = {};
  for (const [id, t] of Object.entries(targets)) {
    out[id] = id === gkId ? t : { x: clamp01(0.5 + (t.x - 0.5) * scale), y: t.y };
  }
  return out;
}

/** How far toward the centre line a fully compact side squeezes (fraction of each
 *  player's distance from centre). Below 50 the shape spreads instead. */
export const MAX_COMPACT_PULL = 0.4;

/** defensiveCompactness → defending targets' x pulled toward the centre: a compact
 *  block stacks central presence (second defenders on everything through the middle)
 *  but leaves the flanks to the crossers. */
export function applyCompactness(
  targets: Record<string, XY>, compactness: number, gkId: string | null,
): Record<string, XY> {
  const pull = ((compactness - 50) / 50) * MAX_COMPACT_PULL;
  const out: Record<string, XY> = {};
  for (const [id, t] of Object.entries(targets)) {
    out[id] = id === gkId ? t : { x: clamp01(t.x + (0.5 - t.x) * pull), y: t.y };
  }
  return out;
}

/** Defenders whose spot is within this radius of the ball are press candidates. */
export const PRESS_RADIUS = 0.35;
/** Fraction of the way toward the ball a full-press candidate steps at slider 100. */
export const MAX_PRESS_PULL = 0.5;

/** pressIntensity → nearby defenders volunteer toward the ball instead of holding
 *  their anchor (REWORK_01.md: pressing = volunteering for duels). At 0 nobody leaves
 *  the shape; the energy cost of pressing is charged separately by the fatigue model. */
export function applyPress(
  targets: Record<string, XY>, pressIntensity: number, ball: XY, gkId: string | null,
): Record<string, XY> {
  const pull = (pressIntensity / 100) * MAX_PRESS_PULL;
  if (pull <= 0) { return targets; }
  const out: Record<string, XY> = {};
  for (const [id, t] of Object.entries(targets)) {
    out[id] = id !== gkId && distance(t, ball) < PRESS_RADIUS
      ? { x: t.x + (ball.x - t.x) * pull, y: t.y + (ball.y - t.y) * pull }
      : t;
  }
  return out;
}

/** Travel-speed swing from the transition slider (±20% at the extremes). */
export const MAX_URGENCY_SWING = 0.2;

/** transitionSpeed → how urgently the side in possession breaks into its attacking
 *  shape. Defensive recovery is never slowed — getting back is always full effort. */
export function transitionUrgency(transitionSpeed: number): number {
  return 1 + ((transitionSpeed - 50) / 50) * MAX_URGENCY_SWING;
}
