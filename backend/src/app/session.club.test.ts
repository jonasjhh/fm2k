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
