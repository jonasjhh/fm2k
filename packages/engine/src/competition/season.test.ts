import { Season } from './season.ts';
import { CompetitionManager } from './competition-manager.ts';
import { LeagueFormat } from './league-format.ts';
import { createGameDateTime, addMinutes, addDays } from '@fm2k/timeline';
import type { Team, Formation, Player, Position } from '@fm2k/match';

const EARLY_START = createGameDateTime(2025, 8, 16, 15, 0);
const LATE_START = createGameDateTime(2025, 8, 23, 15, 0);

function player(id: string, position: Position): Player {
  return {
    id, name: id, nationality: 'norwegian', age: 25, position, potential: 70,
    attributes: { speed: 70, strength: 70, agility: 70, passing: 70, finishing: 70, technique: 70, defending: 70, stamina: 75, awareness: 70, composure: 70 },
  };
}

function team(id: string): Team {
  const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return {
    id, name: id.toUpperCase(), formation: '4-4-2' as Formation, colors: { primary: '#fff', secondary: '#000' },
    squad: positions.map((p, i) => player(`${id}-p${i}`, p)),
  };
}

function makeLeague(competitionId: string, startDate = EARLY_START): CompetitionManager {
  return new CompetitionManager({
    format: new LeagueFormat(),
    teams: ['t1', 't2', 't3', 't4'].map(team),
    startDate,
    competitionId,
    eventsPerMinute: 1,
  });
}

describe('Season:', () => {
  test('competitions returns the configured set, in order', () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    expect(season.competitions()).toEqual([a, b]);
  });

  test('byId finds a competition by competitionId', () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    expect(season.byId('b')).toBe(b);
  });

  test('byId returns undefined for an unknown competitionId', () => {
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [makeLeague('a')] });
    expect(season.byId('nope')).toBeUndefined();
  });

  test('hasNext is true while any competition has fixtures left, false once all are done', async () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    expect(season.hasNext()).toBe(true);
    await a.simulateFullSeason();
    expect(season.hasNext()).toBe(true); // b still has fixtures
    await b.simulateFullSeason();
    expect(season.hasNext()).toBe(false);
  }, 30000);

  test('hasLive is true while any competition has a match in progress', async () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    expect(season.hasLive()).toBe(false);
    await a.tickTo(addMinutes(EARLY_START, 1));
    expect(season.hasLive()).toBe(true);
  });

  test('liveMatches aggregates in-progress matches across every competition', async () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    await season.tickTo(addMinutes(EARLY_START, 1));
    expect(season.liveMatches()).toHaveLength(a.getLiveMatches().length + b.getLiveMatches().length);
  });

  test('peekNextTickTime returns the earliest tick time across competitions', () => {
    const early = makeLeague('a', EARLY_START);
    const late = makeLeague('b', LATE_START);
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [late, early] });
    expect(season.peekNextTickTime()).toEqual(EARLY_START);
  });

  test('peekNextKickoff returns the earliest not-yet-started kickoff across competitions', () => {
    const early = makeLeague('a', EARLY_START);
    const late = makeLeague('b', LATE_START);
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [late, early] });
    expect(season.peekNextKickoff()).toEqual(EARLY_START);
  });

  test('peekNextKickoff returns null once every competition has finished', async () => {
    const a = makeLeague('a');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a] });
    await a.simulateFullSeason();
    expect(season.peekNextKickoff()).toBeNull();
  }, 30000);

  test('tickTo advances every competition and returns their combined events', async () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    const events = await season.tickTo(addDays(EARLY_START, 60));
    expect(events.length).toBeGreaterThan(0);
    expect(a.getState().fixtures.some(f => f.status === 'completed')).toBe(true);
    expect(b.getState().fixtures.some(f => f.status === 'completed')).toBe(true);
  });

  test('drainTo advances every competition without surfacing events', async () => {
    const a = makeLeague('a');
    const b = makeLeague('b');
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [a, b] });
    await season.drainTo(addDays(EARLY_START, 60));
    expect(a.getState().fixtures.some(f => f.status === 'completed')).toBe(true);
    expect(b.getState().fixtures.some(f => f.status === 'completed')).toBe(true);
  });

  test('nationId and startDate are exposed as configured', () => {
    const season = new Season({ nationId: 'eng', startDate: LATE_START, competitions: [] });
    expect(season.nationId).toBe('eng');
    expect(season.startDate).toEqual(LATE_START);
  });

  test('an empty competitions list has no next match, no live match, and no kickoff', () => {
    const season = new Season({ nationId: 'nor', startDate: EARLY_START, competitions: [] });
    expect(season.hasNext()).toBe(false);
    expect(season.hasLive()).toBe(false);
    expect(season.peekNextTickTime()).toBeNull();
    expect(season.peekNextKickoff()).toBeNull();
    expect(season.liveMatches()).toEqual([]);
  });
});
