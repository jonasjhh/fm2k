import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ConfirmProvider } from '@fm2k/design-system';

// The overlay reads the store via useGameStore(selector); mock the module and drive
// the selectors against a controlled state (same pattern as MatchSimPanel.test.tsx).
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
  findTeamById: () => undefined,
  MAX_PAUSES_PER_MATCH: 3,
}));

import MatchOverlay from './MatchOverlay';

const render = (ui: ReactElement) => rtlRender(<ConfirmProvider>{ui}</ConfirmProvider>);

function squadPlayer(id: string, position = 'CM') {
  return { id, name: `Name ${id}`, position };
}

const XI = ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'];

function statistics() {
  const zeros = { home: 0, away: 0 };
  return {
    possession: { home: 50, away: 50 },
    shots: { home: 3, away: 1 },
    shotsOnTarget: zeros,
    passes: { home: { attempted: 10, completed: 8 }, away: { attempted: 10, completed: 7 } },
    corners: zeros,
    fouls: zeros,
    cards: { yellow: zeros, red: zeros },
    playerRatings: {},
  };
}

function clubState() {
  return {
    clubId: 'us',
    formation: '4-4-2',
    startingXI: [...XI],
    benchPlayers: ['sub1', 'sub2'],
    pendingSubstitutions: [],
    squad: [...XI.map(id => squadPlayer(id)), squadPlayer('sub1'), squadPlayer('sub2')],
    customSlots: null,
    emptySlotRoles: null,
    tactics: { style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50 } },
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    matchOverlayOpen: true,
    focusFixture: { homeTeamId: 'us', awayTeamId: 'them', homeTeamName: 'Us', awayTeamName: 'Them', status: 'scheduled' },
    focusLive: null,
    matchEvents: [],
    isStreaming: false,
    pauseRequested: false,
    pausesUsed: 0,
    lastPauseReason: null,
    streamHome: 0,
    streamAway: 0,
    streamMinute: 0,
    lastMatchInsights: [],
    lastMatchStatistics: null,
    halfTimeInsights: [],
    editableCountries: [],
    clubState: clubState(),
    advanceMatch: vi.fn(),
    pauseMatch: vi.fn(),
    skipMatch: vi.fn(),
    goToNextMatch: vi.fn(),
    simulateToEnd: vi.fn(),
    closeMatchOverlay: vi.fn(),
    queueSubstitution: vi.fn(),
    setStyle: vi.fn(),
    setSliders: vi.fn(),
    ...overrides,
  };
}

const liveMatch = (overrides: Record<string, unknown> = {}) => ({
  phase: 'second_half', minute: 61, homeScore: 1, awayScore: 0, statistics: statistics(), ...overrides,
});

describe('MatchOverlay:', () => {
  test('renders nothing while matchOverlayOpen is false', () => {
    storeState = baseState({ matchOverlayOpen: false });
    render(<MatchOverlay />);
    expect(screen.queryByText(/Us .* Them/)).not.toBeInTheDocument();
  });

  test('while streaming, shows the live score and an enabled Pause with the remaining budget', () => {
    storeState = baseState({ isStreaming: true, streamHome: 2, streamAway: 1, streamMinute: 34 });
    render(<MatchOverlay />);
    expect(screen.getByText('Us 2 – 1 Them')).toBeInTheDocument();
    expect(screen.getByText('34\'')).toBeInTheDocument();
    expect(screen.getByText('Pause (3 left)')).not.toBeDisabled();
  });

  test('with the pause budget spent, the Pause button is disabled', () => {
    storeState = baseState({ isStreaming: true, pausesUsed: 3 });
    render(<MatchOverlay />);
    expect(screen.getByText('No pauses left')).toBeDisabled();
  });

  test('paused mid-half: Resume/Skip controls, in-overlay tactics, substitutions and running stats', () => {
    storeState = baseState({ focusLive: liveMatch() });
    render(<MatchOverlay />);
    fireEvent.click(screen.getByText('Resume'));
    expect((storeState.advanceMatch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Skip to full time')).toBeInTheDocument();
    expect(screen.getByText('Style')).toBeInTheDocument();               // TacticsSection
    expect(screen.getByText(/subs? left/)).toBeInTheDocument();          // SubstitutionPanel
    expect(screen.getByText('Stats after 61\'')).toBeInTheDocument();    // MatchStatsSheet
  });

  test('at half time: Continue control and the half-time read', () => {
    storeState = baseState({
      focusLive: liveMatch({ phase: 'half_time', minute: 45 }),
      halfTimeInsights: [{ category: 'neutral', headline: 'Even contest', detail: 'Nothing between the sides.' }],
    });
    render(<MatchOverlay />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('Half-time read')).toBeInTheDocument();
    expect(screen.getByText('Even contest')).toBeInTheDocument();
    expect(screen.getByText('First-half stats')).toBeInTheDocument();
  });

  test('an own-side injury pause shows the substitution banner', () => {
    storeState = baseState({ focusLive: liveMatch(), lastPauseReason: 'injury' });
    render(<MatchOverlay />);
    expect(screen.getByText(/make a substitution before playing on/)).toBeInTheDocument();
  });

  test('a red-card pause shows the reorganise banner', () => {
    storeState = baseState({ focusLive: liveMatch(), lastPauseReason: 'red_card' });
    render(<MatchOverlay />);
    expect(screen.getByText(/reorganise your side before playing on/)).toBeInTheDocument();
  });

  test('completed: full-time readout with Next match, close, and the FT stats/analysis', () => {
    storeState = baseState({
      focusFixture: {
        homeTeamId: 'us', awayTeamId: 'them', homeTeamName: 'Us', awayTeamName: 'Them',
        status: 'completed', result: { homeScore: 2, awayScore: 1 },
      },
      lastMatchStatistics: statistics(),
      lastMatchInsights: [{ category: 'attack', headline: 'Clinical up front', detail: 'Two goals from three shots.' }],
    });
    render(<MatchOverlay />);
    expect(screen.getByText('Full time')).toBeInTheDocument();
    expect(screen.getByText('Match stats')).toBeInTheDocument();
    expect(screen.getByText('Clinical up front')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect((storeState.closeMatchOverlay as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Next match'));
    expect((storeState.goToNextMatch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  test('ticker events render in the left pane', () => {
    storeState = baseState({
      isStreaming: true,
      matchEvents: [
        { minute: '12\'', text: '[Us] Goal! A fine finish.', type: 'goal', team: 'home' as const },
        { minute: '3\'', text: '[Them] A probing pass forward.', type: 'normal', team: 'away' as const },
      ],
    });
    render(<MatchOverlay />);
    expect(screen.getByText('Goal! A fine finish.')).toBeInTheDocument();
    expect(screen.getByText('A probing pass forward.')).toBeInTheDocument();
  });
});
