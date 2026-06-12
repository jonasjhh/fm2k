import { createBackend } from './backend.ts';

function started() {
  const backend = createBackend();
  const country = backend.queries.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  backend.commands.startGame(teamId, [country.id]);
  return { backend, teamId };
}

describe('createBackend (CQRS facade):', () => {
  it('separates commands (write) from queries (read) with consistent state', () => {
    const { backend } = started();
    const cs = backend.commands.setFormation('4-3-3');
    expect(cs?.formation).toBe('4-3-3');
    // query reflects the command
    expect(backend.queries.getClubState()?.formation).toBe('4-3-3');
  });

  it('notifies event subscribers when a command mutates state', () => {
    const { backend } = started();
    let fired = 0;
    backend.events.subscribe(() => { fired++; });
    backend.commands.refreshTransfers();
    expect(fired).toBe(1);
  });

  it('exposes a query snapshot after starting a game', () => {
    const { backend, teamId } = started();
    const snap = backend.queries.getSnapshot();
    expect(snap.playerTeamId).toBe(teamId);
    expect(backend.queries.getTransferListings().length).toBeGreaterThan(0);
    expect(backend.queries.isSeasonComplete()).toBe(false);
  });
});
