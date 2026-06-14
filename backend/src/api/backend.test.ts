import { vi } from 'vitest';
import { createBackend } from './backend.ts';
import { GameSession } from '../app/session.ts';

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

// ── delegation: every command/query forwards to the owned GameSession ───────────
// Spying on the prototype lets us assert pure forwarding (args + return value)
// without driving the engine, killing the arrow-body and key-template mutants.

describe('createBackend delegation:', () => {
  const RET = Symbol('session-return');

  afterEach(() => vi.restoreAllMocks());

  // Each command delegates to the identically-named session method.
  const commandCases: Array<[string, unknown[]]> = [
    ['startGame', ['team-x', ['c1', 'c2']]],
    ['startNewSeason', []],
    ['saveGame', ['QUICK', 'tab']],
    ['loadGame', [{ save: 1 }]],
    ['advanceToNextStop', []],
    ['skipToFullTime', []],
    ['nextMatch', []],
    ['simulateToEnd', []],
    ['toggleXI', ['p1']],
    ['setStartingXI', [['a', 'b']]],
    ['setBench', [['c', 'd']]],
    ['setFormation', ['4-3-3']],
    ['buyPlayer', ['listing-9']],
    ['sellPlayer', ['player-9']],
    ['refreshTransfers', []],
    ['upgradeFacility', ['medical']],
    ['applyStadiumDesign', [{ s: 1 }, 100, 200]],
    ['setEditableCountries', [[{ id: 'c' }]]],
    ['updateTeamName', ['t', 'New Name']],
    ['updateTeamFormation', ['t', '4-3-3']],
    ['updatePlayerData', ['t', 'p', { age: 30 }]],
    ['regeneratePlayer', ['t', 'p']],
    ['removePlayer', ['t', 'p']],
    ['addGeneratedPlayer', ['t']],
    ['addPlayer', ['t', { name: 'X' }]],
    ['generateFullTeam', ['t']],
  ];

  for (const [name, args] of commandCases) {
    it(`commands.${name} forwards args and return value to the session`, () => {
      const spy = vi.spyOn(GameSession.prototype as any, name).mockReturnValue(RET as any);
      const backend = createBackend();
      const result = (backend.commands as any)[name](...args);
      expect(spy).toHaveBeenCalledWith(...args);
      expect(result).toBe(RET);
    });
  }

  // Queries that delegate directly to a session method.
  const directQueryCases: Array<[string, string]> = [
    ['getSnapshot', 'snapshot'],
    ['getEditableCountries', 'getEditableCountries'],
    ['getNow', 'getNow'],
    ['getLiveMatches', 'liveMatches'],
  ];

  for (const [query, method] of directQueryCases) {
    it(`queries.${query} forwards to session.${method}`, () => {
      const spy = vi.spyOn(GameSession.prototype as any, method).mockReturnValue(RET as any);
      const backend = createBackend();
      expect((backend.queries as any)[query]()).toBe(RET);
      expect(spy).toHaveBeenCalled();
    });
  }

  // Queries that read a specific field off the snapshot — pin the field/key access.
  it('snapshot-derived queries each return their own field', () => {
    const snap = {
      clubState: { tag: 'club' },
      leagueState: { tag: 'league' },
      leagueStates: { tag: 'leagues' },
      cupStates: { 'nor-cup': { tag: 'nor-cup' }, 'swe-cup': { tag: 'swe-cup' } },
      transferListings: [{ tag: 'listing' }],
      lastMatchResult: { tag: 'result' },
      currentMatchday: 7,
      seasonComplete: true,
    };
    vi.spyOn(GameSession.prototype, 'snapshot').mockReturnValue(snap as any);
    const { queries } = createBackend();

    expect(queries.getClubState()).toBe(snap.clubState);
    expect(queries.getLeagueState()).toBe(snap.leagueState);
    expect(queries.getLeagueStates()).toBe(snap.leagueStates);
    expect(queries.getCupStates()).toBe(snap.cupStates);
    expect(queries.getTransferListings()).toBe(snap.transferListings);
    expect(queries.getLastMatchResult()).toBe(snap.lastMatchResult);
    expect(queries.getCurrentMatchday()).toBe(7);
    expect(queries.isSeasonComplete()).toBe(true);
    // getCupState builds the `${nationId}-cup` key and falls back to null.
    expect(queries.getCupState('nor')).toBe(snap.cupStates['nor-cup']);
    expect(queries.getCupState('swe')).toBe(snap.cupStates['swe-cup']);
    expect(queries.getCupState('absent')).toBeNull();
  });

  it('events.subscribe forwards to the session and returns its unsubscribe', () => {
    const spy = vi.spyOn(GameSession.prototype, 'subscribe').mockReturnValue(RET as any);
    const backend = createBackend();
    const listener = () => {};
    const unsub = backend.events.subscribe(listener);
    expect(spy).toHaveBeenCalledWith(listener);
    expect(unsub).toBe(RET);
  });
});
