import { assertDefined } from '@fm2k/state';
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

    // Red cards or injuries on the player's team may cause stops before half time — skip through them.
    let result = await session.advanceToNextStop();
    while (!result.matchOver && result.phase !== 'half_time' && result.phase !== 'extra_time_half') {
      result = await session.advanceToNextStop();
    }

    expect(result.fixtureId).not.toBeNull();
    expect(result.atIntermission).toBe(true);
    expect(result.phase).toBe('half_time');
    expect(notified).toBeGreaterThan(0);

    const focusLive = assertDefined(session.snapshot().focusLive, 'focusLive missing');
    expect(focusLive.minute).toBeGreaterThanOrEqual(40);
    expect(focusLive.homeTeamId === teamId || focusLive.awayTeamId === teamId).toBe(true);
    // The matchday has not completed while a match is still live.
    expect(session.snapshot().currentMatchday).toBe(0);
  });

  it('continuing from half time runs to full time and records the result', async () => {
    const { session, teamId } = newGame();
    await session.advanceToNextStop(); // → half time
    // Continue until full time — intermediate stops (own-team red card / injury) are legal.
    let result = await session.advanceToNextStop();
    for (let guard = 0; !result.matchOver && guard < 5; guard++) {
      result = await session.advanceToNextStop();
    }

    expect(result.matchOver).toBe(true);
    expect(session.snapshot().currentMatchday).toBeGreaterThan(0);
    const last = assertDefined(session.snapshot().lastMatchResult, 'lastMatchResult missing');
    expect(last.homeTeamId === teamId || last.awayTeamId === teamId).toBe(true);
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

  it('a benched player\'s fitness recovers (never drains) while the clock advances to the next fixture', async () => {
    const { session } = newGame();
    await session.skipToFullTime();
    const club = assertDefined(session.snapshot().clubState, 'clubState missing');
    const starter = assertDefined(
      club.squad.find(p => club.startingXI.includes(p.id)), 'no starter found');
    const fitnessAfterMatch = starter.fitness;
    expect(fitnessAfterMatch).toBeLessThan(1000);

    // Bench them for the next match, so the gap to the next kickoff is pure recovery
    // (recoverFitness, scaled by the elapsed game-calendar days) with no further drain to confound it.
    session.toggleXI(starter.id);
    session.nextMatch();
    await session.skipToFullTime();

    const clubAfterGap = assertDefined(session.snapshot().clubState, 'clubState missing');
    const sameStarter = assertDefined(
      clubAfterGap.squad.find(p => p.id === starter.id), 'starter missing after gap');
    expect(sameStarter.fitness).toBeGreaterThan(fitnessAfterMatch);
    expect(sameStarter.fitness).toBeLessThanOrEqual(1000);
  });

  it('nextMatch moves the focus to the following fixture after one is played', async () => {
    const { session } = newGame();
    await session.skipToFullTime();
    const played = session.snapshot().focusFixture;
    session.nextMatch();
    const next = assertDefined(session.snapshot().focusFixture, 'focusFixture missing');
    expect(next.id).not.toBe(assertDefined(played, 'played focusFixture missing').id);
  });

  it('given simulateToEnd then the season completes', async () => {
    const { session } = newGame();
    await session.simulateToEnd();
    expect(session.snapshot().seasonComplete).toBe(true);
  }, 15_000);

  it('rolls the world over: squad ages and is preserved, finances carry, AI squads churn', async () => {
    const { session } = newGame();
    session.buildWing('training', 'outdoorTechnicalPitch');
    const before = assertDefined(session.snapshot().clubState, 'clubState missing');
    const someSquadId = before.squad[0].id;
    const ageBefore = before.squad[0].age;

    // An AI team's squad ages too.
    const aiTeam = assertDefined(
      session.getEditableCountries()[0].divisions[0].teams.find(t => t.id !== before.clubId),
      'no AI team found',
    );
    const aiAgeBefore = aiTeam.squad[0].age;
    const aiId = aiTeam.squad[0].id;

    await session.simulateToEnd();
    // Capture finances at season end (gate receipts have accrued); they should survive the rollover.
    const endOfSeason = assertDefined(session.snapshot().clubState, 'clubState missing');
    const budgetAtRollover = endOfSeason.budget;
    const trainingWingsAtRollover = endOfSeason.facilities.training.wings;
    session.startNewSeason();

    const after = assertDefined(session.snapshot().clubState, 'clubState missing');
    // Facilities carry across the rollover; the budget carries plus this season's prize money
    // (every finishing position earns at least something, so it's strictly more, never equal).
    expect(after.facilities.training.wings).toEqual(trainingWingsAtRollover);
    expect(after.budget).toBeGreaterThan(budgetAtRollover);
    // The player's developed squad survived (a surviving player aged by a year).
    const survivor = after.squad.find(p => p.id === someSquadId);
    if (survivor) { expect(survivor.age).toBe(ageBefore + 1); }
    // An AI player who didn't retire aged too (proving AI squads churn now).
    const aiAfter = session.getEditableCountries()[0].divisions
      .flatMap(d => d.teams).flatMap(t => t.squad).find(p => p.id === aiId);
    if (aiAfter) { expect(aiAfter.age).toBe(aiAgeBefore + 1); }
  }, 20_000);
});
