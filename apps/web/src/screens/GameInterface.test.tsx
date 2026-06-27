import { render, screen } from '@testing-library/react';

// GameInterface reads from the zustand store via useGameStore(selector). We mock the store
// module (canonical '@/store/game-store' specifier, same as StatsBar.test.tsx) to drive the
// selector against a fixed, controlled state. activeTab/leagueState are kept minimal so only
// MatchTab (which returns null without a leagueState) renders in the tab body.
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
  findTeamById: () => undefined,
}));

import GameInterface from './GameInterface';

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    activeTab: 'match',
    setActiveTab: vi.fn(),
    goToMainMenu: vi.fn(),
    saveGame: vi.fn(),
    clubState: null,
    liveMatches: [],
    playerTeamId: 'us',
    editableCountries: [],
    leagueState: null,
    ...overrides,
  };
}

describe('GameInterface:', () => {
  test('with no live match for the player\'s club, all tabs are enabled', () => {
    storeState = baseState();
    render(<GameInterface />);
    expect(screen.getByRole('tab', { name: 'Squad' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Tactics' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Match' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Newspaper' })).not.toBeDisabled();
  });

  test('with the player\'s own match live, every tab except Match is disabled (regression)', () => {
    storeState = baseState({
      liveMatches: [{ fixtureId: 'f1', competitionId: 'c1', homeTeamId: 'us', awayTeamId: 'them', homeTeamName: 'Us', awayTeamName: 'Them', homeScore: 0, awayScore: 0, minute: 10, phase: 'first_half' }],
    });
    render(<GameInterface />);
    expect(screen.getByRole('tab', { name: 'Squad' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Tactics' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Fixtures' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Newspaper' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Match' })).not.toBeDisabled();
  });

  test('a live match that is already full_time does not lock navigation', () => {
    storeState = baseState({
      liveMatches: [{ fixtureId: 'f1', competitionId: 'c1', homeTeamId: 'us', awayTeamId: 'them', homeTeamName: 'Us', awayTeamName: 'Them', homeScore: 0, awayScore: 0, minute: 90, phase: 'full_time' }],
    });
    render(<GameInterface />);
    expect(screen.getByRole('tab', { name: 'Squad' })).not.toBeDisabled();
  });

  test('a live match involving other clubs does not lock navigation', () => {
    storeState = baseState({
      liveMatches: [{ fixtureId: 'f2', competitionId: 'c1', homeTeamId: 'them', awayTeamId: 'rival', homeTeamName: 'Them', awayTeamName: 'Rival', homeScore: 0, awayScore: 0, minute: 10, phase: 'first_half' }],
    });
    render(<GameInterface />);
    expect(screen.getByRole('tab', { name: 'Squad' })).not.toBeDisabled();
  });
});
