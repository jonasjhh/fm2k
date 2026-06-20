import { render, screen } from '@testing-library/react';

// StatsBar reads from the zustand store via useGameStore(selector). We mock the store
// module (canonical '@/store/game-store' specifier, same as useLineupSlots.test.tsx) to
// drive the selector against a fixed, controlled state.
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
}));

import StatsBar from './StatsBar';

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    clubState: { budget: 1_234_567 },
    leagueState: {
      standings: [{ teamId: 'us', points: 42 }, { teamId: 'them', points: 10 }],
      fixtures: [],
    },
    playerTeamId: 'us',
    seasonComplete: false,
    ...overrides,
  };
}

describe('StatsBar:', () => {
  test('renders nothing when clubState is missing', () => {
    storeState = baseState({ clubState: null });
    const { container } = render(<StatsBar />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when leagueState is missing', () => {
    storeState = baseState({ leagueState: null });
    const { container } = render(<StatsBar />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows the formatted budget from clubState', () => {
    storeState = baseState();
    render(<StatsBar />);
    expect(screen.getByText('£1,234,567')).toBeInTheDocument();
  });

  test('shows the player team\'s league position with the correct ordinal suffix', () => {
    storeState = baseState({
      leagueState: {
        standings: [{ teamId: 'a', points: 9 }, { teamId: 'us', points: 6 }, { teamId: 'b', points: 3 }],
        fixtures: [],
      },
    });
    render(<StatsBar />);
    expect(screen.getByText('2nd')).toBeInTheDocument();
  });

  test('shows the player team\'s points', () => {
    storeState = baseState();
    render(<StatsBar />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('shows "Season Over" once the season is complete', () => {
    storeState = baseState({ seasonComplete: true });
    render(<StatsBar />);
    expect(screen.getByText('Season Over')).toBeInTheDocument();
  });

  test('shows the next fixture\'s date when the season is not complete', () => {
    storeState = baseState({
      leagueState: {
        standings: [{ teamId: 'us', points: 42 }],
        fixtures: [{
          status: 'scheduled', homeTeamId: 'us', awayTeamId: 'them', matchday: 5,
          scheduledTime: { day: 3, month: 9, year: 2025 },
        }],
      },
    });
    render(<StatsBar />);
    expect(screen.getByText('Next: 3 Sep 2025')).toBeInTheDocument();
  });
});
