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
