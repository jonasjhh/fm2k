import { render, screen } from '@testing-library/react';

// MatchSimPanel reads from the zustand store via useGameStore(selector). We mock the store
// module (canonical '@/store/game-store' specifier, same as StatsBar.test.tsx) to drive the
// selector against a fixed, controlled state.
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
  MAX_PAUSES_PER_MATCH: 3,
}));

import MatchSimPanel from './MatchSimPanel';

function squadPlayer(id: string, suspension?: { matchesRemaining: number }, injury?: { type: string; matchesRemaining: number }) {
  return { id, name: id, suspension, injury };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    focusFixture: { homeTeamName: 'Us', awayTeamName: 'Them', status: 'scheduled' },
    focusLive: null,
    matchEvents: [],
    isStreaming: false,
    pauseRequested: false,
    pausesUsed: 0,
    lastPauseReason: null,
    lastMatchInsights: [],
    lastMatchStatistics: null,
    halfTimeInsights: [],
    editableCountries: [],
    streamHome: 0,
    streamAway: 0,
    streamMinute: 0,
    clubState: {
      startingXI: ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'],
      squad: [
        squadPlayer('gk'), squadPlayer('lb'), squadPlayer('cb1'), squadPlayer('cb2'), squadPlayer('rb'),
        squadPlayer('lm'), squadPlayer('cm1'), squadPlayer('cm2'), squadPlayer('rm'),
        squadPlayer('st1'), squadPlayer('st2'),
      ],
    },
    advanceMatch: vi.fn(),
    pauseMatch: vi.fn(),
    skipMatch: vi.fn(),
    goToNextMatch: vi.fn(),
    simulateToEnd: vi.fn(),
    ...overrides,
  };
}

describe('MatchSimPanel:', () => {
  test('a complete, unsuspended XI leaves the sim buttons enabled', () => {
    storeState = baseState();
    render(<MatchSimPanel />);
    expect(screen.getByText('Play Match')).not.toBeDisabled();
    expect(screen.getByText('Simulate')).not.toBeDisabled();
    expect(screen.getByText('Sim. Season')).not.toBeDisabled();
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/suspended/i)).not.toBeInTheDocument();
  });

  test('an incomplete starting XI disables the sim buttons and shows the incompleteness alert', () => {
    const state = baseState();
    const clubState = state.clubState as { startingXI: (string | null)[] };
    clubState.startingXI[0] = null; // clear the GK slot
    storeState = state;
    render(<MatchSimPanel />);
    expect(screen.getByText('Play Match')).toBeDisabled();
    expect(screen.getByText('Simulate')).toBeDisabled();
    expect(screen.getByText('Sim. Season')).toBeDisabled();
    expect(screen.getByText(/starting XI is incomplete/i)).toBeInTheDocument();
  });

  test('a complete XI with a suspended starter disables the sim buttons and shows the suspension alert', () => {
    storeState = baseState({
      clubState: {
        startingXI: ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'],
        squad: [
          squadPlayer('gk', { matchesRemaining: 1 }), squadPlayer('lb'), squadPlayer('cb1'), squadPlayer('cb2'),
          squadPlayer('rb'), squadPlayer('lm'), squadPlayer('cm1'), squadPlayer('cm2'), squadPlayer('rm'),
          squadPlayer('st1'), squadPlayer('st2'),
        ],
      },
    });
    render(<MatchSimPanel />);
    expect(screen.getByText('Play Match')).toBeDisabled();
    expect(screen.getByText(/includes a suspended player/i)).toBeInTheDocument();
  });

  test('a complete XI with an injured starter disables the sim buttons and shows the injury alert', () => {
    storeState = baseState({
      clubState: {
        startingXI: ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'],
        squad: [
          squadPlayer('gk', undefined, { type: 'knee_injury', matchesRemaining: 3 }), squadPlayer('lb'),
          squadPlayer('cb1'), squadPlayer('cb2'), squadPlayer('rb'), squadPlayer('lm'), squadPlayer('cm1'),
          squadPlayer('cm2'), squadPlayer('rm'), squadPlayer('st1'), squadPlayer('st2'),
        ],
      },
    });
    render(<MatchSimPanel />);
    expect(screen.getByText('Play Match')).toBeDisabled();
    expect(screen.getByText(/includes an injured player/i)).toBeInTheDocument();
  });

  test('while streaming, the Pause button shows the remaining budget and is enabled', () => {
    storeState = baseState({ isStreaming: true });
    render(<MatchSimPanel />);
    expect(screen.getByText('Pause (3 left)')).not.toBeDisabled();
  });

  test('with the pause budget spent, the Pause button is disabled', () => {
    storeState = baseState({ isStreaming: true, pausesUsed: 3 });
    render(<MatchSimPanel />);
    expect(screen.getByText('No pauses left')).toBeDisabled();
  });

  test('when both incomplete and suspended, the incompleteness message takes priority', () => {
    const state = baseState({
      clubState: {
        startingXI: [null, 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'],
        squad: [
          squadPlayer('lb', { matchesRemaining: 1 }), squadPlayer('cb1'), squadPlayer('cb2'), squadPlayer('rb'),
          squadPlayer('lm'), squadPlayer('cm1'), squadPlayer('cm2'), squadPlayer('rm'),
          squadPlayer('st1'), squadPlayer('st2'),
        ],
      },
    });
    storeState = state;
    render(<MatchSimPanel />);
    expect(screen.getByText(/starting XI is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByText(/includes a suspended player/i)).not.toBeInTheDocument();
  });
});
