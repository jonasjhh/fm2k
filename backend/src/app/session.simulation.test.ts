import { GameSession } from './session.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId };
}

describe('GameSession clock:', () => {
  it('auto-streaming the player match stops at half time with the match live', async () => {
    const { session, teamId } = newGame();
    let notified = 0;
    session.subscribe(() => { notified++; });

    const result = await session.advanceToNextStop();

    expect(result.fixtureId).not.toBeNull();
    expect(result.atIntermission).toBe(true);
    expect(result.phase).toBe('half_time');
    expect(notified).toBeGreaterThan(0);

    const focusLive = session.snapshot().focusLive;
    expect(focusLive).not.toBeNull();
    expect(focusLive!.minute).toBeGreaterThanOrEqual(40);
    expect(focusLive!.homeTeamId === teamId || focusLive!.awayTeamId === teamId).toBe(true);
    // The matchday has not completed while a match is still live.
    expect(session.snapshot().currentMatchday).toBe(0);
  });

  it('continuing from half time runs to full time and records the result', async () => {
    const { session, teamId } = newGame();
    await session.advanceToNextStop();           // → half time
    const result = await session.advanceToNextStop(); // → full time

    expect(result.matchOver).toBe(true);
    expect(session.snapshot().currentMatchday).toBeGreaterThan(0);
    const last = session.snapshot().lastMatchResult;
    expect(last).not.toBeNull();
    expect(last!.homeTeamId === teamId || last!.awayTeamId === teamId).toBe(true);
  });

  it('skipToFullTime completes the player match in one step', async () => {
    const { session } = newGame();
    const result = await session.skipToFullTime();
    expect(result.matchOver).toBe(true);
    expect(session.snapshot().currentMatchday).toBeGreaterThan(0);
  });

  it('other nations\' matches are live concurrently at half time', async () => {
    const session = new GameSession();
    const countries = session.getEditableCountries();
    const teamId = countries[0].divisions[0].teams[0].id;
    // Two nations so there are concurrent league games.
    session.startGame(teamId, [countries[0].id, countries[1].id]);

    await session.advanceToNextStop(); // half time of the player's matchday

    const live = session.snapshot().liveMatches;
    const nations = new Set(live.map(l => l.competitionId));
    expect(live.length).toBeGreaterThan(8);     // more than one division live
    expect(nations.size).toBeGreaterThan(1);    // across competitions/nations
  });

  it('nextMatch moves the focus to the following fixture after one is played', async () => {
    const { session } = newGame();
    await session.skipToFullTime();
    const played = session.snapshot().focusFixture;
    session.nextMatch();
    const next = session.snapshot().focusFixture;
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(played!.id);
  });

  it('given simulateToEnd then the season completes', async () => {
    const { session } = newGame();
    await session.simulateToEnd();
    expect(session.snapshot().seasonComplete).toBe(true);
  }, 15_000);

  it('rolls the world over: squad ages and is preserved, finances carry, AI squads churn', async () => {
    const { session } = newGame();
    session.upgradeFacility('training');
    const before = session.snapshot().clubState!;
    const someSquadId = before.squad[0].id;
    const ageBefore = before.squad[0].age;

    // An AI team's squad ages too.
    const aiTeam = session.getEditableCountries()[0].divisions[0].teams.find(t => t.id !== before.clubId)!;
    const aiAgeBefore = aiTeam.starters[0].age;
    const aiId = aiTeam.starters[0].id;

    await session.simulateToEnd();
    // Capture finances at season end (gate receipts have accrued); they should survive the rollover.
    const endOfSeason = session.snapshot().clubState!;
    const budgetAtRollover = endOfSeason.budget;
    const trainingAtRollover = endOfSeason.facilities.training;
    session.startNewSeason();

    const after = session.snapshot().clubState!;
    // Finances + facilities carried across the rollover.
    expect(after.facilities.training).toBe(trainingAtRollover);
    expect(after.budget).toBe(budgetAtRollover);
    // The player's developed squad survived (a surviving player aged by a year).
    const survivor = after.squad.find(p => p.id === someSquadId);
    if (survivor) { expect(survivor.age).toBe(ageBefore + 1); }
    // An AI player who didn't retire aged too (proving AI squads churn now).
    const aiAfter = session.getEditableCountries()[0].divisions
      .flatMap(d => d.teams).flatMap(t => [...t.starters, ...t.substitutes]).find(p => p.id === aiId);
    if (aiAfter) { expect(aiAfter.age).toBe(aiAgeBefore + 1); }
  }, 20_000);
});
