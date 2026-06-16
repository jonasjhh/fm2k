import { LeagueManager } from './league-manager.ts';
import { ClubManager } from '../club/club-manager.ts';
import type { ClubManagerConfig } from '../club/club-manager.ts';
import { EventBus } from '@fm2k/state';
import type { GameEvents } from '../game-events.ts';
import { createGameDateTime } from '@fm2k/timeline';
import type { Team, Player, Formation } from '@fm2k/match';

const START = createGameDateTime(2025, 8, 16, 15, 0);

// ── helpers ───────────────────────────────────────────────────────────────────

function makePlayer(id: string): Player {
  return {
    id,
    name: id,
    nationality: 'norwegian',
    age: 25,
    position: 'CM',
    potential: 70,
    attributes: {
      speed: 10, strength: 10, agility: 10,
      passing: 10, finishing: 10, technique: 10,
      defending: 10, stamina: 10, awareness: 10, composure: 10,
    },
  };
}

function makeTeam(id: string, starters: Player[]): Team {
  return { id, name: id, formation: '4-4-2' as Formation, starters, substitutes: [], colors: { primary: '#FFFFFF', secondary: '#000000' } };
}

function makeIntegrationSetup(eventBus?: EventBus<GameEvents>) {
  const playerStarters = Array.from({ length: 11 }, (_, i) => makePlayer(`club-p${i}`));
  const playerTeam = makeTeam('player-club', playerStarters);
  const otherTeams = ['team-b', 'team-c', 'team-d'].map(id =>
    makeTeam(id, Array.from({ length: 11 }, (_, i) => makePlayer(`${id}-p${i}`))),
  );

  const clubConfig: ClubManagerConfig = {
    clubId: 'player-club',
    clubName: 'Player Club',
    divisionId: 'div1',
    squad: playerStarters,
    budget: 500_000,
    formation: '4-4-2' as Formation,
    startingXI: playerStarters.map(p => p.id),
    benchPlayers: [],
    stadiumCapacity: 10_000,
    stadiumSectors: {},
    rng: () => 1, // prevent injuries
    eventBus,
  };
  const clubManager = new ClubManager(clubConfig);

  const leagueManager = new LeagueManager({
    teams: [playerTeam, ...otherTeams],
    startDate: START,
    eventsPerMinute: 1,
    eventBus,
  });

  return { clubManager, leagueManager, playerTeam, otherTeams };
}

// ── EventBus: LeagueManager emits match.completed ────────────────────────────

describe('LeagueManager eventBus:', () => {
  test('emits match.completed for each completed match', async () => {
    const bus = new EventBus<GameEvents>();
    let callCount = 0;
    bus.on('match.completed', () => { callCount++; });
    const { leagueManager } = makeIntegrationSetup(bus);
    await leagueManager.simulateNextMatchday();
    // 4 teams → 2 fixtures per matchday
    expect(callCount).toBe(2);
  });

  test('payload has correct team ids', async () => {
    const bus = new EventBus<GameEvents>();
    const payloads: GameEvents['match.completed'][] = [];
    bus.on('match.completed', p => payloads.push(p));
    const { leagueManager } = makeIntegrationSetup(bus);
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(typeof p.homeTeamId).toBe('string');
      expect(typeof p.awayTeamId).toBe('string');
      expect(p.homeTeamId).not.toBe(p.awayTeamId);
    }
  });

  test('payload has scores as numbers', async () => {
    const bus = new EventBus<GameEvents>();
    const payloads: GameEvents['match.completed'][] = [];
    bus.on('match.completed', p => payloads.push(p));
    const { leagueManager } = makeIntegrationSetup(bus);
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(typeof p.homeScore).toBe('number');
      expect(typeof p.awayScore).toBe('number');
      expect(p.homeScore).toBeGreaterThanOrEqual(0);
      expect(p.awayScore).toBeGreaterThanOrEqual(0);
    }
  });

  test('standings in payload already reflect the match result', async () => {
    const bus = new EventBus<GameEvents>();
    const payloads: GameEvents['match.completed'][] = [];
    bus.on('match.completed', p => payloads.push(p));
    const { leagueManager } = makeIntegrationSetup(bus);
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(p.homeStanding!.played).toBeGreaterThanOrEqual(1);
      expect(p.awayStanding!.played).toBeGreaterThanOrEqual(1);
    }
  });

  test('payload has correct timestamp type', async () => {
    const bus = new EventBus<GameEvents>();
    const payloads: GameEvents['match.completed'][] = [];
    bus.on('match.completed', p => payloads.push(p));
    const { leagueManager } = makeIntegrationSetup(bus);
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(typeof p.timestamp.year).toBe('number');
      expect(typeof p.timestamp.month).toBe('number');
    }
  });

  test('no eventBus does not throw', async () => {
    const { leagueManager } = makeIntegrationSetup();
    await expect(leagueManager.simulateNextMatchday()).resolves.not.toThrow();
  });

  test('emits for every match across a full season', async () => {
    const bus = new EventBus<GameEvents>();
    let callCount = 0;
    bus.on('match.completed', () => { callCount++; });
    const { leagueManager } = makeIntegrationSetup(bus);
    await leagueManager.simulateFullSeason();
    // 4 teams → 6 matchdays × 2 fixtures = 12 matches total
    expect(callCount).toBe(12);
  }, 30000);
});

// ── ClubManager integration ───────────────────────────────────────────────────

describe('ClubManager wired to LeagueManager:', () => {
  function makeWiredSetup() {
    const bus = new EventBus<GameEvents>();
    const { leagueManager, clubManager, playerTeam } = makeIntegrationSetup(bus);
    return { bus, clubManager, leagueManager, playerTeam };
  }

  test('starting XI players have reduced fitness after a match', async () => {
    const { clubManager, leagueManager } = makeWiredSetup();
    await leagueManager.simulateNextMatchday();

    const state = clubManager.getState();
    const starters = state.squad.filter(p => state.startingXI.includes(p.id));
    const anyDrained = starters.some(p => p.fitness < 100);
    expect(anyDrained).toBe(true);
  }, 30000);

  test('non-participating players retain fitness 100', async () => {
    const starters = Array.from({ length: 11 }, (_, i) => makePlayer(`main-p${i}`));
    const bench = Array.from({ length: 4 }, (_, i) => makePlayer(`bench-p${i}`));
    const playerTeam = makeTeam('player-club', starters);
    const otherTeams = ['team-b', 'team-c', 'team-d'].map(id =>
      makeTeam(id, Array.from({ length: 11 }, (_, i) => makePlayer(`${id}-p${i}`))),
    );

    const bus = new EventBus<GameEvents>();
    const lm = new LeagueManager({
      teams: [playerTeam, ...otherTeams],
      startDate: START,
      eventsPerMinute: 1,
      eventBus: bus,
    });
    const club = new ClubManager({
      clubId: 'player-club',
      clubName: 'Player Club',
      divisionId: 'div1',
      squad: [...starters, ...bench],
      budget: 500_000,
      formation: '4-4-2' as Formation,
      startingXI: starters.map(p => p.id),
      benchPlayers: bench.map(p => p.id),
      stadiumCapacity: 10_000,
      stadiumSectors: {},
      rng: () => 1,
      eventBus: bus,
    });

    await lm.simulateNextMatchday();

    bench.forEach(bp => {
      const inSquad = club.getState().squad.find(p => p.id === bp.id)!;
      expect(inSquad.fitness).toBe(100);
    });
  }, 30000);

  test('gate receipt is recorded for a home match', async () => {
    const starters = Array.from({ length: 11 }, (_, i) => makePlayer(`main-p${i}`));
    const playerTeam = makeTeam('player-club', starters);
    const otherTeams = ['team-b', 'team-c', 'team-d'].map(id =>
      makeTeam(id, Array.from({ length: 11 }, (_, i) => makePlayer(`${id}-p${i}`))),
    );

    const bus = new EventBus<GameEvents>();
    const lm = new LeagueManager({
      teams: [playerTeam, ...otherTeams],
      startDate: START,
      eventsPerMinute: 1,
      eventBus: bus,
    });
    const club = new ClubManager({
      clubId: 'player-club',
      clubName: 'Player Club',
      divisionId: 'div1',
      squad: starters,
      budget: 500_000,
      formation: '4-4-2' as Formation,
      startingXI: starters.map(p => p.id),
      benchPlayers: [],
      stadiumCapacity: 10_000,
      stadiumSectors: {},
      rng: () => 1,
      eventBus: bus,
    });

    await lm.simulateFullSeason();

    const receipts = club.getState().financialLog.filter(t => t.type === 'gate_receipt');
    // With 4 teams double round-robin, player-club plays 3 home games
    expect(receipts.length).toBeGreaterThan(0);
    receipts.forEach(r => expect(r.amount).toBeGreaterThan(0));
  }, 30000);
});
