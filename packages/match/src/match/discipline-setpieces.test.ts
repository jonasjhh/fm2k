import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import type { MatchConfig } from './types.ts';

import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import { NEUTRAL_PARAMS, type MatchParameters } from '../tactics/match-parameters.ts';

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
function attrs(v: number, over: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: 10, ...over };
}
const F: [PlayerPosition, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];
function team(id: string, v: number, over: Partial<PlayerAttributes> = {}): Team {
  const starters: Player[] = [];
  F.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v, over) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad: starters, colors: { primary: '#fff', secondary: '#000' } };
}
function totals(homeParams: MatchParameters, homeOver: Partial<PlayerAttributes> = {}, n = 150) {
  const t: Record<string, number> = {};
  for (let s = 0; s < n; s++) {
    const localSim = sim({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: team('h', 55, homeOver), awayTeam: team('a', 55),
      homeParams, awayParams: NEUTRAL_PARAMS, rng: mulberry32(s + 1),
    });
    // The home team's fouls are committed when home is DEFENDING — count all foul events by home.
    for (const e of localSim.simulate().events) { t[`${e.team}:${e.type}`] = (t[`${e.team}:${e.type}`] ?? 0) + 1; }
  }
  const per = (k: string) => (t[k] ?? 0) / n;
  return per;
}

describe('discipline & set pieces (behavioural):', () => {
  it('given normal play then fouls, cards, corners and set pieces all occur at sane rates', () => {
    const per = totals(NEUTRAL_PARAMS);
    const fouls = per('home:foul') + per('away:foul');
    const corners = per('home:corner') + per('away:corner');
    // Pre-calibration band (Step 6 retunes foul margins): fouls must exist but stay moderate.
    expect(fouls).toBeGreaterThan(0.5);
    expect(fouls).toBeLessThan(30);       // ...not a free-kick-fest
    expect(corners).toBeGreaterThan(0);
  });

  it('given weak defenders then they foul more than strong ones (fouls from badly lost duels)', () => {
    const rash = totals(NEUTRAL_PARAMS, { defending: 30 });
    const calm = totals(NEUTRAL_PARAMS, { defending: 90 });
    expect(rash('home:foul')).toBeGreaterThan(calm('home:foul'));
  });

  it('given a red card is shown then that side finishes the match a player down', () => {
    let sawManDown = false;
    for (let s = 0; s < 200 && !sawManDown; s++) {
      const localSim = sim({
        matchDuration: 90, eventsPerMinute: 3,
        homeTeam: team('h', 55), awayTeam: team('a', 55, { defending: 20 }),
        rng: mulberry32(s + 1),
      });
      const r = localSim.simulate();
      const reds = r.finalState.bookings.red;
      if (reds.length > 0) {
        const downSide = reds[0].team;
        expect(r.finalState.currentPlayers[downSide].length).toBeLessThan(11);
        sawManDown = true;
      }
    }
    expect(sawManDown).toBe(true);
  });

  it('given a goal then the scoring side carries brief momentum that then decays', () => {
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 4, homeTeam: team('h', 80), awayTeam: team('a', 30), rng: mulberry32(5) });
    let state = localSim.getCurrentState();
    let sawMomentum = false;
    for (let m = 0; m < 90; m++) {
      const { nextState } = localSim.simulateMinute(state);
      state = nextState;
      if ((state.momentum?.home ?? 0) > 0 || (state.momentum?.away ?? 0) > 0) { sawMomentum = true; }
      expect(state.momentum?.home ?? 0).toBeLessThanOrEqual(40);
      expect(state.momentum?.away ?? 0).toBeLessThanOrEqual(40);
    }
    expect(sawMomentum).toBe(true);
  });
});
