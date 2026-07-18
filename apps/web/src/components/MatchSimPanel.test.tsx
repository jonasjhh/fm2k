import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ConfirmProvider } from '@fm2k/design-system';

// MatchSimPanel reads from the zustand store via useGameStore(selector). We mock the store
// module (canonical '@/store/game-store' specifier, same as StatsBar.test.tsx) to drive the
// selector against a fixed, controlled state.
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
  MAX_PAUSES_PER_MATCH: 3,
}));

import MatchSimPanel from './MatchSimPanel';

// The panel's Sim. Season button uses the design-system confirm hook, which requires the provider.
const render = (ui: ReactElement) => rtlRender(<ConfirmProvider>{ui}</ConfirmProvider>);

function squadPlayer(id: string, suspension?: { matchesRemaining: number }, injury?: { type: string; matchesRemaining: number }) {
  return { id, name: id, suspension, injury };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    focusFixture: { homeTeamName: 'Us', awayTeamName: 'Them', status: 'scheduled' },
    focusLive: null,
    matchOverlayOpen: false,
    clubState: {
      startingXI: ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'],
      squad: [
        squadPlayer('gk'), squadPlayer('lb'), squadPlayer('cb1'), squadPlayer('cb2'), squadPlayer('rb'),
        squadPlayer('lm'), squadPlayer('cm1'), squadPlayer('cm2'), squadPlayer('rm'),
        squadPlayer('st1'), squadPlayer('st2'),
      ],
    },
    advanceMatch: vi.fn(),
    skipMatch: vi.fn(),
    goToNextMatch: vi.fn(),
    simulateToEnd: vi.fn(),
    openMatchOverlay: vi.fn(),
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

  test('Sim. Season asks for confirmation in the themed modal before simulating', async () => {
    storeState = baseState();
    render(<MatchSimPanel />);
    fireEvent.click(screen.getByText('Sim. Season'));
    expect(await screen.findByText('Simulate all remaining matches?')).toBeInTheDocument();

    // Cancel first: nothing happens and the dialog closes.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Simulate all remaining matches?')).not.toBeInTheDocument());
    expect(storeState.simulateToEnd).not.toHaveBeenCalled();

    // Confirm: simulateToEnd fires.
    fireEvent.click(screen.getByText('Sim. Season'));
    fireEvent.click(await screen.findByRole('button', { name: 'Simulate' }));
    await waitFor(() => expect(storeState.simulateToEnd).toHaveBeenCalledTimes(1));
  });

  test('the panel hides entirely while the match overlay is up', () => {
    storeState = baseState({ matchOverlayOpen: true });
    const { container } = render(<MatchSimPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a completed fixture shows the result and offers report / next match / sim season', () => {
    storeState = baseState({
      focusFixture: {
        homeTeamName: 'Us', awayTeamName: 'Them', status: 'completed',
        result: { homeScore: 2, awayScore: 1 },
      },
    });
    render(<MatchSimPanel />);
    expect(screen.getByText(/Full time: Us 2 – 1 Them/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Match report'));
    expect(storeState.openMatchOverlay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Next match'));
    expect(storeState.goToNextMatch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sim. Season')).toBeInTheDocument();
  });

  test('a live match with the overlay closed offers the way back in', () => {
    storeState = baseState({ focusLive: { phase: 'second_half', minute: 61, homeScore: 0, awayScore: 0 } });
    render(<MatchSimPanel />);
    fireEvent.click(screen.getByText('Return to match'));
    expect(storeState.openMatchOverlay).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Play Match')).not.toBeInTheDocument();
  });
});
