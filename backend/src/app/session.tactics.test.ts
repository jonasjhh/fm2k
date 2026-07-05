import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';
import { defaultIntent, formationToStyle } from '@fm2k/engine';
import type { TeamTacticsIntent } from '@fm2k/engine';

function newGame() {
  const session = new GameSession();
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId, countryId: country.id };
}

const club = (s: GameSession) => assertDefined(s.snapshot().clubState, 'clubState missing');

describe('GameSession tactics:', () => {
  test('a new game starts with a balanced default intent mirroring the formation', () => {
    const { session } = newGame();
    const cs = club(session);
    expect(cs.tactics.style).toBe('balanced');
    expect(cs.tactics.formation).toBe(cs.formation);
    expect(cs.tactics.sliders).toEqual({ tempo: 50, risk: 50, defensiveLine: 50 });
  });

  test('setTactics replaces the intent and mirrors the formation', () => {
    const { session } = newGame();
    const intent: TeamTacticsIntent = {
      formation: '4-3-3', style: 'press_high', sliders: { tempo: 70, risk: 65, defensiveLine: 80 },
    };
    const cs = assertDefined(session.setTactics(intent), 'setTactics failed');
    expect(cs.tactics).toEqual(intent);
    expect(cs.formation).toBe('4-3-3');
  });

  test('setFormation keeps the intent formation in sync', () => {
    const { session } = newGame();
    const cs = assertDefined(session.setFormation('3-5-2'), 'setFormation failed');
    expect(cs.formation).toBe('3-5-2');
    expect(cs.tactics.formation).toBe('3-5-2');
  });

  test('every AI opponent team is stamped with formation-derived resolved params', () => {
    const { session, teamId } = newGame();
    const countries = session.getEditableCountries();
    const aiTeams = countries.flatMap(c => c.divisions.flatMap(d => d.teams)).filter(t => t.id !== teamId);
    expect(aiTeams.length).toBeGreaterThan(0);
    for (const t of aiTeams.slice(0, 20)) {
      expect(t.tacticsParams).toBeDefined();
      expect(t.tacticsIntent?.style).toBe(formationToStyle(t.formation));
    }
  });

  test('setTactics mirrors onto the player live Team object used by matches', () => {
    const { session, teamId } = newGame();
    const intent: TeamTacticsIntent = {
      formation: '4-3-3', style: 'press_high', sliders: { tempo: 75, risk: 60, defensiveLine: 85 },
    };
    session.setTactics(intent);
    const playerTeam = assertDefined(
      session.getEditableCountries().flatMap(c => c.divisions.flatMap(d => d.teams)).find(t => t.id === teamId),
      'player team not found',
    );
    expect(playerTeam.tacticsIntent).toEqual(intent);
    expect(playerTeam.formation).toBe('4-3-3');
    expect(playerTeam.tacticsParams).toBeDefined();
  });

  test('lastMatchInsights is empty before any match has been played', () => {
    const { session } = newGame();
    expect(session.snapshot().lastMatchInsights).toEqual([]);
  });

  test('tactics survive a save/load round-trip', () => {
    const { session } = newGame();
    const intent: TeamTacticsIntent = {
      formation: '4-2-3-1', style: 'keep_the_ball', sliders: { tempo: 40, risk: 30, defensiveLine: 45 },
    };
    session.setTactics(intent);
    const save = assertDefined(session.buildSaveData('QUICK'), 'buildSaveData failed');

    const reloaded = new GameSession();
    expect(reloaded.loadGame(save)).toBe(true);
    expect(club(reloaded).tactics).toEqual(intent);
  });

  test('an old save lacking tactics loads with a default intent', () => {
    const { session } = newGame();
    const save = assertDefined(session.buildSaveData('QUICK'), 'buildSaveData failed');
    delete (save.clubState as { tactics?: unknown }).tactics;

    const reloaded = new GameSession();
    expect(reloaded.loadGame(save)).toBe(true);
    const cs = club(reloaded);
    expect(cs.tactics).toEqual(defaultIntent(cs.formation));
  });
});
