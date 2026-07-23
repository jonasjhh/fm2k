import { simulateMatch } from './simulate.ts';
import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: 10 };
}
const F: [PlayerPosition, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];
function team(id: string, v: number): Team {
  const starters: Player[] = [];
  F.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad: starters, colors: { primary: '#fff', secondary: '#000' } };
}
const intent = (formation: Team['formation']): TeamTacticsIntent =>
  ({ formation, style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 } });

/** A side's full match input: squad + intent, with starters defaulting to the whole squad. */
function side(id: string, v: number, formation: Team['formation']) {
  const t = team(id, v);
  return { team: t, starters: t.squad, intent: intent(formation) };
}

describe('simulateMatch (standalone contract):', () => {
  it('returns a self-describing result whose score matches the goal events', () => {
    const r = simulateMatch({
      home: side('h', 60, '4-4-2'),
      away: side('a', 60, '4-4-2'),
      rng: mulberry32(1),
    });
    const homeGoals = r.events.filter(e => e.type === 'goal' && e.team === 'home').length;
    const awayGoals = r.events.filter(e => e.type === 'goal' && e.team === 'away').length;
    expect(r.score.home).toBe(homeGoals);
    expect(r.score.away).toBe(awayGoals);
  });

  it('produces 11 player updates per side with minutes, energy and card fields', () => {
    const r = simulateMatch({
      home: side('h', 60, '4-4-2'),
      away: side('a', 60, '4-4-2'),
      rng: mulberry32(2),
    });
    expect(r.playerUpdates.home).toHaveLength(11);
    expect(r.playerUpdates.away).toHaveLength(11);
    for (const u of r.playerUpdates.home) {
      expect(u.minutesPlayed).toBeGreaterThan(0);
      expect(u.endEnergy).toBeLessThanOrEqual(100);
      expect(typeof u.redCard).toBe('boolean');
    }
  });

  it('is deterministic under a fixed seed', () => {
    const run = () => simulateMatch({
      home: side('h', 65, '4-3-3'),
      away: side('a', 45, '5-4-1'),
      rng: mulberry32(7),
    });
    const a = run(); const b = run();
    expect(a.score).toEqual(b.score);
    expect(a.statistics.shots).toEqual(b.statistics.shots);
  });

  it('the clearly stronger side wins comfortably over many seeds', () => {
    let strongWins = 0;
    for (let s = 0; s < 60; s++) {
      const r = simulateMatch({
        home: side('h', 80, '4-3-3'),
        away: side('a', 25, '4-4-2'),
        rng: mulberry32(s + 1),
      });
      if (r.score.home > r.score.away) { strongWins++; }
    }
    expect(strongWins).toBeGreaterThan(40); // 80 vs 25 — wins the vast majority (~72%).
    // Loosened 45→40 by TASK_21 (CBs tuck central → weaker side denied a touch differently);
    // TASK_07 re-locks this gate against the calibration harness.
  });
});
