import { vi } from 'vitest';
import type { ClubPlayer, ClubState, LeagueState, Player, PlayerAttributes, TeamTactics } from '@fm2k/engine';
import type { EditableCountry } from '../domain/editable-country.ts';

// In-memory localforage stand-in so the codec can be round-tripped without IndexedDB.
vi.mock('localforage', () => {
  const store = new Map<string, unknown>();
  return {
    default: {
      config: vi.fn(),
      setItem: vi.fn(async (k: string, v: unknown) => { store.set(k, v); return v; }),
      getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
      removeItem: vi.fn(async (k: string) => { store.delete(k); }),
      keys: vi.fn(async () => [...store.keys()]),
      __store: store,
    },
  };
});

import { writeSave, deleteSave, readAllSaves, saveKey, checkSaveCompatibility, SaveData, SAVE_VERSION } from './save-data';

function attrs(v: number): PlayerAttributes {
  return {
    speed: v, strength: v, agility: v, passing: v, finishing: v,
    technique: v, defending: v, stamina: v, awareness: v, composure: v,
  };
}

function player(id: string, extra: Partial<Player> = {}): Player {
  return {
    id, name: id, nationality: 'norwegian', age: 24, position: 'CM', potential: 80,
    attributes: attrs(70), ...extra,
  } as Player;
}

function clubPlayer(id: string, extra: Partial<ClubPlayer> = {}): ClubPlayer {
  return { ...player(id), fitness: 95, ...extra } as ClubPlayer;
}

function country(): EditableCountry {
  const team = {
    id: 't1', name: 'Team One', formation: '4-4-2' as const,
    squad: [player('s1'), player('s2', { position: 'ST', attributes: attrs(88) }), player('b1', { position: 'GK' })],
    colors: { primary: '#ff0000', secondary: '#00ff00' },
  };
  return {
    id: 'norway' as EditableCountry['id'],
    name: 'Norway',
    nationality: 'norwegian',
    divisions: [{ id: 'd1', name: 'Eliteserien', level: 1, teams: [team] }],
  } as EditableCountry;
}

function makeSave(overrides: Partial<SaveData> = {}): SaveData {
  const squad: ClubPlayer[] = [
    clubPlayer('p1'),
    clubPlayer('p2', { injury: { type: 'hamstring', matchesRemaining: 3 } }),
    clubPlayer('p3', { suspension: { matchesRemaining: 1 } }),
  ];
  return {
    version: SAVE_VERSION,
    type: 'QUICK',
    savedAt: '2026-06-11T10:00:00.000Z',
    teamName: 'Team One',
    matchday: 5,
    playerTeamId: 't1',
    selectedLeagueIds: ['norway'],
    editableCountries: [country()],
    currentMatchday: 5,
    seasonComplete: false,
    activeTab: 'squad',
    lastMatchResult: null,
    leagueState: { foo: 'bar' } as unknown as LeagueState,
    clubState: { budget: 1_000_000, squad } as unknown as ClubState,
    transferListings: [
      { id: 'L1', player: clubPlayer('t9', { position: 'ST' }), askingPrice: 250_000, expiresOnMatchday: 12 },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  // Clear the shared in-memory store between tests.
  const lf = (await import('localforage')).default as unknown as { __store: Map<string, unknown> };
  lf.__store.clear();
});

describe('save-data codec round-trip:', () => {
  it('given a save when written and read back then player-bearing data is preserved', async () => {
    const original = makeSave();
    await writeSave(original);
    const [loaded] = await readAllSaves();

    expect(loaded.editableCountries).toEqual(original.editableCountries);
    expect(loaded.clubState.squad).toEqual(original.clubState.squad);
    expect(loaded.transferListings).toEqual(original.transferListings);
  });

  it('given injuries and suspensions then they survive the round-trip', async () => {
    await writeSave(makeSave());
    const [loaded] = await readAllSaves();
    const byId = Object.fromEntries(loaded.clubState.squad.map(p => [p.id, p]));
    expect(byId.p2.injury).toEqual({ type: 'hamstring', matchesRemaining: 3 });
    expect(byId.p3.suspension).toEqual({ matchesRemaining: 1 });
    expect(byId.p1.injury).toBeUndefined();
  });

  it('given a per-player training regiment then it survives the round-trip; unset stays unset', async () => {
    const squad: ClubPlayer[] = [
      clubPlayer('tr1', { training: 'finishing' }),
      clubPlayer('tr2'), // no regiment set — should remain unset (consumer defaults it)
    ];
    await writeSave(makeSave({ clubState: { budget: 1, squad } as unknown as ClubState }));
    const [loaded] = await readAllSaves();
    const byId = Object.fromEntries(loaded.clubState.squad.map(p => [p.id, p]));
    expect(byId.tr1.training).toBe('finishing');
    expect(byId.tr2.training).toBeUndefined();
  });

  it('given a free-agent pool then it survives the round-trip', async () => {
    const freeAgents = [player('fa1', { position: 'GK' }), player('fa2', { position: 'ST', age: 18 })];
    await writeSave(makeSave({ transferFreeAgents: freeAgents }));
    const [loaded] = await readAllSaves();
    expect(loaded.transferFreeAgents).toEqual(freeAgents);
  });

  it('given pass-through metadata then scalar fields are preserved', async () => {
    const original = makeSave({ matchday: 9, currentMatchday: 9, activeTab: 'tactics' });
    await writeSave(original);
    const [loaded] = await readAllSaves();
    expect(loaded).toMatchObject({
      type: 'QUICK', teamName: 'Team One', matchday: 9, currentMatchday: 9,
      activeTab: 'tactics', playerTeamId: 't1', version: SAVE_VERSION,
    });
  });

  it('given cup states then the bracket survives the round-trip', async () => {
    const cupStates = {
      'norway-cup': {
        competitionId: 'norway-cup', kind: 'knockout', name: 'Norway Cup', season: '2025/26',
        standings: [], fixtures: [],
        bracket: { rounds: 6, roundNames: ['Round 1'], slots: [], championTeamId: 't1' },
      },
    } as unknown as NonNullable<SaveData['cupStates']>;
    await writeSave(makeSave({ cupStates }));
    const [loaded] = await readAllSaves();
    expect(loaded.cupStates).toEqual(cupStates);
  });
});

describe('readAllSaves:', () => {
  it('given multiple saves then newest (by savedAt) comes first', async () => {
    await writeSave(makeSave({ type: 'QUICK', teamName: 'Older', savedAt: '2026-06-01T00:00:00.000Z' }));
    await writeSave(makeSave({ type: 'AUTO', teamName: 'Newer', savedAt: '2026-06-10T00:00:00.000Z' }));
    const saves = await readAllSaves();
    expect(saves.map(s => s.teamName)).toEqual(['Newer', 'Older']);
  });

  it('given a deleted save then it no longer appears', async () => {
    await writeSave(makeSave({ type: 'QUICK', teamName: 'Team One' }));
    await deleteSave('QUICK', 'Team One');
    expect(await readAllSaves()).toHaveLength(0);
  });

  it('given unrelated keys in storage then only fm2k save keys are returned', async () => {
    const lf = (await import('localforage')).default as unknown as { __store: Map<string, unknown> };
    lf.__store.set('some-other-app-key', { not: 'a save' });
    await writeSave(makeSave({ type: 'QUICK', teamName: 'Real' }));

    const saves = await readAllSaves();
    expect(saves.map(s => s.teamName)).toEqual(['Real']);
  });
});

describe('saveKey:', () => {
  it('composes a key from type and team name', () => {
    expect(saveKey('QUICK', 'Team One')).toBe('fm2k-QUICK-Team One');
    expect(saveKey('AUTO', 'Bergen')).toBe('fm2k-AUTO-Bergen');
  });
});

describe('checkSaveCompatibility:', () => {
  const withVersion = (version: number) => ({ version } as SaveData);

  it('given a version newer than supported then incompatible', () => {
    expect(checkSaveCompatibility(withVersion(SAVE_VERSION + 1))).toBe('incompatible');
  });

  it('given a version below the minimum loadable then incompatible', () => {
    expect(checkSaveCompatibility(withVersion(0))).toBe('incompatible');
  });

  it('given the oldest still-loadable version then outdated', () => {
    expect(checkSaveCompatibility(withVersion(SAVE_VERSION - 1))).toBe('outdated');
  });

  it('given the current version then ok', () => {
    expect(checkSaveCompatibility(withVersion(SAVE_VERSION))).toBe('ok');
  });
});

describe('save-data tactics round-trip:', () => {
  const tactics: TeamTactics = { attackingMentality: 'attacking', passingStyle: 'short', tempo: 'fast', width: 'wide' };

  function saveWithTeam(extra: { tactics?: TeamTactics }): SaveData {
    const team = {
      id: 'tt', name: 'Tactics FC', formation: '4-4-2' as const,
      squad: [player('s1'), player('b1', { position: 'GK' })],
      colors: { primary: '#000', secondary: '#fff' },
      ...extra,
    };
    return makeSave({
      editableCountries: [{
        id: 'norway' as EditableCountry['id'], name: 'Norway', nationality: 'norwegian',
        divisions: [{ id: 'd1', name: 'Eliteserien', level: 1, teams: [team] }],
      } as EditableCountry],
    });
  }

  it('given a team with tactics then they survive the round-trip', async () => {
    await writeSave(saveWithTeam({ tactics }));
    const [loaded] = await readAllSaves();
    expect(loaded.editableCountries[0].divisions[0].teams[0].tactics).toEqual(tactics);
  });

  it('given a team without tactics then none are present after the round-trip', async () => {
    await writeSave(saveWithTeam({}));
    const [loaded] = await readAllSaves();
    expect(loaded.editableCountries[0].divisions[0].teams[0].tactics).toBeUndefined();
  });
});
