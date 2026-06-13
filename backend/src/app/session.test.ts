import { GameSession } from './session.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  const ok = session.startGame(teamId, [country.id]);
  return { session, country, teamId, ok };
}

describe('GameSession lifecycle:', () => {
  it('given a started game then the snapshot is populated', () => {
    const { session, teamId, ok } = newGame();
    expect(ok).toBe(true);
    const snap = session.snapshot();
    expect(snap.playerTeamId).toBe(teamId);
    expect(snap.clubState).not.toBeNull();
    expect(snap.leagueState).not.toBeNull();
    expect(Object.keys(snap.leagueStates).length).toBeGreaterThan(0);
    expect(snap.transferListings.length).toBeGreaterThan(0);
    expect(snap.currentMatchday).toBe(0);
    expect(snap.seasonComplete).toBe(false);
  });

  it('given an unknown team then startGame fails and leaves the snapshot empty', () => {
    const session = new GameSession();
    const countryId = session.getEditableCountries()[0].id;
    expect(session.startGame('does-not-exist', [countryId])).toBe(false);
    expect(session.snapshot().clubState).toBeNull();
  });

  it('given a save then loading it into a fresh session restores the read-model', () => {
    const { session, teamId } = newGame();
    const save = session.buildSaveData('QUICK');
    expect(save).not.toBeNull();

    const restored = new GameSession();
    expect(restored.loadGame(save!)).toBe(true);

    const snap = restored.snapshot();
    expect(snap.playerTeamId).toBe(teamId);
    expect(snap.clubState?.clubName).toBe(save!.clubState.clubName);
    expect(snap.currentMatchday).toBe(save!.currentMatchday);
    expect(snap.leagueState?.fixtures.length).toBe(save!.leagueState.fixtures.length);
  });
});

describe('GameSession national cup:', () => {
  it('given a started game then the player nation has a cup with a fresh bracket', () => {
    const { session, country } = newGame();
    const cup = session.snapshot().cupStates[`${country.id}-cup`];
    expect(cup).toBeDefined();
    expect(cup.kind).toBe('knockout');
    expect(cup.bracket?.slots).toHaveLength(47);
    expect(cup.bracket?.championTeamId).toBeNull();
    // Only the preliminary round exists up front (16 ties); later rounds are TBD.
    expect(cup.fixtures).toHaveLength(16);
    expect(cup.fixtures.every(f => f.matchday === 1)).toBe(true);
  });

  it('a save mid-season carries the cup bracket and restores it', async () => {
    const { session, country } = newGame();
    await session.skipToFullTime();
    await session.skipToFullTime();

    const save = session.buildSaveData('QUICK')!;
    expect(save.cupStates).toBeDefined();

    const restored = new GameSession();
    expect(restored.loadGame(save)).toBe(true);
    const cup = restored.snapshot().cupStates[`${country.id}-cup`];
    expect(cup.bracket?.slots).toHaveLength(47);
  });

  it('simulating the full season crowns a cup champion and completes the league', async () => {
    const { session } = newGame();
    await session.simulateToEnd();

    const snap = session.snapshot();
    expect(snap.seasonComplete).toBe(true);
    expect(snap.currentMatchday).toBe(30);

    const cup = Object.values(snap.cupStates)[0];
    expect(cup.bracket?.championTeamId).not.toBeNull();
    expect(cup.fixtures).toHaveLength(47);
    expect(cup.fixtures.every(f => f.status === 'completed')).toBe(true);
    // Knockout ties always have a winner recorded.
    expect(cup.fixtures.every(f => f.result?.winnerTeamId)).toBe(true);
  }, 120000);
});
