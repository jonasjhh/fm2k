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
function attrs(v: number, stamina = v): PlayerAttributes {
  return {
    speed: v, strength: v, passing: v, finishing: v,
    technique: v, defending: v, goalkeeping: 10, stamina,
  };
}
const F: [PlayerPosition, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];
function team(id: string, v: number, stamina = v): Team {
  const starters: Player[] = [];
  F.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v, stamina) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad: starters, colors: { primary: '#fff', secondary: '#000' } };
}
function withFormation(t: Team, formation: Team['formation']): Team {
  return { ...t, formation };
}
function avgOutfieldEnergy(energy: Record<string, number>): number {
  const vals = Object.entries(energy).filter(([id]) => !id.includes('-GK')).map(([, v]) => v);
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

describe('in-match fatigue (behavioural):', () => {
  it('given a full match then outfield energy has clearly drained from fresh', () => {
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('h', 60), awayTeam: team('a', 60), rng: mulberry32(1) });
    const r = localSim.simulate();
    expect(avgOutfieldEnergy(r.finalState.energy?.home ?? {})).toBeLessThan(95);
  });

  it('given the match runs then energy is monotonically non-increasing', () => {
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('h', 60), awayTeam: team('a', 60), rng: mulberry32(2) });
    let state = localSim.getCurrentState();
    let prev = avgOutfieldEnergy(state.energy?.home ?? {});
    for (let m = 0; m < 90; m++) {
      const { nextState } = localSim.simulateMinute(state);
      state = nextState;
      const now = avgOutfieldEnergy(state.energy?.home ?? {});
      expect(now).toBeLessThanOrEqual(prev + 1e-9);
      prev = now;
    }
    expect(prev).toBeLessThan(90);
  });

  it('given a low-stamina squad then it tires more than a high-stamina one over 90', () => {
    const lowSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('low', 60, 20), awayTeam: team('a', 60), rng: mulberry32(3) });
    const highSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('high', 60, 95), awayTeam: team('a', 60), rng: mulberry32(3) });
    const low = avgOutfieldEnergy(lowSim.simulate().finalState.energy?.home ?? {});
    const high = avgOutfieldEnergy(highSim.simulate().finalState.energy?.home ?? {});
    expect(low).toBeLessThan(high);
  });

  it('given an already-tired squad (seeded fitness) then it starts and ends flatter', () => {
    const t = team('h', 60);
    const fitness: Record<string, number> = {};
    t.squad.forEach(p => { fitness[p.id] = 60; });
    const tiredSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: t, awayTeam: team('a', 60), homeFitness: fitness, rng: mulberry32(4) });
    const freshSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('h2', 60), awayTeam: team('a', 60), rng: mulberry32(4) });
    expect(avgOutfieldEnergy(tiredSim.simulate().finalState.energy?.home ?? {}))
      .toBeLessThan(avgOutfieldEnergy(freshSim.simulate().finalState.energy?.home ?? {}));
  });

  it('given a thin back line (3 at the back) then it tires more than a five-back over 90 (TASK_19)', () => {
    // Same squad, same seed, same opponent — only the number of bodies across the back
    // differs. A back-three covers more ground per man (positional load + more actual
    // travel as the ball swings) so it ends the match with less energy than a back-five.
    const base = team('h', 60);
    const opponent = team('a', 60);
    const threeBack = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: withFormation(base, '3-5-2'), awayTeam: opponent, rng: mulberry32(5) });
    const fiveBack = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: withFormation(base, '5-3-2'), awayTeam: opponent, rng: mulberry32(5) });
    expect(avgOutfieldEnergy(threeBack.simulate().finalState.energy?.home ?? {}))
      .toBeLessThan(avgOutfieldEnergy(fiveBack.simulate().finalState.energy?.home ?? {}));
  });

  it('given the same seed then the match is deterministic', () => {
    const a = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('h', 60), awayTeam: team('a', 50), rng: mulberry32(7) }).simulate();
    const b = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team('h', 60), awayTeam: team('a', 50), rng: mulberry32(7) }).simulate();
    expect(a.finalState.homeScore).toBe(b.finalState.homeScore);
    expect(a.finalState.awayScore).toBe(b.finalState.awayScore);
  });
});
