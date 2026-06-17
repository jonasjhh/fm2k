import { MatchSimulator } from './match-simulator.ts';
import { NEUTRAL_PARAMS, type MatchParameters } from '../tactics/match-parameters.ts';
import type { Player, PlayerAttributes, Position, Team } from '../shared/types.ts';

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
    speed: v, strength: v, agility: v, passing: v, finishing: v,
    technique: v, defending: v, stamina: v, awareness: v, composure: v,
  };
}

const FORMATION_442: [Position, number][] = [
  ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2],
];

function team(id: string, value: number, params?: MatchParameters): Team {
  const starters: Player[] = [];
  FORMATION_442.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: `${id} ${pos}${i}`, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(value) });
    }
  });
  return {
    id, name: id, formation: '4-4-2', starters, substitutes: [],
    colors: { primary: '#fff', secondary: '#000' }, tacticsParams: params,
  };
}

/** Aggregate stats over N seeded matches with the given per-side params. */
function runMatches(n: number, homeParams: MatchParameters, awayParams: MatchParameters) {
  let goals = 0, homeShots = 0, awayShots = 0, homeGoals = 0, awayGoals = 0;
  for (let s = 0; s < n; s++) {
    const sim = new MatchSimulator({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: team('home', 60), awayTeam: team('away', 60),
      homeParams, awayParams, rng: mulberry32(s + 1),
    });
    const r = sim.simulate();
    homeGoals += r.finalState.homeScore;
    awayGoals += r.finalState.awayScore;
    goals += r.finalState.homeScore + r.finalState.awayScore;
    homeShots += r.statistics.shots.home;
    awayShots += r.statistics.shots.away;
  }
  return { goals, homeShots, awayShots, homeGoals, awayGoals, avgGoals: goals / n };
}

const N = 60;

describe('tactical parameters change match behaviour:', () => {
  it('given neutral params then average goals sit in a realistic band (inflation guardrail)', () => {
    const { avgGoals } = runMatches(N, NEUTRAL_PARAMS, NEUTRAL_PARAMS);
    expect(avgGoals).toBeGreaterThan(1.0);
    expect(avgGoals).toBeLessThan(5.0);
  });

  it('given a more compact defence then it concedes fewer goals against the same attacker', () => {
    const attacking: MatchParameters = { ...NEUTRAL_PARAMS, shotFrequency: 80, chanceQuality: 70 };
    const compact: MatchParameters = { ...NEUTRAL_PARAMS, defensiveCompactness: 90 };
    const porous: MatchParameters = { ...NEUTRAL_PARAMS, defensiveCompactness: 20, spaceLeftBehind: 80 };
    const vsCompact = runMatches(N, compact, attacking);
    const vsPorous = runMatches(N, porous, attacking);
    expect(vsCompact.awayGoals).toBeLessThan(vsPorous.awayGoals);
  });

  it('given a high shot-frequency / chance-quality side then it out-shoots a neutral mirror', () => {
    const aggressive: MatchParameters = { ...NEUTRAL_PARAMS, shotFrequency: 90, chanceQuality: 90 };
    const { homeShots, awayShots } = runMatches(N, aggressive, NEUTRAL_PARAMS);
    expect(homeShots).toBeGreaterThan(awayShots);
  });

  it('given two well-suited attacking sides then goals rise but stay out of basketball territory', () => {
    const aggressive: MatchParameters = { ...NEUTRAL_PARAMS, shotFrequency: 80, chanceQuality: 80, tempo: 70 };
    const { avgGoals } = runMatches(N, aggressive, aggressive);
    expect(avgGoals).toBeGreaterThan(runMatches(N, NEUTRAL_PARAMS, NEUTRAL_PARAMS).avgGoals);
    expect(avgGoals).toBeLessThan(8.0);
  });
});
