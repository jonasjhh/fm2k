import { GameSession } from './session.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId };
}

const club = (s: GameSession) => s.snapshot().clubState!;
const benchedSquadId = (s: GameSession) => {
  const cs = club(s);
  return cs.squad.find(p => !cs.startingXI.includes(p.id))!.id;
};

describe('GameSession squad selection:', () => {
  describe('toggleXI', () => {
    test('removes a player who is already in the starting XI', () => {
      const { session } = newGame();
      const inXI = club(session).startingXI[0];
      const result = session.toggleXI(inXI);
      expect(result!.startingXI).not.toContain(inXI);
      expect(result!.startingXI).toHaveLength(10);
    });

    test('adds a benched player when there is room', () => {
      const { session } = newGame();
      const inXI = club(session).startingXI[0];
      session.toggleXI(inXI);                 // drop to 10
      const benchId = benchedSquadId(session);
      const result = session.toggleXI(benchId);
      expect(result!.startingXI).toContain(benchId);
      expect(result!.startingXI).toHaveLength(11);
    });

    test('refuses to exceed 11 starters', () => {
      const { session } = newGame();
      const benchId = benchedSquadId(session);   // XI already full at 11
      const result = session.toggleXI(benchId);
      expect(result!.startingXI).toHaveLength(11);
      expect(result!.startingXI).not.toContain(benchId);
    });
  });

  describe('setStartingXI / setBench / setFormation', () => {
    test('setStartingXI replaces the starting XI', () => {
      const { session } = newGame();
      const ids = club(session).squad.slice(0, 11).map(p => p.id);
      expect(session.setStartingXI(ids)!.startingXI).toEqual(ids);
    });

    test('setBench replaces the bench', () => {
      const { session } = newGame();
      const cs = club(session);
      const benchIds = cs.squad.filter(p => !cs.startingXI.includes(p.id)).slice(0, 5).map(p => p.id);
      expect(session.setBench(benchIds)!.benchPlayers).toEqual(benchIds);
    });

    test('setFormation updates the formation', () => {
      const { session } = newGame();
      expect(session.setFormation('4-3-3')!.formation).toBe('4-3-3');
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
  const opponent = country.divisions[0].teams.find(t => t.id !== teamId)!;
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
    const target = opponent.substitutes[0] ?? opponent.starters[0];
    expect(session.bidForPlayer(opponent.id, target.id, 1)).toBe(false);
  });

  test('an accepted bid signs the player, who leaves the selling club (size preserved)', () => {
    const { session, opponent } = seededGame();
    // Raise budget so the fee is comfortably affordable.
    for (const p of club(session).squad.slice(11)) { session.sellPlayer(p.id); }

    const target = opponent.substitutes[0] ?? opponent.starters[0];
    const price = session.askingPriceFor(opponent.id, target.id)!;
    const sellingSizeBefore = opponent.starters.length + opponent.substitutes.length;

    expect(session.bidForPlayer(opponent.id, target.id, Math.round(price * 1.1))).toBe(true);
    expect(club(session).squad.some(p => p.id === target.id)).toBe(true);

    const after = session.getEditableCountries()
      .flatMap(c => c.divisions).flatMap(d => d.teams).find(t => t.id === opponent.id)!;
    expect(after.starters.some(p => p.id === target.id)).toBe(false);
    expect(after.substitutes.some(p => p.id === target.id)).toBe(false);
    expect(after.starters.length + after.substitutes.length).toBe(sellingSizeBefore);
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
    const target = opponent.substitutes[0] ?? opponent.starters[0];
    const sellingSizeBefore = opponent.starters.length + opponent.substitutes.length;

    expect(session.signPlayer(target.id)).toBe(true);
    expect(club(session).squad.some(p => p.id === target.id)).toBe(true);

    const after = session.getEditableCountries()
      .flatMap(c => c.divisions).flatMap(d => d.teams).find(t => t.id === opponent.id)!;
    expect(after.starters.some(p => p.id === target.id)).toBe(false);
    expect(after.substitutes.some(p => p.id === target.id)).toBe(false);
    expect(after.starters.length + after.substitutes.length).toBe(sellingSizeBefore);
  });

  test('signing a club player succeeds regardless of rng seed (no acceptance roll)', () => {
    for (const seed of [1, 2, 3]) {
      const session = new GameSession(mulberry32(seed));
      const country = session.getEditableCountries()[0];
      const teamId = country.divisions[0].teams[0].id;
      session.startGame(teamId, [country.id]);
      for (const p of session.snapshot().clubState!.squad.slice(11)) { session.sellPlayer(p.id); }
      const opponent = country.divisions[0].teams.find(t => t.id !== teamId)!;
      const target = opponent.substitutes[0] ?? opponent.starters[0];
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
  test('upgradeFacility notifies subscribers on success', () => {
    const { session } = newGame();
    let notifications = 0;
    session.subscribe(() => { notifications++; });
    const ok = session.upgradeFacility('training');
    expect(ok).toBe(true);
    expect(notifications).toBe(1);
  });

  test('applyStadiumDesign rejects a design the club cannot afford', () => {
    const { session } = newGame();
    const sectors = club(session).stadiumSectors;
    expect(session.applyStadiumDesign(sectors, Number.MAX_SAFE_INTEGER, 999_999)).toBe(false);
  });
});
