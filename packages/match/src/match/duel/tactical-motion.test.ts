import { describe, expect, it } from 'vitest';
import type { XY } from './field.ts';
import {
  MAX_LINE_SHIFT, lineShift,
  MAX_WIDTH_STRETCH, applyWidth,
  MAX_COMPACT_PULL, applyCompactness,
  PRESS_RADIUS, MAX_PRESS_PULL, applyPress,
  applyBallSideShift,
  MAX_URGENCY_SWING, transitionUrgency,
} from './tactical-motion.ts';

const GK = 'gk';

describe('lineShift:', () => {
  it('is zero at the neutral slider', () => {
    expect(lineShift(50)).toBe(0);
  });

  it('pushes up at 100 and drops off at 0, symmetrically', () => {
    expect(lineShift(100)).toBeCloseTo(MAX_LINE_SHIFT);
    expect(lineShift(0)).toBeCloseTo(-MAX_LINE_SHIFT);
  });
});

describe('applyWidth:', () => {
  const targets: Record<string, XY> = {
    [GK]: { x: 0.5, y: 0.05 },
    wideLeft: { x: 0.1, y: 0.6 },
    central: { x: 0.5, y: 0.5 },
    right: { x: 0.8, y: 0.6 },
  };

  it('leaves everything unchanged at neutral', () => {
    const out = applyWidth(targets, 50, GK);
    for (const id of Object.keys(targets)) {
      expect(out[id].x).toBeCloseTo(targets[id].x, 10);
      expect(out[id].y).toBe(targets[id].y);
    }
  });

  it('stretches x around the centre at 100 and never moves the GK or y', () => {
    const out = applyWidth(targets, 100, GK);
    expect(out[GK]).toEqual(targets[GK]);
    expect(out.central).toEqual(targets.central);
    // wideLeft stretches past the touchline (0.5 − 0.4·1.3 = −0.02) and clamps to 0
    expect(out.wideLeft.x).toBe(0);
    expect(out.right.x).toBeCloseTo(0.5 + (0.8 - 0.5) * (1 + MAX_WIDTH_STRETCH));
    expect(out.right.y).toBe(targets.right.y);
  });

  it('narrows toward the centre below 50', () => {
    const out = applyWidth(targets, 0, GK);
    expect(out.wideLeft.x).toBeGreaterThan(targets.wideLeft.x);
    expect(out.right.x).toBeLessThan(targets.right.x);
  });

  it('clamps stretched positions to the pitch', () => {
    const edge = { winger: { x: 0.98, y: 0.7 } };
    expect(applyWidth(edge, 100, null).winger.x).toBeLessThanOrEqual(1);
    const other = { winger: { x: 0.02, y: 0.7 } };
    expect(applyWidth(other, 100, null).winger.x).toBeGreaterThanOrEqual(0);
  });
});

describe('applyCompactness:', () => {
  const targets: Record<string, XY> = {
    [GK]: { x: 0.5, y: 0.05 },
    wide: { x: 0.1, y: 0.3 },
  };

  it('is a no-op at neutral', () => {
    expect(applyCompactness(targets, 50, GK)).toEqual(targets);
  });

  it('pulls toward the centre at 100 by the full pull fraction, GK untouched', () => {
    const out = applyCompactness(targets, 100, GK);
    expect(out[GK]).toEqual(targets[GK]);
    expect(out.wide.x).toBeCloseTo(0.1 + (0.5 - 0.1) * MAX_COMPACT_PULL);
    expect(out.wide.y).toBe(targets.wide.y);
  });

  it('spreads away from the centre below 50', () => {
    const out = applyCompactness(targets, 0, GK);
    expect(out.wide.x).toBeLessThan(targets.wide.x);
  });
});

describe('applyPress:', () => {
  const ball: XY = { x: 0.5, y: 0.5 };
  const targets: Record<string, XY> = {
    [GK]: { x: 0.5, y: 0.45 },          // near the ball, but the GK never presses
    near: { x: 0.5, y: 0.3 },           // within PRESS_RADIUS
    far: { x: 0.5, y: 0.05 },           // outside PRESS_RADIUS
  };

  it('returns targets untouched at zero intensity', () => {
    expect(applyPress(targets, 0, ball, GK)).toBe(targets);
  });

  it('pulls only nearby outfielders toward the ball, scaled by intensity', () => {
    const out = applyPress(targets, 100, ball, GK);
    expect(out[GK]).toEqual(targets[GK]);
    expect(out.far).toEqual(targets.far);
    expect(out.near.y).toBeCloseTo(0.3 + (0.5 - 0.3) * MAX_PRESS_PULL);
    expect(out.near.x).toBe(0.5);
  });

  it('presses half as hard at intensity 50', () => {
    const out = applyPress(targets, 50, ball, GK);
    expect(out.near.y).toBeCloseTo(0.3 + (0.5 - 0.3) * MAX_PRESS_PULL * 0.5);
  });

  it('ignores players exactly at the radius boundary', () => {
    const boundary = { p: { x: 0.5, y: 0.5 - PRESS_RADIUS } };
    expect(applyPress(boundary, 100, ball, null).p).toEqual(boundary.p);
  });
});

describe('applyBallSideShift (TASK_19):', () => {
  // Home defends the low-y end: the back line sits at low y, forwards high.
  const ballWideLeft: XY = { x: 0.15, y: 0.5 };
  const targets: Record<string, XY> = {
    [GK]: { x: 0.5, y: 0.05 },
    nearCB: { x: 0.5, y: 0.15 },   // central back-line, close to the ball's lane
    farFB: { x: 0.85, y: 0.15 },   // opposite fullback, far from the ball
    striker: { x: 0.5, y: 0.9 },   // stays up for the counter
  };

  it('slides the back line toward the ball, near-side more than far-side, without collapsing', () => {
    const out = applyBallSideShift(targets, ballWideLeft, 'home', GK);
    const nearMove = targets.nearCB.x - out.nearCB.x;
    const farMove = targets.farFB.x - out.farFB.x;
    // Both slide ball-ward (left, toward x=0.15)…
    expect(nearMove).toBeGreaterThan(0);
    expect(farMove).toBeGreaterThan(0);
    // …but the near side compresses more than the far side.
    expect(nearMove).toBeGreaterThan(farMove);
    // The shape shuffles, it does not collapse onto the ball: width is largely retained.
    expect(out.farFB.x - out.nearCB.x).toBeGreaterThan(0.25);
  });

  it('barely moves a forward (depth ≈ 0) and never moves the GK', () => {
    const out = applyBallSideShift(targets, ballWideLeft, 'home', GK);
    expect(targets.striker.x - out.striker.x).toBeLessThan(0.02);
    expect(out[GK]).toEqual(targets[GK]);
    // y is never touched.
    expect(out.nearCB.y).toBe(targets.nearCB.y);
  });

  it('respects the defending direction (away is mirrored in y)', () => {
    // Away defends the high-y end: its back line sits at HIGH y. A back-line player at
    // y=0.85 should get near-full depth weight and shift toward the ball.
    const awayTargets: Record<string, XY> = { cb: { x: 0.5, y: 0.85 } };
    const out = applyBallSideShift(awayTargets, ballWideLeft, 'away', null);
    expect(out.cb.x).toBeLessThan(awayTargets.cb.x); // moved toward the wide-left ball
  });
});

describe('transitionUrgency:', () => {
  it('is unit speed at neutral and swings ±MAX at the extremes', () => {
    expect(transitionUrgency(50)).toBe(1);
    expect(transitionUrgency(100)).toBeCloseTo(1 + MAX_URGENCY_SWING);
    expect(transitionUrgency(0)).toBeCloseTo(1 - MAX_URGENCY_SWING);
  });
});
