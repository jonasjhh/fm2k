import { StatsAccumulator, CONTESTED_ACTION_TYPES } from './stats.ts';
import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import { mulberry32 } from './distribution.ts';
import type { MatchEvent, MatchState, EventType } from './types.ts';
import type { Team, Formation } from '../shared/types.ts';
import { createTestTeam as sharedTeam } from './test-fixtures.ts';

/** Player ratings key by id across both sides, so each team gets prefixed ids. */
function createTestTeam(id: string, name: string, formation: Formation = '4-4-2'): Team {
  return sharedTeam(id, name, formation, { idPrefix: `${id}-` });
}

/** Minimal event for feeding the accumulator directly (resultingState is never read). */
function ev(type: EventType, team: 'home' | 'away', extra: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: `t-${type}-${Math.random()}`, type, minute: 10, team,
    description: type, resultingState: {} as MatchState, ...extra,
  };
}

describe('StatsAccumulator:', () => {
  test('counts success events into completion and breakdown', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('short_pass', 'home', { playerId: 'p1' }),
      ev('short_pass', 'home', { playerId: 'p1' }),
      ev('long_pass', 'home', { playerId: 'p2' }),
      ev('dribble', 'away', { playerId: 'q1' }),
    ]);
    const s = acc.build();
    expect(s.passes.home).toEqual({ attempted: 3, completed: 3 });
    expect(s.passes.away).toEqual({ attempted: 0, completed: 0 });
    expect(s.actionBreakdown.home.short_pass).toEqual({ attempts: 2, successes: 2 });
    expect(s.actionBreakdown.home.long_pass).toEqual({ attempts: 1, successes: 1 });
    expect(s.actionBreakdown.away.dribble).toEqual({ attempts: 1, successes: 1 });
  });

  test('a contested (defender-resolved) action counts as a failed attempt for the attacker', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('interception', 'away', {
        playerId: 'def1',
        metadata: { contestedAction: 'through_ball', attackingTeam: 'home', attackerId: 'atk1' },
      }),
    ]);
    const s = acc.build();
    expect(s.actionBreakdown.home.through_ball).toEqual({ attempts: 1, successes: 0 });
    expect(s.passes.home).toEqual({ attempted: 1, completed: 0 });
    // the interception is NOT a completed action for the defending side
    expect(s.actionBreakdown.away.through_ball).toEqual({ attempts: 0, successes: 0 });
  });

  test('possession splits by event count and degrades to 50/50 with no events', () => {
    expect(new StatsAccumulator().build().possession).toEqual({ home: 50, away: 50 });
    const acc = new StatsAccumulator();
    acc.record([ev('short_pass', 'home'), ev('short_pass', 'home'), ev('dribble', 'away')]);
    expect(acc.build().possession).toEqual({ home: 67, away: 33 });
  });

  test('a goal following a quick turnover-then-carry counts as a fast break', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('interception', 'home', { minute: 40 }),
      ev('long_pass', 'home', { minute: 40 }),
      ev('shot', 'home', { minute: 41 }),
      ev('goal', 'home', { minute: 41 }),
    ]);
    expect(acc.build().fastBreakGoals).toEqual({ home: 1, away: 0 });
  });

  test('a goal is not a fast break without a preceding turnover credited to the scoring side', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('short_pass', 'home', { minute: 40 }),
      ev('long_pass', 'home', { minute: 40 }),
      ev('goal', 'home', { minute: 41 }),
    ]);
    expect(acc.build().fastBreakGoals).toEqual({ home: 0, away: 0 });
  });

  test('a goal is not a fast break if the turnover-to-goal gap is too slow', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('interception', 'home', { minute: 10 }),
      ev('long_pass', 'home', { minute: 10 }),
      ev('goal', 'home', { minute: 20 }),
    ]);
    expect(acc.build().fastBreakGoals).toEqual({ home: 0, away: 0 });
  });

  test('a goal is not a fast break without a long pass/through ball carrying it forward', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('interception', 'home', { minute: 40 }),
      ev('short_pass', 'home', { minute: 40 }),
      ev('goal', 'home', { minute: 41 }),
    ]);
    expect(acc.build().fastBreakGoals).toEqual({ home: 0, away: 0 });
  });

  test('duel wins tally per type for the winning side, regardless of event team', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('dribble', 'home', { metadata: { duel: { duelType: 'dribble', winnerSide: 'home', winnerId: 'a', loserId: 'b', margin: 3 } } }),
      // a turnover event credits the defending side that won the duel:
      ev('tackle', 'away', { metadata: { duel: { duelType: 'pass', winnerSide: 'away', winnerId: 'c', loserId: 'd', margin: 1 } } }),
      ev('tackle', 'away', { metadata: { duel: { duelType: 'pass', winnerSide: 'away', winnerId: 'c', loserId: 'd', margin: 2 } } }),
      // events without duel metadata are ignored:
      ev('short_pass', 'home'),
    ]);
    const s = acc.build();
    expect(s.duelsWon).toEqual({
      home: { speed: 0, strength: 0, dribble: 1, pass: 0, shot: 0 },
      away: { speed: 0, strength: 0, dribble: 0, pass: 2, shot: 0 },
    });
  });

  test('player ratings reward goals/saves and punish cards, clamped to the 10-point scale', () => {
    const acc = new StatsAccumulator();
    acc.record([
      ev('goal', 'home', { playerId: 'scorer' }),
      ev('goal', 'home', { playerId: 'scorer' }),
      ev('goal', 'home', { playerId: 'scorer' }),
      ev('goal', 'home', { playerId: 'scorer' }),
      ev('save', 'away', { playerId: 'keeper' }),
      ev('red_card', 'away', { playerId: 'thug' }),
      ev('red_card', 'away', { playerId: 'thug' }),
    ]);
    const r = acc.build().playerRatings;
    expect(r.scorer).toBe(9.9);       // 6.5 + 4.0 clamped
    expect(r.keeper).toBeCloseTo(6.7);
    expect(r.thug).toBe(5.0);         // 6.5 - 2.0 clamped
  });

  test('matches the historical statistics formulas over a full seeded match', () => {
    const home = createTestTeam('home', 'Home');
    const away = createTestTeam('away', 'Away');
    const sim = new DuelMatchSimulator({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: home, awayTeam: away,
      homeStarters: home.squad, awayStarters: away.squad,
      rng: mulberry32(42),
    });
    const result = sim.simulate();
    const events = result.events;
    const s = result.statistics;

    const count = (team: 'home' | 'away', type: string): number =>
      events.filter(e => e.team === team && e.type === type).length;

    expect(s.shots.home).toBe(count('home', 'shot') + count('home', 'goal'));
    expect(s.shots.away).toBe(count('away', 'shot') + count('away', 'goal'));
    expect(s.shotsOnTarget.home).toBe(count('home', 'goal') + count('away', 'save'));
    expect(s.shotsOnTarget.away).toBe(count('away', 'goal') + count('home', 'save'));
    expect(s.corners).toEqual({ home: count('home', 'corner'), away: count('away', 'corner') });
    expect(s.fouls).toEqual({ home: count('home', 'foul'), away: count('away', 'foul') });
    expect(s.cards.yellow).toEqual({ home: count('home', 'yellow_card'), away: count('away', 'yellow_card') });
    expect(s.cards.red).toEqual({ home: count('home', 'red_card'), away: count('away', 'red_card') });

    const homeEvents = events.filter(e => e.team === 'home').length;
    expect(s.possession.home).toBe(Math.round((homeEvents / events.length) * 100));
    expect(s.possession.away).toBe(100 - s.possession.home);

    // sanity on the new counters
    for (const side of ['home', 'away'] as const) {
      expect(s.passes[side].attempted).toBeGreaterThan(0);
      expect(s.passes[side].completed).toBeGreaterThan(0);
      expect(s.passes[side].attempted).toBeGreaterThanOrEqual(s.passes[side].completed);
      for (const t of CONTESTED_ACTION_TYPES) {
        expect(s.actionBreakdown[side][t].attempts).toBeGreaterThanOrEqual(s.actionBreakdown[side][t].successes);
      }
    }
    // duelsWon tallies exactly the events carrying duel metadata
    if (!s.duelsWon) { throw new Error('expected duelsWon on a v2 result'); }
    for (const side of ['home', 'away'] as const) {
      const metaWins = events.filter(e =>
        (e.metadata?.duel as { winnerSide?: string } | undefined)?.winnerSide === side).length;
      const tallied = Object.values(s.duelsWon[side]).reduce((a, b) => a + b, 0);
      expect(tallied).toBe(metaWins);
      expect(tallied).toBeGreaterThan(0);
    }

    for (const rating of Object.values(s.playerRatings)) {
      expect(rating).toBeGreaterThanOrEqual(5.0);
      expect(rating).toBeLessThanOrEqual(9.9);
    }
  });

  test('mid-match getStatistics() accumulates as minutes tick', () => {
    const home = createTestTeam('home', 'Home');
    const away = createTestTeam('away', 'Away');
    const sim = new DuelMatchSimulator({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: home, awayTeam: away,
      homeStarters: home.squad, awayStarters: away.squad,
      rng: mulberry32(7),
    });
    let state = sim.getCurrentState();
    for (let i = 0; i < 45; i++) {
      state = sim.simulateMinute(state).nextState;
    }
    const half = sim.getStatistics();
    expect(half.passes.home.attempted + half.passes.away.attempted).toBeGreaterThan(0);
    for (let i = 0; i < 46; i++) {
      state = sim.simulateMinute(state).nextState;
    }
    const full = sim.getStatistics();
    expect(full.passes.home.attempted).toBeGreaterThan(half.passes.home.attempted);
  });
});
