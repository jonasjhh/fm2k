import { LeagueManager } from './league-manager.ts';
import type { MatchCompletedPayload } from './league-manager.ts';
import { ClubManager } from '../club/club-manager.ts';
import type { ClubManagerConfig } from '../club/club-manager.ts';
import { createGameDateTime } from '@fm2k/timeline';
import type { Team, Player, Formation } from '../shared/types.ts';

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

// Build a 4-team league where the first team is controlled by the player.
// The starters are shared between the Team object and the ClubManager,
// ensuring handleMatchCompleted can match player IDs.
function makeIntegrationSetup(onMatchCompleted?: (p: MatchCompletedPayload) => void) {
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
  };
  const clubManager = new ClubManager(clubConfig);

  const leagueManager = new LeagueManager({
    teams: [playerTeam, ...otherTeams],
    startDate: START,
    eventsPerMinute: 1,
    onMatchCompleted,
  });

  return { clubManager, leagueManager, playerTeam, otherTeams };
}

// ── callback wiring ───────────────────────────────────────────────────────────

describe('LeagueManager onMatchCompleted callback:', () => {
  test('callback is invoked for each completed match', async () => {
    let callCount = 0;
    const { leagueManager } = makeIntegrationSetup(() => { callCount++; });
    await leagueManager.simulateNextMatchday();
    // 4 teams → 2 fixtures per matchday
    expect(callCount).toBe(2);
  });

  test('callback receives correct team ids', async () => {
    const payloads: MatchCompletedPayload[] = [];
    const { leagueManager } = makeIntegrationSetup(p => payloads.push(p));
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(typeof p.homeTeamId).toBe('string');
      expect(typeof p.awayTeamId).toBe('string');
      expect(p.homeTeamId).not.toBe(p.awayTeamId);
    }
  });

  test('callback receives scores as numbers', async () => {
    const payloads: MatchCompletedPayload[] = [];
    const { leagueManager } = makeIntegrationSetup(p => payloads.push(p));
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(typeof p.homeScore).toBe('number');
      expect(typeof p.awayScore).toBe('number');
      expect(p.homeScore).toBeGreaterThanOrEqual(0);
      expect(p.awayScore).toBeGreaterThanOrEqual(0);
    }
  });

  test('callback receives standings that already reflect the match result', async () => {
    const payloads: MatchCompletedPayload[] = [];
    const { leagueManager } = makeIntegrationSetup(p => payloads.push(p));
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      // Standings are updated before callback — both teams should have played >= 1
      expect(p.homeStanding.played).toBeGreaterThanOrEqual(1);
      expect(p.awayStanding.played).toBeGreaterThanOrEqual(1);
    }
  });

  test('callback receives correct timestamp type', async () => {
    const payloads: MatchCompletedPayload[] = [];
    const { leagueManager } = makeIntegrationSetup(p => payloads.push(p));
    await leagueManager.simulateNextMatchday();

    for (const p of payloads) {
      expect(typeof p.timestamp.year).toBe('number');
      expect(typeof p.timestamp.month).toBe('number');
    }
  });

  test('no callback does not throw', async () => {
    const { leagueManager } = makeIntegrationSetup();
    await expect(leagueManager.simulateNextMatchday()).resolves.not.toThrow();
  });

  test('callback is invoked for every match across a full season', async () => {
    let callCount = 0;
    const { leagueManager } = makeIntegrationSetup(() => { callCount++; });
    await leagueManager.simulateFullSeason();
    // 4 teams → 6 matchdays × 2 fixtures = 12 matches total
    expect(callCount).toBe(12);
  }, 30000);
});

// ── ClubManager integration ───────────────────────────────────────────────────

describe('ClubManager wired to LeagueManager:', () => {
  function makeWiredSetup() {
    // eslint-disable-next-line prefer-const
    let clubManager!: ClubManager;
    const { leagueManager, playerTeam } = makeIntegrationSetup(payload => {
      clubManager.handleMatchCompleted({
        homeTeamId: payload.homeTeamId,
        awayTeamId: payload.awayTeamId,
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        timestamp: payload.timestamp,
      });
    });
    // Re-build with the actual clubManager reference (closure captures it)
    const playerStarters = Array.from({ length: 11 }, (_, i) => makePlayer(`club-p${i}`));
    clubManager = new ClubManager({
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
      rng: () => 1, // suppress injuries
    });
    return { clubManager, leagueManager, playerTeam };
  }

  test('starting XI players have reduced fitness after a match', async () => {
    const { clubManager, leagueManager } = makeWiredSetup();
    await leagueManager.simulateNextMatchday();

    const state = clubManager.getState();
    const starters = state.squad.filter(p => state.startingXI.includes(p.id));

    // At least one matchday was played — if club played, starters have drained fitness
    const anyDrained = starters.some(p => p.fitness < 100);
    // The club may be home or away on matchday 1; it plays exactly one match
    expect(anyDrained).toBe(true);
  }, 30000);

  test('non-participating players retain fitness 100', async () => {
    // Create a squad with extra players not in the starting XI
    const starters = Array.from({ length: 11 }, (_, i) => makePlayer(`main-p${i}`));
    const bench = Array.from({ length: 4 }, (_, i) => makePlayer(`bench-p${i}`));
    const playerTeam = makeTeam('player-club', starters);
    const otherTeams = ['team-b', 'team-c', 'team-d'].map(id =>
      makeTeam(id, Array.from({ length: 11 }, (_, i) => makePlayer(`${id}-p${i}`))),
    );

    // eslint-disable-next-line prefer-const
    let club!: ClubManager;
    const lm = new LeagueManager({
      teams: [playerTeam, ...otherTeams],
      startDate: START,
      eventsPerMinute: 1,
      onMatchCompleted: payload => club.handleMatchCompleted({
        homeTeamId: payload.homeTeamId,
        awayTeamId: payload.awayTeamId,
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        timestamp: payload.timestamp,
      }),
    });
    club = new ClubManager({
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
    });

    await lm.simulateNextMatchday();

    // Bench players (not in startingXI) must remain at 100
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

    // eslint-disable-next-line prefer-const
    let club!: ClubManager;
    const lm = new LeagueManager({
      teams: [playerTeam, ...otherTeams],
      startDate: START,
      eventsPerMinute: 1,
      onMatchCompleted: payload => {
        club.handleMatchCompleted({
          homeTeamId: payload.homeTeamId,
          awayTeamId: payload.awayTeamId,
          homeScore: payload.homeScore,
          awayScore: payload.awayScore,
          timestamp: payload.timestamp,
        });
        if (payload.homeTeamId === 'player-club') {
          const receipt = club.calculateHomeReceipt(payload.awayStanding);
          club.recordGateReceipt(receipt, payload.awayTeamId, payload.timestamp);
        }
      },
    });
    club = new ClubManager({
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
    });

    // Simulate enough matches for the player's club to play at least one home game
    await lm.simulateFullSeason();

    const receipts = club.getState().financialLog.filter(t => t.type === 'gate_receipt');
    // With 4 teams double round-robin, player-club plays 3 home games
    expect(receipts.length).toBeGreaterThan(0);
    receipts.forEach(r => expect(r.amount).toBeGreaterThan(0));
  }, 30000);
});
