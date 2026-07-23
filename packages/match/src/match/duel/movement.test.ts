import { describe, expect, it } from 'vitest';
import type { XY } from './field.ts';
import { travelled } from './movement.ts';

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
