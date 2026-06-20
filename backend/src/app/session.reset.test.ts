import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';

describe('GameSession.resetSession:', () => {
  it('discards a season\'s promotion/relegation and pre-game edits, returning to fresh defaults', async () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const topDivision = country.divisions[0];
    const defaultTopFlightIds = topDivision.teams.map(t => t.id).sort();
    const teamId = topDivision.teams[0].id;

    session.startGame(teamId, [country.id]);
    await session.simulateToEnd();
    session.startNewSeason(); // applies promotion/relegation, mutating this.world in place

    const rolledOverTopFlight = assertDefined(
      session.getEditableCountries().find(c => c.id === country.id), 'country missing after rollover',
    ).divisions[0].teams.map(t => t.id).sort();
    // Relegation/promotion always swaps the bottom-2/top-2 of adjacent divisions, so the
    // top flight's membership necessarily changed — confirms the test actually exercises
    // the bug (world state surviving past a season), not a no-op.
    expect(rolledOverTopFlight).not.toEqual(defaultTopFlightIds);

    session.resetSession();

    const resetTopFlight = assertDefined(
      session.getEditableCountries().find(c => c.id === country.id), 'country missing after reset',
    ).divisions[0].teams.map(t => t.id).sort();
    expect(resetTopFlight).toEqual(defaultTopFlightIds);

    const snap = session.snapshot();
    expect(snap.playerTeamId).toBeNull();
    expect(snap.currentMatchday).toBe(0);
    expect(snap.seasonComplete).toBe(false);
    expect(snap.clubState).toBeNull();
    expect(snap.notifications).toHaveLength(0);
  }, 20_000);

  it('a fresh game can be started again after reset, using the same team id', async () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const teamId = country.divisions[0].teams[0].id;

    session.startGame(teamId, [country.id]);
    await session.simulateToEnd();
    session.startNewSeason();
    session.resetSession();

    expect(session.startGame(teamId, [country.id])).toBe(true);
    expect(session.snapshot().playerTeamId).toBe(teamId);
  }, 20_000);
});
