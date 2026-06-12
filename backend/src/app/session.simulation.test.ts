import { GameSession } from './session.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId };
}

describe('GameSession simulation:', () => {
  it('given a matchday simulated then state advances and subscribers are notified', async () => {
    const { session } = newGame();
    let notified = 0;
    session.subscribe(() => { notified++; });

    await session.simulateMatchday();

    expect(session.snapshot().currentMatchday).toBeGreaterThan(0);
    expect(notified).toBeGreaterThan(0);
  });

  it('given the player plays a match then key events are returned and the result is recorded', async () => {
    const { session, teamId } = newGame();
    const played = await session.playMatch();

    expect(played).not.toBeNull();
    expect(played!.keyEvents.length).toBeGreaterThanOrEqual(0);
    const result = session.snapshot().lastMatchResult;
    expect(result).not.toBeNull();
    expect(result!.homeTeamId === teamId || result!.awayTeamId === teamId).toBe(true);
  });

  it('given simulateToEnd then the season completes', async () => {
    const { session } = newGame();
    await session.simulateToEnd();
    expect(session.snapshot().seasonComplete).toBe(true);
  });
});
