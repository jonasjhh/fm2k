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

/** A flat team with per-player attribute tweaks applied (e.g. one lethal striker). */
function teamWith(id: string, value: number, tweak: (p: Player) => void): Team {
  const t = team(id, value);
  t.squad.forEach(tweak);
  return t;
}

function series(n: number, homeVal: number, awayVal: number, epm = 3) {
  let homeWins = 0, awayWins = 0, homeGoals = 0, awayGoals = 0, completed = 0, homeShots = 0, awayShots = 0;
  for (let s = 0; s < n; s++) {
    const localSim = sim({
      matchDuration: 90, eventsPerMinute: epm,
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
  it('given a tier-1 (75) side vs a tier-3 (25) side then the stronger side clearly dominates', () => {
    // gap 50, beyond DUEL_GAP_CAP: the duel engine saturates it to ~gap-28, so the stronger
    // side dominates decisively but no longer by an unbounded margin (see the cup-tie note below).
    const r = series(N, 75, 25, 13);
    expect(r.homeWins).toBeGreaterThan(r.awayWins * 2);
    expect(r.homeGoals).toBeGreaterThan(r.awayGoals * 1.8);
  });

  it('given any-given-Sunday then even a tier-3 side beats a tier-1 side sometimes', () => {
    // The saturation ceiling (~75% for the favourite) is a *floor* under the minnow: over a
    // season-length sample the underdog nicks at least one win — a hot-form day (conversion
    // swing) against the favourite's cold day. Skill dominates the table; it never guarantees
    // a single result.
    const r = series(N, 75, 25, 13);
    expect(r.awayWins).toBeGreaterThan(0);
  });

  it('given a world-class (90) side vs a minimum (15) side then the mismatch saturates (no 100%)', () => {
    // gap 75 also clamps to the cap, so it plays no more lopsidedly than the 75v25 tie — the
    // minnow keeps the same real puncher's chance. Dominant, never total.
    const r = series(N, 90, 15, 13);
    expect(r.homeWins).toBeGreaterThan(r.awayWins * 2);   // still clearly on top
    expect(r.awayWins).toBeGreaterThan(0);                // but the upset remains possible
    expect(r.homeWins).toBeLessThan(N);                   // saturation: never a clean sweep
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
    expect(perMatch(series(N, 55, 55))).toBeGreaterThan(0.5);
    expect(perMatch(series(N, 55, 55))).toBeLessThan(4.0);
    expect(perMatch(series(N, 30, 30))).toBeLessThan(4.0);
    expect(perMatch(series(N, 75, 75))).toBeLessThan(4.0);
  });

  it('given a quality gap then the stronger side out-shoots the weaker (defenders deny chances, not just convert)', () => {
    // The weak side should be starved of shots, not merely miss the ones it gets.
    const r = series(N, 75, 25);
    // Ratio eased 1.7→1.6 by TASK_21 (central CBs cover more evenly, so the weak side is
    // denied a touch less lopsidedly); TASK_07 re-locks against the calibration harness.
    expect(r.homeShots).toBeGreaterThan(r.awayShots * 1.6);
  });

  it('given a lethal striker against a leaky keeper then home goals spike over a flat even match', () => {
    // Individual quality at the decisive moment — finishing vs goalkeeping in the shot duel —
    // must move the scoreline, not just the aggregate OVR. One 90-finisher + one 20-keeper.
    const baseline = series(N, 55, 55, 13);
    const homeSharp = teamWith('home', 55, p => { if (p.id === 'home-ST0') { p.attributes.finishing = 90; } });
    const awayLeaky = teamWith('away', 55, p => { if (p.id === 'away-GK0') { p.attributes.goalkeeping = 20; } });
    let homeGoals = 0;
    for (let s = 0; s < N; s++) {
      const r = sim({
        matchDuration: 90, eventsPerMinute: 13,
        homeTeam: homeSharp, awayTeam: awayLeaky, rng: mulberry32(s + 1),
      }).simulate();
      homeGoals += r.finalState.homeScore;
    }
    expect(homeGoals).toBeGreaterThan(baseline.homeGoals);
  });

  it('given a strong, poor-finishing striker then his headers convert better than his ground shots', () => {
    // The header-conversion blend must make a physical striker a real aerial threat despite weak
    // finishing. Comparing the SAME player's header vs open-play conversion removes every confound
    // (open-play ability, headed-share skew): the only difference is that a header finishes off
    // (strength+finishing)/2 while a ground shot finishes off finishing alone. With strength 85 /
    // finishing 35 the header attr is 60 vs 35 on the ground — so headers should go in at a higher
    // rate. This assertion FAILS under the old pure-finishing conversion (both rates equal).
    const home = teamWith('home', 55, p => {
      if (p.id === 'home-ST0') { p.attributes.strength = 85; p.attributes.finishing = 35; }
    });
    const away = team('away', 55);
    let headerShots = 0, headerGoals = 0, openShots = 0, openGoals = 0;
    for (let s = 0; s < N; s++) {
      const r = sim({
        matchDuration: 90, eventsPerMinute: 13, homeTeam: home, awayTeam: away, rng: mulberry32(s + 1),
      }).simulate();
      for (const e of r.events) {
        if (e.playerId !== 'home-ST0') { continue; }
        if (e.type === 'shot') { e.description.includes('header') ? headerShots++ : openShots++; }
        if (e.type === 'goal') { e.description.includes('heads') ? headerGoals++ : openGoals++; }
      }
    }
    // Enough of each shot type to make the conversion ratios meaningful.
    expect(headerShots).toBeGreaterThan(20);
    expect(openShots).toBeGreaterThan(20);
    expect(headerGoals / headerShots).toBeGreaterThan(openGoals / openShots);
  });
});
