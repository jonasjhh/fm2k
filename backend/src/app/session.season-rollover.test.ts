import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';
import { BUDGET_START } from './config.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId };
}

/**
 * Characterization tests for everything `startNewSeason()` must carry across the
 * ClubManager/TransferManager rebuild. These pin down current (correct) behavior so the
 * startGame/startNewSeason disconnection refactor can be checked against them directly —
 * they must stay green, unmodified, throughout.
 */
describe('GameSession season rollover (carryover):', () => {
  it('financialLog survives a rollover (gate receipts accrued last season are not lost)', async () => {
    const { session } = newGame();
    await session.simulateToEnd();
    const beforeLog = assertDefined(session.snapshot().clubState, 'clubState missing').financialLog;
    expect(beforeLog.length).toBeGreaterThan(0);

    session.startNewSeason();

    const afterLog = assertDefined(session.snapshot().clubState, 'clubState missing').financialLog;
    expect(afterLog.length).toBeGreaterThanOrEqual(beforeLog.length);
    expect(afterLog.slice(0, beforeLog.length)).toEqual(beforeLog);
  }, 20_000);

  it('recentDevelopment survives a rollover (last season\'s deltas are not wiped)', async () => {
    const { session } = newGame();
    await session.simulateToEnd();
    const before = assertDefined(session.snapshot().clubState, 'clubState missing').recentDevelopment;
    expect(before.length).toBeGreaterThan(0);

    session.startNewSeason();

    const after = assertDefined(session.snapshot().clubState, 'clubState missing').recentDevelopment;
    expect(after).toEqual(before);
  }, 20_000);

  it('the free-agent pool survives a rollover (not replaced by a fresh random seed batch)', async () => {
    const { session } = newGame();
    await session.simulateToEnd();
    const beforeIds = new Set(session.getFreeAgents().map(p => p.id));
    expect(beforeIds.size).toBeGreaterThan(0);

    session.startNewSeason();

    const afterIds = new Set(session.getFreeAgents().map(p => p.id));
    const survived = [...beforeIds].filter(id => afterIds.has(id));
    // Most of the churned pool should still be there (churnFreeAgents only removes retirees).
    expect(survived.length).toBeGreaterThan(beforeIds.size * 0.5);
  }, 20_000);

  it('a deliberately-chosen starting XI/bench survives a rollover', async () => {
    const { session } = newGame();
    const squad = assertDefined(session.snapshot().clubState, 'clubState missing').squad;
    // A deliberately non-default XI: the last 11 squad members instead of the auto-picked best fit.
    const chosenXI = squad.slice(-11).map(p => p.id);
    const chosenBench = squad.slice(-15, -11).map(p => p.id);
    session.setStartingXI(chosenXI);
    session.setBench(chosenBench);

    await session.simulateToEnd();
    session.startNewSeason();

    const after = assertDefined(session.snapshot().clubState, 'clubState missing');
    const survivingXI = chosenXI.filter(id => after.squad.some(p => p.id === id));
    const survivingBench = chosenBench.filter(id => after.squad.some(p => p.id === id));
    for (const id of survivingXI) { expect(after.startingXI).toContain(id); }
    for (const id of survivingBench) { expect(after.benchPlayers).toContain(id); }
  }, 20_000);

  it('promotion/relegation never applies to a brand-new game, only between seasons', () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const teamId = country.divisions[0].teams[0].id;
    session.startGame(teamId, [country.id]);
    const divisionBefore = assertDefined(session.snapshot().clubState, 'clubState missing').divisionId;

    // Starting a (new) game again must never move a team between divisions.
    session.startGame(teamId, [country.id]);
    const divisionAfter = assertDefined(session.snapshot().clubState, 'clubState missing').divisionId;

    expect(divisionAfter).toBe(divisionBefore);
  });

  it('a brand-new game always gets fresh-game defaults regardless of season-rollover behavior', () => {
    const { session } = newGame();
    const cs = assertDefined(session.snapshot().clubState, 'clubState missing');
    expect(cs.budget).toBe(BUDGET_START);
    expect(cs.startingXI).toHaveLength(11);
    expect(session.getFreeAgents().length).toBeGreaterThan(0);
    expect(cs.financialLog).toHaveLength(0);
    expect(cs.recentDevelopment).toHaveLength(0);
  });
});
