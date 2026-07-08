import type { OccurrenceEvent } from '@fm2k/engine';
import { buildGoalBuildup } from './session.ts';

const timestamp = { year: 2026, month: 1, day: 1, hour: 0, minute: 0 };

function ev(eventType: string, team: 'home' | 'away', minute: number, overrides: Partial<OccurrenceEvent['payload']> = {}): OccurrenceEvent {
  return {
    id: `${eventType}-${minute}-${team}`,
    eventType,
    occurrenceId: 'f1',
    occurrenceType: 'match',
    timestamp,
    payload: {
      minute, team, description: `${team} ${eventType}`, homeScore: 0, awayScore: 0, ...overrides,
    },
  };
}

describe('buildGoalBuildup:', () => {
  it('collects the contiguous same-team run of on-ball actions before the goal', () => {
    const events = [
      ev('kickoff', 'home', 1),
      ev('short_pass', 'home', 10),
      ev('through_ball', 'home', 11),
      ev('shot', 'home', 11),
      ev('goal', 'home', 11),
    ];
    const buildup = buildGoalBuildup(events, 4);
    expect(buildup.map(e => e.type)).toEqual(['short_pass', 'through_ball', 'shot']);
    expect(buildup.every(e => e.team === 'home')).toBe(true);
  });

  it('stops at the first event credited to the other team (a turnover)', () => {
    const events = [
      ev('long_pass', 'away', 5),
      ev('interception', 'away', 8), // credited to away, breaks the home run below
      ev('short_pass', 'home', 9),
      ev('cross', 'home', 10),
      ev('goal', 'home', 10),
    ];
    const buildup = buildGoalBuildup(events, 4);
    expect(buildup.map(e => e.type)).toEqual(['short_pass', 'cross']);
  });

  it('stops at a non-buildup event (phase marker, card, injury) even from the same team', () => {
    const events = [
      ev('yellow_card', 'home', 20),
      ev('dribble', 'home', 25),
      ev('shot', 'home', 25),
      ev('goal', 'home', 25),
    ];
    const buildup = buildGoalBuildup(events, 3);
    expect(buildup.map(e => e.type)).toEqual(['dribble', 'shot']);
  });

  it('caps the lookback at maxLookback events', () => {
    const events = [
      ev('short_pass', 'home', 1),
      ev('short_pass', 'home', 2),
      ev('short_pass', 'home', 3),
      ev('short_pass', 'home', 4),
      ev('goal', 'home', 5),
    ];
    const buildup = buildGoalBuildup(events, 4, 2);
    expect(buildup.map(e => e.minute)).toEqual([3, 4]);
  });

  it('returns an empty build-up when the goal opens the collected window', () => {
    const events = [ev('goal', 'home', 1)];
    expect(buildGoalBuildup(events, 0)).toEqual([]);
  });
});
