import { MatchSimulator, type MatchConfig } from './match-simulator.ts';

import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import { NEUTRAL_PARAMS, type MatchParameters } from '../tactics/match-parameters.ts';

function sim(config: Omit<MatchConfig, 'homeStarters' | 'awayStarters'> & Partial<Pick<MatchConfig, 'homeStarters' | 'awayStarters'>>): MatchSimulator {
  return new MatchSimulator({
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
  return { speed: v, strength: v, agility: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, awareness: v, composure: v };
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

/** Total count of each home-team action type over N seeded matches with the given home params. */
function tally(homeParams: MatchParameters, n = 120): Record<string, number> {
  const t: Record<string, number> = {};
  for (let s = 0; s < n; s++) {
    const localSim = sim({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: team('h', 55), awayTeam: team('a', 55),
      homeParams, awayParams: NEUTRAL_PARAMS, rng: mulberry32(s + 1),
    });
    for (const e of localSim.simulate().events) {
      if (e.team === 'home') { t[e.type] = (t[e.type] ?? 0) + 1; }
    }
  }
  return t;
}

describe('action vocabulary (behavioural):', () => {
  it('given a normal match then the new action types all occur', () => {
    const t = tally(NEUTRAL_PARAMS);
    expect(t.long_pass ?? 0).toBeGreaterThan(0);
    expect(t.through_ball ?? 0).toBeGreaterThan(0);
  });

  it('given high passing risk then through-balls rise and safe short passing falls', () => {
    const neutral = tally(NEUTRAL_PARAMS);
    const risky = tally({ ...NEUTRAL_PARAMS, passingRisk: 85 });
    expect(risky.through_ball).toBeGreaterThan(neutral.through_ball);
    expect(risky.short_pass).toBeLessThan(neutral.short_pass);
  });

  it('given high build-up width then crosses (and the headers they create) rise sharply', () => {
    const neutral = tally(NEUTRAL_PARAMS);
    const wide = tally({ ...NEUTRAL_PARAMS, buildUpWidth: 90 });
    expect(wide.cross ?? 0).toBeGreaterThan((neutral.cross ?? 0) + 2);
  });

  it('given a direct (long-ball) plan then long passes rise over a neutral one', () => {
    const neutral = tally(NEUTRAL_PARAMS);
    const direct = tally({ ...NEUTRAL_PARAMS, passingRisk: 75, transitionSpeed: 75 });
    expect(direct.long_pass).toBeGreaterThan(neutral.long_pass);
  });

  it('given a cross is swung in then it can produce a headed goal (header → goal chain exists)', () => {
    // Over many wide-team matches, at least one cross should be headed home.
    let headedGoals = 0;
    for (let s = 0; s < 60; s++) {
      const localSim = sim({
        matchDuration: 90, eventsPerMinute: 3,
        homeTeam: team('h', 70), awayTeam: team('a', 40),
        homeParams: { ...NEUTRAL_PARAMS, buildUpWidth: 95 }, awayParams: NEUTRAL_PARAMS,
        rng: mulberry32(s + 1),
      });
      for (const e of localSim.simulate().events) {
        if (e.type === 'goal' && e.description.includes('heads')) { headedGoals++; }
      }
    }
    expect(headedGoals).toBeGreaterThan(0);
  });
});
