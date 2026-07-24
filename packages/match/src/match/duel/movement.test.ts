import { describe, expect, it } from 'vitest';
import type { XY } from './field.ts';
import { travelled, deadBallShapeReset, DEAD_BALL_RESET_FACTOR } from './movement.ts';

describe('travelled (TASK_19):', () => {
  it('measures per-player straight-line distance between two position maps', () => {
    const prev: Record<string, XY> = { a: { x: 0, y: 0 }, b: { x: 0.5, y: 0.5 } };
    const next: Record<string, XY> = { a: { x: 0.3, y: 0.4 }, b: { x: 0.5, y: 0.5 } };
    const d = travelled(prev, next);
    expect(d.a).toBeCloseTo(0.5);   // 3-4-5 triangle
    expect(d.b).toBeCloseTo(0);     // didn't move
  });

  it('only reports players present in both maps', () => {
    const prev: Record<string, XY> = { a: { x: 0, y: 0 } };
    const next: Record<string, XY> = { a: { x: 0, y: 0 }, ghost: { x: 1, y: 1 } };
    const d = travelled(prev, next);
    expect(Object.keys(d)).toEqual(['a']);
  });
});

describe('deadBallShapeReset:', () => {
  it('moves each player the given fraction toward their anchor', () => {
    const positions: Record<string, XY> = { cb: { x: 0.5, y: 0.93 } };
    const anchors: Record<string, XY>   = { cb: { x: 0.5, y: 0.80 } };
    const result = deadBallShapeReset(positions, anchors, 0.85);
    expect(result.cb.x).toBeCloseTo(0.5);
    expect(result.cb.y).toBeCloseTo(0.93 + (0.80 - 0.93) * 0.85); // pulls out of box
    expect(result.cb.y).toBeLessThan(0.83); // no longer inside the penalty area
  });

  it('uses DEAD_BALL_RESET_FACTOR as default', () => {
    const positions: Record<string, XY> = { p: { x: 0.5, y: 0.95 } };
    const anchors: Record<string, XY>   = { p: { x: 0.5, y: 0.80 } };
    const result = deadBallShapeReset(positions, anchors);
    expect(result.p.y).toBeCloseTo(0.95 + (0.80 - 0.95) * DEAD_BALL_RESET_FACTOR);
  });

  it('holds position for players with no anchor entry', () => {
    const positions: Record<string, XY> = { ghost: { x: 0.3, y: 0.7 } };
    const anchors: Record<string, XY> = {};
    const result = deadBallShapeReset(positions, anchors, 0.5);
    expect(result.ghost).toEqual({ x: 0.3, y: 0.7 });
  });

  it('does not mutate the input positions', () => {
    const positions: Record<string, XY> = { a: { x: 0.4, y: 0.6 } };
    const anchors: Record<string, XY>   = { a: { x: 0.5, y: 0.5 } };
    deadBallShapeReset(positions, anchors, 0.5);
    expect(positions.a).toEqual({ x: 0.4, y: 0.6 });
  });
});
