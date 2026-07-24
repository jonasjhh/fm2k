import type { Band } from '../lineup/bands.ts';
import type { Situation } from './duel/flow.ts';

/**
 * Target situation-choice distribution per band, measured as share of ticks (0–1).
 * These are the "knobs" — edit pct to reshape how each role plays.
 * The calibration test (situation-distribution.calibration.test.ts) verifies the
 * sim stays within ±tol of each target over 1 000 simulated matches.
 *
 * pct  = target share of ticks (0.72 = 72%)
 * tol  = allowed deviation in same units — max 0.02 (±2 percentage points)
 */
export interface SituationTarget {
  pct: number;
  tol: number;
}

export const SITUATION_TARGETS: Record<Band, Partial<Record<Situation, SituationTarget>>> = {
  // ── GK ──────────────────────────────────────────────────────────────────────
  // long_ball here = the GK launch / goal kick.
  GK: {
    short_pass: { pct: 0.85, tol: 0.02 },
    long_ball:  { pct: 0.15, tol: 0.02 },
  },

  // ── DEF (CB) ────────────────────────────────────────────────────────────────
  // Central defenders: recycle and clear; rarely carry; almost never dribble.
  DEF: {
    short_pass: { pct: 0.73, tol: 0.02 },
    back_pass: { pct: 0.13, tol: 0.02 },
    long_ball: { pct: 0.08, tol: 0.02 },
    progressive_carry: { pct: 0.05, tol: 0.02 },
    dribble: { pct: 0.01, tol: 0.01 },
  },

  // ── WDEF (LB / RB) ──────────────────────────────────────────────────────────
  // Wide defenders: overlap and carry; occasional long ball down the flank.
  WDEF: {
    short_pass:       { pct: 0.68, tol: 0.02 },
    progressive_carry:{ pct: 0.15, tol: 0.02 },
    back_pass:        { pct: 0.10, tol: 0.02 },
    long_ball:        { pct: 0.05, tol: 0.02 },
    dribble:          { pct: 0.02, tol: 0.02 },
  },

  // ── DM ──────────────────────────────────────────────────────────────────────
  // Holding midfielders: safe recycling, occasional carry; no long balls.
  DM: {
    short_pass: { pct: 0.70, tol: 0.02 },
    back_pass: { pct: 0.12, tol: 0.02 },
    progressive_carry: { pct: 0.10, tol: 0.02 },
    through_ball: { pct: 0.05, tol: 0.02 },
    dribble: { pct: 0.03, tol: 0.02 },
  },

  // ── MID (CM) ────────────────────────────────────────────────────────────────
  // Central midfielders: recycling, carries, and vertical balls.
  MID: {
    short_pass: { pct: 0.70, tol: 0.02 },
    through_ball: { pct: 0.10, tol: 0.02 },
    progressive_carry: { pct: 0.10, tol: 0.02 },
    dribble: { pct: 0.05, tol: 0.02 },
    back_pass: { pct: 0.05, tol: 0.02 },
  },

  // ── WMID (LM / RM) ──────────────────────────────────────────────────────────
  // Wide midfielders: direct, dribble-heavy, cross when advanced.
  WMID: {
    short_pass: { pct: 0.45, tol: 0.02 },
    dribble: { pct: 0.18, tol: 0.02 },
    cross: { pct: 0.14, tol: 0.02 },
    through_ball: { pct: 0.10, tol: 0.02 },
    progressive_carry: { pct: 0.08, tol: 0.02 },
    back_pass: { pct: 0.03, tol: 0.02 },
    shot: { pct: 0.02, tol: 0.02 },
  },

  // ── AM ──────────────────────────────────────────────────────────────────────
  // Attacking midfielders: thread passes, dribble into space, shoot — no crossing.
  AM: {
    short_pass: { pct: 0.45, tol: 0.02 },
    through_ball: { pct: 0.25, tol: 0.02 },
    dribble: { pct: 0.20, tol: 0.02 },
    shot: { pct: 0.10, tol: 0.02 },
  },

  // ── ATT (ST) ────────────────────────────────────────────────────────────────
  // Central strikers: finishing first, link-up second; no crossing.
  ATT: {
    shot: { pct: 0.50, tol: 0.02 },
    short_pass: { pct: 0.22, tol: 0.02 },
    dribble: { pct: 0.15, tol: 0.02 },
    through_ball: { pct: 0.08, tol: 0.02 },
    cutback: { pct: 0.05, tol: 0.02 },
  },

  // ── WATT (LW / RW) ──────────────────────────────────────────────────────────
  // Wide attackers: dribble and shoot; cutback near byline; crosses are for WMID.
  WATT: {
    dribble: { pct: 0.35, tol: 0.02 },
    shot: { pct: 0.30, tol: 0.02 },
    cutback: { pct: 0.20, tol: 0.02 },
    short_pass: { pct: 0.10, tol: 0.02 },
    through_ball: { pct: 0.05, tol: 0.02 },
  },
};
