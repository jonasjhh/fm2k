import { GameSession } from './session.ts';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, country, teamId };
}

describe('GameSession tactics:', () => {
  it('given a formation change then the club state reflects it and notifies', () => {
    const { session } = newGame();
    let notified = 0;
    session.subscribe(() => { notified++; });
    const cs = session.setFormation('4-3-3');
    expect(cs?.formation).toBe('4-3-3');
    expect(notified).toBe(1);
  });

  it('given setStartingXI then the XI is stored', () => {
    const { session } = newGame();
    const squad = session.snapshot().clubState!.squad;
    const ids = squad.slice(0, 11).map(p => p.id);
    const cs = session.setStartingXI(ids);
    expect(cs?.startingXI).toEqual(ids);
  });
});

describe('GameSession transfers:', () => {
  it('given a market refresh then active listings are returned', () => {
    const { session } = newGame();
    const listings = session.refreshTransfers();
    expect(listings.length).toBeGreaterThan(0);
  });

  it('given selling a squad player then the squad shrinks and budget grows', () => {
    const { session } = newGame();
    const before = session.snapshot().clubState!;
    const victim = before.squad[before.squad.length - 1];
    const ok = session.sellPlayer(victim.id);
    expect(ok).toBe(true);
    const after = session.snapshot().clubState!;
    expect(after.squad.find(p => p.id === victim.id)).toBeUndefined();
    expect(after.budget).toBeGreaterThan(before.budget);
  });

  it('given selling an unknown player then it fails', () => {
    const { session } = newGame();
    expect(session.sellPlayer('nope')).toBe(false);
  });
});

describe('GameSession editor:', () => {
  it('given a team rename then the hierarchy reflects the new name', () => {
    const { session, teamId } = newGame();
    const updated = session.updateTeamName(teamId, 'Renamed FC');
    const team = updated.flatMap(c => c.divisions).flatMap(d => d.teams).find(t => t.id === teamId);
    expect(team?.name).toBe('Renamed FC');
  });

  it('given generateFullTeam then the team has 11 starters and 4 subs', () => {
    const { session, teamId } = newGame();
    const updated = session.generateFullTeam(teamId);
    const team = updated.flatMap(c => c.divisions).flatMap(d => d.teams).find(t => t.id === teamId);
    expect(team?.starters).toHaveLength(11);
    expect(team?.substitutes).toHaveLength(4);
  });
});
