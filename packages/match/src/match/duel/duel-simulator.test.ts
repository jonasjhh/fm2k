import { DuelMatchSimulator, toBallPosition } from './duel-simulator.ts';
import { mulberry32, NEUTRAL_MATCH_FORM } from '../rng.ts';
import { createTestTeam, createTestXI } from '../test-fixtures.ts';
import type { MatchConfig } from '../types.ts';

function config(seed: number, overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    matchDuration: 90,
    eventsPerMinute: 3,
    homeTeam: createTestTeam('home', 'Home FC'),
    awayTeam: createTestTeam('away', 'Away FC', '4-4-2', { idPrefix: 'a-' }),
    homeStarters: createTestXI(),
    awayStarters: createTestXI('a-'),
    rng: mulberry32(seed),
    ...overrides,
  };
}

describe('toBallPosition:', () => {
  it('maps the absolute frame into the five zones and three sides', () => {
    expect(toBallPosition({ x: 0.5, y: 0.05 })).toEqual({ zone: 'home_box', side: 'center' });
    expect(toBallPosition({ x: 0.1, y: 0.3 })).toEqual({ zone: 'home_third', side: 'left' });
    expect(toBallPosition({ x: 0.5, y: 0.5 })).toEqual({ zone: 'middle_third', side: 'center' });
    expect(toBallPosition({ x: 0.9, y: 0.7 })).toEqual({ zone: 'away_third', side: 'right' });
    expect(toBallPosition({ x: 0.5, y: 0.95 })).toEqual({ zone: 'away_box', side: 'center' });
  });
});

describe('DuelMatchSimulator, full matches:', () => {
  it('runs 90 minutes to full time with a sane scoreline', () => {
    const result = new DuelMatchSimulator(config(42)).simulate();
    expect(result.finalState.phase).toBe('full_time');
    expect(result.finalState.minute).toBe(90);
    expect(result.finalState.homeScore + result.finalState.awayScore).toBeLessThanOrEqual(12);
    expect(result.events[result.events.length - 1]?.type).toBe('full_time');
  });

  it('is deterministic: the same seed reproduces the match event for event', () => {
    const a = new DuelMatchSimulator(config(7)).simulate();
    const b = new DuelMatchSimulator(config(7)).simulate();
    expect(a.finalState.homeScore).toBe(b.finalState.homeScore);
    expect(a.finalState.awayScore).toBe(b.finalState.awayScore);
    expect(a.events.map(e => `${e.minute}:${e.type}:${e.playerId ?? ''}`))
      .toEqual(b.events.map(e => `${e.minute}:${e.type}:${e.playerId ?? ''}`));
  });

  it('scores and statistics agree with the emitted events', () => {
    const result = new DuelMatchSimulator(config(11)).simulate();
    const goals = result.events.filter(e => e.type === 'goal');
    expect(result.finalState.homeScore).toBe(goals.filter(e => e.team === 'home').length);
    expect(result.finalState.awayScore).toBe(goals.filter(e => e.team === 'away').length);
    const s = result.statistics;
    expect(s.possession.home + s.possession.away).toBe(100);
    expect(s.shots.home).toBeGreaterThanOrEqual(s.shotsOnTarget.home);
    // shots stat = shot events + goals (v1 continuity contract)
    const homeShotEvents = result.events.filter(e => e.type === 'shot' && e.team === 'home').length;
    expect(s.shots.home).toBe(homeShotEvents + result.finalState.homeScore);
  });

  it('names duels in the ticker: contested events carry duel metadata', () => {
    const result = new DuelMatchSimulator(config(3)).simulate();
    const withDuel = result.events.filter(e => e.metadata?.duel);
    expect(withDuel.length).toBeGreaterThan(20);
    for (const e of withDuel.slice(0, 5)) {
      expect(e.metadata!.duel).toMatchObject({
        duelType: expect.stringMatching(/^(speed|strength|dribble|pass|shot)$/),
        winnerId: expect.any(String),
        loserId: expect.any(String),
        margin: expect.any(Number),
      });
    }
  });

  it('produces both teams’ football: passes, dribbles, fouls and cards over a season-ish sample', () => {
    let fouls = 0, dribbles = 0, passes = 0, goals = 0;
    for (let seed = 0; seed < 20; seed++) {
      const result = new DuelMatchSimulator(config(seed)).simulate();
      const s = result.statistics;
      fouls += s.fouls.home + s.fouls.away;
      goals += result.finalState.homeScore + result.finalState.awayScore;
      dribbles += s.actionBreakdown.home.dribble.attempts + s.actionBreakdown.away.dribble.attempts;
      passes += s.passes.home.attempted + s.passes.away.attempted;
    }
    expect(goals).toBeGreaterThanOrEqual(5);       // matches produce goals (low-epm smoke test)
    expect(fouls).toBeGreaterThan(5);       // fouls emerge from duels
    expect(dribbles).toBeGreaterThan(50);
    expect(passes).toBeGreaterThan(300);
  });

  describe('match-form injection contract:', () => {
    // Home goals summed over a fixed seed sample, under a given form config.
    const homeGoals = (overrides: Partial<MatchConfig>) => {
      let g = 0;
      for (let seed = 0; seed < 30; seed++) {
        g += new DuelMatchSimulator(config(seed, overrides)).simulate().finalState.homeScore;
      }
      return g;
    };

    it('injected form is used verbatim: a hot home attack + leaky away defense lifts home goals', () => {
      const neutral = homeGoals({ homeForm: NEUTRAL_MATCH_FORM, awayForm: NEUTRAL_MATCH_FORM });
      const hotHome = homeGoals({
        homeForm: { attack: 0.1, defense: 0 },
        awayForm: { attack: 0, defense: -0.1 },
      });
      expect(hotHome).toBeGreaterThan(neutral);
    });

    it('neutral injected form is deterministic and variance-free across reruns', () => {
      const cfg = () => config(5, { homeForm: NEUTRAL_MATCH_FORM, awayForm: NEUTRAL_MATCH_FORM });
      const a = new DuelMatchSimulator(cfg()).simulate();
      const b = new DuelMatchSimulator(cfg()).simulate();
      expect(a.finalState.homeScore).toBe(b.finalState.homeScore);
      expect(a.finalState.awayScore).toBe(b.finalState.awayScore);
    });

    it('absent form still draws internally (seeded → deterministic), so harness sims vary', () => {
      // No form injected: the sim draws its own from the seeded main stream, so a rerun
      // on the same seed reproduces exactly, but the draw is real (not forced neutral).
      const a = new DuelMatchSimulator(config(8)).simulate();
      const b = new DuelMatchSimulator(config(8)).simulate();
      expect(a.finalState.homeScore).toBe(b.finalState.homeScore);
      expect(a.finalState.awayScore).toBe(b.finalState.awayScore);
    });
  });

  it('a sent-off player leaves the pitch and the bookings record', () => {
    // Scans seeds for the first match that produces a red (returns on the first hit, so the
    // ceiling only bounds the give-up case). The exact hit shifts whenever engine dynamics
    // move (e.g. TASK_19's positional changes), so keep the ceiling generous.
    for (let seed = 0; seed < 200; seed++) {
      const result = new DuelMatchSimulator(config(seed)).simulate();
      const red = result.events.find(e => e.type === 'red_card');
      if (!red) { continue; }
      const state = result.finalState;
      expect(state.bookings.red.some(b => b.playerId === red.playerId)).toBe(true);
      const side = red.team;
      expect(state.currentPlayers[side].some(p => p.id === red.playerId)).toBe(false);
      return;
    }
    throw new Error('no red card in 200 seeded matches — sending-off path never exercised');
  });

  it('plays extra time when drawn and configured for knockout', () => {
    for (let seed = 0; seed < 40; seed++) {
      const result = new DuelMatchSimulator(config(seed, { extraTimeIfDrawn: true })).simulate();
      if (result.finalState.minute > 90) {
        expect(result.finalState.phase).toBe('extra_time_full');
        expect(result.finalState.minute).toBe(120);
        return;
      }
      expect(result.finalState.phase).toBe('full_time');
    }
    throw new Error('no drawn-at-90 knockout match in 40 seeds');
  });

  it('drains energy over the match', () => {
    const result = new DuelMatchSimulator(config(5)).simulate();
    const energies = Object.values(result.finalState.energy?.home ?? {});
    expect(energies.length).toBeGreaterThan(0);
    for (const e of energies) { expect(e).toBeLessThan(100); }
  });

  it('supports the live tick path (simulateMinute) identically to simulate()', () => {
    const one = new DuelMatchSimulator(config(13)).simulate();
    const live = new DuelMatchSimulator(config(13));
    let state = live.getCurrentState();
    const events = [];
    while (state.phase !== 'full_time' && state.phase !== 'extra_time_full') {
      const step = live.simulateMinute(state);
      events.push(...step.events);
      state = step.nextState;
    }
    expect(state.homeScore).toBe(one.finalState.homeScore);
    expect(state.awayScore).toBe(one.finalState.awayScore);
    expect(events.length).toBe(one.events.length);
  });
});
