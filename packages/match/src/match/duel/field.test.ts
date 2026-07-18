import {
  BAND_Y, anchorXY, toAbsolute, targetsForShape, phaseOf,
  emptyGrid, cellOf, projectPresence, presenceAt, GRID_SIZE,
  backBand, spareManSurplus, nearestTo, distance,
} from './field.ts';
import { travelPerMinute, moveToward, advancePositions, BASE_TRAVEL_PER_MINUTE } from './movement.ts';
import { physicalFatigueMult } from '../fatigue.ts';
import type { Player } from '../../shared/types.ts';

describe('anchors and frames:', () => {
  it('anchorXY maps band to its line y and lateral −1..1 to x 0..1', () => {
    expect(anchorXY({ band: 'DEF', lateral: -1 })).toEqual({ x: 0, y: BAND_Y.DEF });
    expect(anchorXY({ band: 'ATT', lateral: 0 })).toEqual({ x: 0.5, y: BAND_Y.ATT });
    expect(anchorXY({ band: 'MID', lateral: 1 })).toEqual({ x: 1, y: BAND_Y.MID });
  });

  it('the five outfield bands are strictly ordered up the pitch', () => {
    expect(BAND_Y.GK).toBeLessThan(BAND_Y.DEF);
    expect(BAND_Y.DEF).toBeLessThan(BAND_Y.DM);
    expect(BAND_Y.DM).toBeLessThan(BAND_Y.MID);
    expect(BAND_Y.MID).toBeLessThan(BAND_Y.AM);
    expect(BAND_Y.AM).toBeLessThan(BAND_Y.ATT);
  });

  it('away positions are mirrored on both axes', () => {
    expect(toAbsolute({ x: 0.2, y: 0.8 }, 'home')).toEqual({ x: 0.2, y: 0.8 });
    const away = toAbsolute({ x: 0.2, y: 0.8 }, 'away');
    expect(away.x).toBeCloseTo(0.8, 10);
    expect(away.y).toBeCloseTo(0.2, 10);
  });

  it('targetsForShape mirrors away anchors, pins the GK, and applies lineShift in the team frame', () => {
    const shape = { p1: { band: 'DEF' as const, lateral: 0 } };
    const home = targetsForShape(shape, 'gk', 'home');
    expect(home.p1).toEqual({ x: 0.5, y: BAND_Y.DEF });
    expect(home.gk).toEqual({ x: 0.5, y: BAND_Y.GK });

    const away = targetsForShape(shape, 'gk', 'away');
    expect(away.p1.y).toBeCloseTo(1 - BAND_Y.DEF, 10);
    expect(away.gk.y).toBeCloseTo(1 - BAND_Y.GK, 10);

    const high = targetsForShape(shape, null, 'away', 0.1);
    expect(high.p1.y).toBeCloseTo(1 - (BAND_Y.DEF + 0.1), 10); // pushed UP for away = lower absolute y
  });

  it('phaseOf: the side in possession plays its attacking shape, the other defends', () => {
    expect(phaseOf('home', 'home')).toBe('attacking');
    expect(phaseOf('away', 'home')).toBe('defending');
  });
});

describe('presence grid:', () => {
  it('a central player projects 0.6 into their own cell and 0.1 into each neighbour', () => {
    const grid = projectPresence({ p: { x: 0.5, y: 0.5 } });
    expect(presenceAt(grid, { band: 2, lane: 2 })).toBeCloseTo(0.6, 10);
    expect(presenceAt(grid, { band: 1, lane: 2 })).toBeCloseTo(0.1, 10);
    expect(presenceAt(grid, { band: 3, lane: 2 })).toBeCloseTo(0.1, 10);
    expect(presenceAt(grid, { band: 2, lane: 1 })).toBeCloseTo(0.1, 10);
    expect(presenceAt(grid, { band: 2, lane: 3 })).toBeCloseTo(0.1, 10);
    expect(presenceAt(grid, { band: 0, lane: 0 })).toBe(0);
  });

  it('edge spill is lost off the pitch (a corner player totals 0.8, not 1.0)', () => {
    const grid = projectPresence({ p: { x: 0, y: 0 } });
    const total = grid.flat().reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(0.8, 10);
  });

  it('cellOf clamps to the grid and splits the pitch into 5×5', () => {
    expect(cellOf({ x: 0, y: 0 })).toEqual({ band: 0, lane: 0 });
    expect(cellOf({ x: 1, y: 1 })).toEqual({ band: GRID_SIZE - 1, lane: GRID_SIZE - 1 });
    expect(cellOf({ x: 0.39, y: 0.61 })).toEqual({ band: 3, lane: 1 });
  });

  it('presence sums across players', () => {
    const grid = projectPresence({ a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.5 } });
    expect(presenceAt(grid, { band: 2, lane: 2 })).toBeCloseTo(1.2, 10);
  });

  it('emptyGrid is all zeros', () => {
    expect(emptyGrid().flat().every(v => v === 0)).toBe(true);
  });
});

describe('spare-man rule:', () => {
  it('a defensive surplus in the back band is positive; outnumbered is negative', () => {
    // Home defends band 0. Two home defenders deep vs one away attacker deep.
    const defenders = projectPresence({ d1: { x: 0.3, y: 0.05 }, d2: { x: 0.7, y: 0.05 } });
    const attackers = projectPresence({ a1: { x: 0.5, y: 0.05 } });
    expect(backBand('home')).toBe(0);
    expect(backBand('away')).toBe(GRID_SIZE - 1);
    expect(spareManSurplus(defenders, attackers, 'home')).toBeGreaterThan(0);
    expect(spareManSurplus(attackers, defenders, 'home')).toBeLessThan(0);
  });
});

describe('nearestTo:', () => {
  it('sorts ids by distance and honours exclusions', () => {
    const positions = { far: { x: 1, y: 1 }, near: { x: 0.1, y: 0.1 }, mid: { x: 0.5, y: 0.5 } };
    expect(nearestTo({ x: 0, y: 0 }, positions)).toEqual(['near', 'mid', 'far']);
    expect(nearestTo({ x: 0, y: 0 }, positions, new Set(['near']))).toEqual(['mid', 'far']);
  });
});

describe('movement:', () => {
  const player = (id: string, speed: number): Player => ({
    id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70,
    attributes: { speed, strength: 50, stamina: 50, passing: 50, technique: 50, finishing: 50, defending: 50, keeping: 10 },
  });

  it('travelPerMinute scales with speed relative to the match mean, and fatigue', () => {
    expect(travelPerMinute(50, 100, 50)).toBeCloseTo(BASE_TRAVEL_PER_MINUTE, 10);
    expect(travelPerMinute(40, 100, 50)).toBeCloseTo(BASE_TRAVEL_PER_MINUTE * 0.8, 10);
    expect(travelPerMinute(50, 0, 50)).toBeCloseTo(BASE_TRAVEL_PER_MINUTE * physicalFatigueMult(0), 10);
  });

  it('moveToward stops exactly at the target when within reach', () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0.5)).toEqual({ x: 0.1, y: 0 });
  });

  it('moveToward travels maxDist along the straight line when the target is far', () => {
    const next = moveToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.25);
    expect(next).toEqual({ x: 0.25, y: 0 });
  });

  it('advancePositions moves fast players further and leaves targetless players put', () => {
    const positions = { quick: { x: 0, y: 0 }, slow: { x: 0, y: 0 }, lost: { x: 0.9, y: 0.9 } };
    const targets = { quick: { x: 1, y: 0 }, slow: { x: 1, y: 0 } };
    const players = [player('quick', 99), player('slow', 40)];
    const next = advancePositions(positions, targets, players, { quick: 100, slow: 100 }, 1, 70);
    expect(next.quick.x).toBeGreaterThan(next.slow.x);
    expect(next.lost).toEqual({ x: 0.9, y: 0.9 });
  });
});
