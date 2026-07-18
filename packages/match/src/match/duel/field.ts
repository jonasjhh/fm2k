// The v2 engine's field model (REWORK_01.md §5): continuous pitch coordinates, the
// band→y mapping that turns a PlayerGeometry anchor into a movement target, and the
// 5-lane × 5-band presence grid projected from LIVE player positions (never from
// anchors, and never from position names).
//
// Absolute frame: home attacks toward y=1, away toward y=0; x=0 is home's left flank.
// Each team's anchors are authored in its own frame and mirrored here, so the same
// TeamShapes object means the same football for either side.

import type { PlayerGeometry, TeamShapes } from '../../shared/types.ts';
import type { Band } from '../../lineup/bands.ts';

export interface XY { x: number; y: number }
export type Side = 'home' | 'away';

/** Anchor y per band, in the TEAM frame (attacking toward 1). The five outfield bands
 *  are the presence grid's vertical resolution; GK is pinned in front of goal. */
export const BAND_Y: Record<Band, number> = {
  GK: 0.04, DEF: 0.2, DM: 0.34, MID: 0.5, AM: 0.66, ATT: 0.82,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** A team-frame anchor point for one outfield geometry entry. */
export function anchorXY(geometry: PlayerGeometry): XY {
  return { x: clamp01((geometry.lateral + 1) / 2), y: BAND_Y[geometry.band] };
}

/** Team frame → absolute frame (away is mirrored on both axes). */
export function toAbsolute(pos: XY, side: Side): XY {
  return side === 'home' ? pos : { x: 1 - pos.x, y: 1 - pos.y };
}

/** Movement targets for one side in one phase: outfield anchors from the shape
 *  (shifted by lineShift in the team frame — the line-height slider), GK pinned.
 *  `lineShift` is applied to defending-phase targets only, by the caller's choice. */
export function targetsForShape(
  shape: Record<string, PlayerGeometry>,
  gkId: string | null,
  side: Side,
  lineShift = 0,
): Record<string, XY> {
  const out: Record<string, XY> = {};
  for (const [id, geometry] of Object.entries(shape)) {
    const a = anchorXY(geometry);
    out[id] = toAbsolute({ x: a.x, y: clamp01(a.y + lineShift) }, side);
  }
  if (gkId) { out[gkId] = toAbsolute({ x: 0.5, y: BAND_Y.GK }, side); }
  return out;
}

/** Which of a team's dual shapes each side plays toward, given who has the ball. */
export function phaseOf(side: Side, possession: Side): keyof TeamShapes {
  return side === possession ? 'attacking' : 'defending';
}

// ── the 5×5 presence grid ────────────────────────────────────────────────────────

export const GRID_SIZE = 5;

/** grid[band][lane], bands and lanes both 0..4 in the ABSOLUTE frame. */
export type PresenceGrid = number[][];

export function emptyGrid(): PresenceGrid {
  return Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(0));
}

export interface Cell { band: number; lane: number }

/** The grid cell a live position falls in. */
export function cellOf(pos: XY): Cell {
  const idx = (n: number) => Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(n * GRID_SIZE)));
  return { band: idx(pos.y), lane: idx(pos.x) };
}

// Presence kernel: a player projects most of themselves into their own cell and a
// decaying spill into the four neighbours (REWORK_01.md §5's worked examples). Spill
// falling off the pitch edge is simply lost — a touchline player covers less ground.
const KERNEL_OWN = 0.6;
const KERNEL_NEIGHBOUR = 0.1;

/** Sum a set of live positions into a presence grid. */
export function projectPresence(positions: Record<string, XY>): PresenceGrid {
  const grid = emptyGrid();
  for (const pos of Object.values(positions)) {
    const { band, lane } = cellOf(pos);
    grid[band][lane] += KERNEL_OWN;
    for (const [db, dl] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const b = band + db, l = lane + dl;
      if (b >= 0 && b < GRID_SIZE && l >= 0 && l < GRID_SIZE) {
        grid[b][l] += KERNEL_NEIGHBOUR;
      }
    }
  }
  return grid;
}

export function presenceAt(grid: PresenceGrid, cell: Cell): number {
  return grid[cell.band][cell.lane];
}

/** A side's defensive back band in the absolute frame (home defends band 0). */
export function backBand(side: Side): number {
  return side === 'home' ? 0 : GRID_SIZE - 1;
}

/** Spare-man rule (REWORK_01.md §6): defensive presence surplus across the defending
 *  side's back band. Positive = a covering defender is always eligible for through-ball
 *  races. */
export function spareManSurplus(defenders: PresenceGrid, attackers: PresenceGrid, defendingSide: Side): number {
  const band = backBand(defendingSide);
  let def = 0, atk = 0;
  for (let lane = 0; lane < GRID_SIZE; lane++) {
    def += defenders[band][lane];
    atk += attackers[band][lane];
  }
  return def - atk;
}

// ── player queries on live positions ────────────────────────────────────────────

export function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ids sorted by distance to a point — the "fastest-of-N" candidate order for free
 *  balls, and the nearest-marker pick for duels. */
export function nearestTo(point: XY, positions: Record<string, XY>, exclude?: ReadonlySet<string>): string[] {
  return Object.keys(positions)
    .filter(id => !exclude?.has(id))
    .sort((a, b) => distance(positions[a], point) - distance(positions[b], point));
}
