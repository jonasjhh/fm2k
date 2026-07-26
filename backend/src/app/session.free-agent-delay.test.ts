import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';

/**
 * The AI pickup delay gives the manager a head start on freshly listed free agents. The season
 * rollover used to void it: the pool was restamped at the end of the old season (~May) and then
 * the clock jumped to August, putting every stamp in the past before the first window opened.
 */
describe('GameSession free-agent pickup delay across a season rollover:', () => {
  it('restamps the carried-over pool from the new season start, not the old season end', async () => {
    const session = new GameSession();
    const country = session.getEditableCountries()[0];
    const teamId = country.divisions[0].teams[0].id;
    session.startGame(teamId, [country.id]);

    await session.simulateToEnd();
    session.startNewSeason();

    const save = assertDefined(session.buildSaveData('QUICK'), 'save data missing');
    const now = assertDefined(save.now, 'now missing');
    const availability = assertDefined(save.transferFreeAgentAvailability, 'availability missing');
    const stamps = Object.values(availability);

    expect(save.transferFreeAgents?.length).toBeGreaterThan(0);
    expect(stamps.length).toBe(save.transferFreeAgents?.length);

    // Delays are geometric (up to 28 days), so a handful land on day one — but the bulk must
    // still be in the future relative to the freshly reset season-start clock.
    const future = stamps.filter(d => d.year > now.year
      || (d.year === now.year && d.month > now.month)
      || (d.year === now.year && d.month === now.month && d.day > now.day));
    expect(future.length).toBeGreaterThan(stamps.length * 0.5);
  }, 30_000);
});
