import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import type { MatchConfig } from './types.ts';

import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';

function sim(config: Omit<MatchConfig, 'homeStarters' | 'awayStarters'> & Partial<Pick<MatchConfig, 'homeStarters' | 'awayStarters'>>): DuelMatchSimulator {
  return new DuelMatchSimulator({
    homeStarters: config.homeTeam.squad,
    awayStarters: config.awayTeam.squad,
    ...config,
  });
}

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
  return {
    speed: v, strength: v, passing: v, finishing: v,
    technique: v, defending: v, stamina: v, goalkeeping: v,
  };
}

const FORMATION_442: [PlayerPosition, number][] = [
  ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2],
];

function team(id: string, value: number): Team {
  const starters: Player[] = [];
  FORMATION_442.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(value) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad: starters, colors: { primary: '#fff', secondary: '#000' } };
}

function series(n: number, homeVal: number, awayVal: number) {
  let homeWins = 0, awayWins = 0, homeGoals = 0, awayGoals = 0, completed = 0, homeShots = 0, awayShots = 0;
  for (let s = 0; s < n; s++) {
    const localSim = sim({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: team('home', homeVal), awayTeam: team('away', awayVal), rng: mulberry32(s + 1),
    });
    const r = localSim.simulate();
    if (r.finalState.phase === 'full_time') { completed++; }
    homeGoals += r.finalState.homeScore;
    awayGoals += r.finalState.awayScore;
    homeShots += r.statistics.shots.home;
    awayShots += r.statistics.shots.away;
    if (r.finalState.homeScore > r.finalState.awayScore) { homeWins++; }
    else if (r.finalState.awayScore > r.finalState.homeScore) { awayWins++; }
  }
  return { homeWins, awayWins, homeGoals, awayGoals, completed, homeShots, awayShots };
}

/**
 * The simulator is a native 1–99 system (every skill is a weighted attribute sum
 * over ~100 ≈ probability). These assertions lock the *quality gradient* — they
 * must hold on any attribute scale — with loose thresholds so a future magnitude
 * retune does not break them.
 */
const N = 80;

describe('attribute-scale calibration (quality gradient):', () => {
  it('given a tier-1 (75) side vs a tier-3 (25) side then the stronger side dominates', () => {
    const r = series(N, 75, 25);
    expect(r.homeWins).toBeGreaterThan(r.awayWins * 5);
    expect(r.homeGoals).toBeGreaterThan(r.awayGoals);
  });

  it('given a world-class (90) side vs a minimum (15) side then it is a near-total mismatch', () => {
    // The flattened gap curve concedes the odd draw to the minnow, never a defeat.
    const r = series(N, 90, 15);
    expect(r.homeWins).toBeGreaterThanOrEqual(N * 0.85);
    expect(r.awayWins).toBeLessThanOrEqual(2);
  });

  it('given matches at any tier then every match still completes to full time', () => {
    expect(series(N, 67, 67).completed).toBe(N);
    expect(series(N, 25, 25).completed).toBe(N);
    expect(series(N, 10, 10).completed).toBe(N);
  });

  it('given an even contest then neither side wins the large majority (no built-in bias to quality)', () => {
    const r = series(N, 55, 55);
    const ratio = Math.max(r.homeWins, r.awayWins) / Math.max(1, Math.min(r.homeWins, r.awayWins));
    expect(ratio).toBeLessThan(3);
  });

  it('given an even contest then total goals sit in a realistic football band', () => {
    // This uses the *pure-neutral* engine (no formation/tactics, plus the home-advantage
    // bump), which runs a touch hotter than a real match — every real team carries a
    // formation whose compactness pulls scoring down (the distribution harness, which goes
    // through `simulateMatch`, lands even matches ≈2.6–2.8). Band kept loose accordingly.
    const perMatch = (r: ReturnType<typeof series>) => (r.homeGoals + r.awayGoals) / N;
    expect(perMatch(series(N, 55, 55))).toBeGreaterThan(0.8);
    expect(perMatch(series(N, 55, 55))).toBeLessThan(4.0);
    expect(perMatch(series(N, 30, 30))).toBeLessThan(4.0);
    expect(perMatch(series(N, 75, 75))).toBeLessThan(4.0);
  });

  it('given a quality gap then the stronger side out-shoots the weaker (defenders deny chances, not just convert)', () => {
    // The weak side should be starved of shots, not merely miss the ones it gets.
    const r = series(N, 75, 25);
    expect(r.homeShots).toBeGreaterThan(r.awayShots * 1.7);
  });
});
