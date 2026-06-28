import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId };
}

const club = (s: GameSession) => assertDefined(s.snapshot().clubState, 'clubState missing');
const benchedSquadId = (s: GameSession) => {
  const cs = club(s);
  return assertDefined(cs.squad.find(p => !cs.startingXI.some(id => id === p.id)), 'no benched player found').id;
};

describe('GameSession squad selection:', () => {
  describe('toggleXI', () => {
    test('removes a player who is already in the starting XI, leaving their slot null', () => {
      const { session } = newGame();
      const inXI = assertDefined(club(session).startingXI[0], 'expected a filled slot');
      const result = assertDefined(session.toggleXI(inXI), 'toggleXI failed');
      expect(result.startingXI).not.toContain(inXI);
      expect(result.startingXI).toHaveLength(11); // hole preserved, not compacted
      expect(result.startingXI[0]).toBeNull();
    });

    test('adds a benched player into the first empty slot when there is room', () => {
      const { session } = newGame();
      const inXI = assertDefined(club(session).startingXI[0], 'expected a filled slot');
      session.toggleXI(inXI);                 // open up slot 0
      const benchId = benchedSquadId(session);
      const result = assertDefined(session.toggleXI(benchId), 'toggleXI failed');
      expect(result.startingXI).toContain(benchId);
      expect(result.startingXI[0]).toBe(benchId);
      expect(result.startingXI).toHaveLength(11);
    });

    test('refuses to exceed 11 starters', () => {
      const { session } = newGame();
      const benchId = benchedSquadId(session);   // XI already full at 11
      const result = assertDefined(session.toggleXI(benchId), 'toggleXI failed');
      expect(result.startingXI).toHaveLength(11);
      expect(result.startingXI).not.toContain(benchId);
    });
  });

  describe('setStartingXI / setBench / setFormation', () => {
    test('setStartingXI replaces the starting XI', () => {
      const { session } = newGame();
      const ids = club(session).squad.slice(0, 11).map(p => p.id);
      expect(assertDefined(session.setStartingXI(ids), 'setStartingXI failed').startingXI).toEqual(ids);
    });

    test('setBench replaces the bench', () => {
      const { session } = newGame();
      const cs = club(session);
      const benchIds = cs.squad.filter(p => !cs.startingXI.some(id => id === p.id)).slice(0, 5).map(p => p.id);
      expect(assertDefined(session.setBench(benchIds), 'setBench failed').benchPlayers).toEqual(benchIds);
    });

    test('setFormation updates the formation', () => {
      const { session } = newGame();
      expect(assertDefined(session.setFormation('4-3-3'), 'setFormation failed').formation).toBe('4-3-3');
    });
  });
});

describe('GameSession transfers:', () => {
  test('sellPlayer returns false for an unknown player', () => {
    const { session } = newGame();
    expect(session.sellPlayer('not-a-player')).toBe(false);
  });

  test('sellPlayer removes the chosen player from the squad', () => {
    const { session } = newGame();
    const squad = club(session).squad;
    const target = squad[squad.length - 1];
    expect(session.sellPlayer(target.id)).toBe(true);
    expect(club(session).squad.some(p => p.id === target.id)).toBe(false);
  });

  test('buyPlayer returns false for an unknown listing', () => {
    const { session } = newGame();
    expect(session.buyPlayer('no-such-listing')).toBe(false);
  });

  test('refreshTransfers returns the active listings', () => {
    const { session } = newGame();
    const listings = session.refreshTransfers();
    expect(Array.isArray(listings)).toBe(true);
    expect(listings.length).toBeGreaterThan(0);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededGame() {
  const session = new GameSession(mulberry32(7));
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  const opponent = assertDefined(country.divisions[0].teams.find(t => t.id !== teamId), 'no opponent team found');
  return { session, teamId, opponent };
}

describe('GameSession bidForPlayer:', () => {
  test('refuses to bid for the player\'s own club', () => {
    const { session, teamId } = seededGame();
    const own = club(session).squad[0].id;
    expect(session.bidForPlayer(teamId, own, 5_000_000)).toBe(false);
  });

  test('returns false for an unknown team or player', () => {
    const { session, opponent } = seededGame();
    expect(session.bidForPlayer('no-team', 'x', 1_000_000)).toBe(false);
    expect(session.bidForPlayer(opponent.id, 'no-player', 1_000_000)).toBe(false);
  });

  test('rejects a lowball offer', () => {
    const { session, opponent } = seededGame();
    const target = opponent.squad[0];
    expect(session.bidForPlayer(opponent.id, target.id, 1)).toBe(false);
  });

  test('an accepted bid signs the player, who leaves the selling club (size preserved)', () => {
    const { session, opponent } = seededGame();
    // Raise budget so the fee is comfortably affordable.
    for (const p of club(session).squad.slice(11)) { session.sellPlayer(p.id); }

    const target = opponent.squad[0];
    const price = assertDefined(session.askingPriceFor(opponent.id, target.id), 'asking price missing');
    const sellingSizeBefore = opponent.squad.length;

    expect(session.bidForPlayer(opponent.id, target.id, Math.round(price * 1.1))).toBe(true);
    expect(club(session).squad.some(p => p.id === target.id)).toBe(true);

    const after = assertDefined(
      session.getEditableCountries().flatMap(c => c.divisions).flatMap(d => d.teams).find(t => t.id === opponent.id),
      'selling team not found',
    );
    expect(after.squad.some(p => p.id === target.id)).toBe(false);
    expect(after.squad.length).toBe(sellingSizeBefore);
  });
});

describe('GameSession signPlayer (one-click at asking):', () => {
  test('signs a free agent from the pool, removing them from it', () => {
    const { session } = seededGame();
    // Seed the pool by selling spare players; sign one back.
    const spares = club(session).squad.slice(11, 14);
    for (const p of spares) { session.sellPlayer(p.id); }
    const target = session.getFreeAgents()[0];
    const poolBefore = session.getFreeAgents().length;

    expect(session.signPlayer(target.id)).toBe(true);
    expect(club(session).squad.some(p => p.id === target.id)).toBe(true);
    expect(session.getFreeAgents().some(p => p.id === target.id)).toBe(false);
    expect(session.getFreeAgents().length).toBe(poolBefore - 1);
  });

  test('buys a club player deterministically (always succeeds at asking), seller backfills', () => {
    const { session, opponent } = seededGame();
    for (const p of club(session).squad.slice(11)) { session.sellPlayer(p.id); } // raise budget
    const target = opponent.squad[0];
    const sellingSizeBefore = opponent.squad.length;

    expect(session.signPlayer(target.id)).toBe(true);
    expect(club(session).squad.some(p => p.id === target.id)).toBe(true);

    const after = assertDefined(
      session.getEditableCountries().flatMap(c => c.divisions).flatMap(d => d.teams).find(t => t.id === opponent.id),
      'selling team not found',
    );
    expect(after.squad.some(p => p.id === target.id)).toBe(false);
    expect(after.squad.length).toBe(sellingSizeBefore);
  });

  test('signing a club player succeeds regardless of rng seed (no acceptance roll)', () => {
    for (const seed of [1, 2, 3]) {
      const session = new GameSession(mulberry32(seed));
      const country = session.getEditableCountries()[0];
      const teamId = country.divisions[0].teams[0].id;
      session.startGame(teamId, [country.id]);
      for (const p of assertDefined(session.snapshot().clubState, 'clubState missing').squad.slice(11)) {
        session.sellPlayer(p.id);
      }
      const opponent = assertDefined(country.divisions[0].teams.find(t => t.id !== teamId), 'no opponent team found');
      const target = opponent.squad[0];
      expect(session.signPlayer(target.id)).toBe(true);
    }
  });

  test('returns false for an unknown player and for the manager\'s own players', () => {
    const { session } = seededGame();
    expect(session.signPlayer('no-such-player')).toBe(false);
    expect(session.signPlayer(club(session).squad[0].id)).toBe(false); // own squad isn't buyable
  });
});

describe('GameSession facilities:', () => {
  test('buildWing notifies subscribers on success', () => {
    const { session } = newGame();
    let notifications = 0;
    session.subscribe(() => { notifications++; });
    const ok = session.buildWing('training', 'outdoorTechnicalPitch');
    expect(ok).toBe(true);
    expect(notifications).toBe(1);
  });

  test('applyStadiumDesign rejects a design the club cannot afford', () => {
    const { session } = newGame();
    const sectors = club(session).stadiumSectors;
    expect(session.applyStadiumDesign(sectors, Number.MAX_SAFE_INTEGER, 999_999)).toBe(false);
  });

  test('weekly facility maintenance is billed as the season progresses', async () => {
    const { session } = newGame();
    session.buildWing('medical', 'rehabGym');
    await session.simulateToEnd();
    const log = club(session).financialLog;
    expect(log.some(tx => tx.type === 'facility_maintenance')).toBe(true);
  }, 15_000);
});
