import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';
import { budgetStartFor, SEASON_START } from './config.ts';

/**
 * Characterization tests for everything `startNewSeason()` must carry across the
 * ClubManager/TransferManager rebuild. These pin down current (correct) behavior so the
 * startGame/startNewSeason disconnection refactor can be checked against them directly —
 * they must stay green, unmodified, throughout.
 *
 * One shared simulation runs in beforeAll. All tests read from captured snapshots.
 */
describe('GameSession season rollover (carryover):', () => {
  let chosenXI: string[];
  let chosenBench: string[];
  let beforeFinancialLog: object[];
  let beforeRecentDevelopment: object[];
  let beforeFreeAgentIds: Set<string>;
  let snapBefore: ReturnType<GameSession['snapshot']>;
  let afterSnap: ReturnType<GameSession['snapshot']>;
  let afterFreeAgentIds: Set<string>;

  beforeAll(async () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const teamId = country.divisions[0].teams[0].id;
    session.startGame(teamId, [country.id]);

    // Set a deliberately non-default XI before simulating so that carryover can be verified.
    const squad = assertDefined(session.snapshot().clubState, 'clubState missing').squad;
    chosenXI = squad.slice(-11).map(p => p.id);
    chosenBench = squad.slice(-15, -11).map(p => p.id);
    session.setStartingXI(chosenXI);
    session.setBench(chosenBench);

    await session.simulateToEnd();

    snapBefore = session.snapshot();
    beforeFinancialLog = assertDefined(snapBefore.clubState, 'clubState missing').financialLog;
    beforeRecentDevelopment = assertDefined(snapBefore.clubState, 'clubState missing').recentDevelopment;
    beforeFreeAgentIds = new Set(session.getFreeAgents().map(p => p.id));

    session.startNewSeason();

    afterSnap = session.snapshot();
    afterFreeAgentIds = new Set(session.getFreeAgents().map(p => p.id));
  }, 30_000);

  it('financialLog survives a rollover (gate receipts accrued last season are not lost)', () => {
    const afterLog = assertDefined(afterSnap.clubState, 'clubState missing').financialLog;
    expect(beforeFinancialLog.length).toBeGreaterThan(0);
    expect(afterLog.length).toBeGreaterThanOrEqual(beforeFinancialLog.length);
    expect(afterLog.slice(0, beforeFinancialLog.length)).toEqual(beforeFinancialLog);
  });

  it('recentDevelopment survives a rollover (last season\'s deltas are not wiped)', () => {
    const after = assertDefined(afterSnap.clubState, 'clubState missing').recentDevelopment;
    expect(beforeRecentDevelopment.length).toBeGreaterThan(0);
    expect(after).toEqual(beforeRecentDevelopment);
  });

  it('the free-agent pool survives a rollover (not replaced by a fresh random seed batch)', () => {
    expect(beforeFreeAgentIds.size).toBeGreaterThan(0);
    const survived = [...beforeFreeAgentIds].filter(id => afterFreeAgentIds.has(id));
    // Most of the churned pool should still be there (churnFreeAgents only removes retirees).
    expect(survived.length).toBeGreaterThan(beforeFreeAgentIds.size * 0.5);
  });

  it('a deliberately-chosen starting XI/bench survives a rollover', () => {
    const after = assertDefined(afterSnap.clubState, 'clubState missing');
    const survivingXI = chosenXI.filter(id => after.squad.some(p => p.id === id));
    const survivingBench = chosenBench.filter(id => after.squad.some(p => p.id === id));
    for (const id of survivingXI) { expect(after.startingXI).toContain(id); }
    for (const id of survivingBench) { expect(after.benchPlayers).toContain(id); }
  });

  it('the game date resets to the next season start after a rollover', () => {
    // Seasons end around May; the next season starts in August of the same calendar year.
    const now = assertDefined(afterSnap.now, 'afterSnap.now missing');
    expect(now.month).toBe(SEASON_START.month);
    expect(now.day).toBe(SEASON_START.day);
    // The rollover must advance time (new date is strictly later than before).
    const before = assertDefined(snapBefore.now, 'snapBefore.now missing');
    const isLater = (now.year > before.year)
      || (now.year === before.year && now.month > before.month)
      || (now.year === before.year && now.month === before.month && now.day >= before.day);
    expect(isLater).toBe(true);
  });

  it('promotion/relegation never applies to a brand-new game, only between seasons', () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const teamId = country.divisions[0].teams[0].id;
    session.startGame(teamId, [country.id]);
    const divisionBefore = assertDefined(session.snapshot().clubState, 'clubState missing').divisionId;

    session.startGame(teamId, [country.id]);
    const divisionAfter = assertDefined(session.snapshot().clubState, 'clubState missing').divisionId;

    expect(divisionAfter).toBe(divisionBefore);
  });

  it('a brand-new game always gets fresh-game defaults regardless of season-rollover behavior', () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const division = country.divisions[0];
    const teamId = division.teams[0].id;
    session.startGame(teamId, [country.id]);
    const cs = assertDefined(session.snapshot().clubState, 'clubState missing');
    expect(cs.budget).toBe(budgetStartFor(division.level));
    expect(cs.startingXI).toHaveLength(11);
    expect(session.getFreeAgents().length).toBeGreaterThan(0);
    expect(cs.financialLog).toHaveLength(0);
    expect(cs.recentDevelopment).toHaveLength(0);
  });
});
