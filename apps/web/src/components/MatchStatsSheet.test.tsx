import { render, screen, fireEvent } from '@testing-library/react';
import type { MatchStatistics } from '@fm2k/engine';
import MatchStatsSheet from './MatchStatsSheet';

const zeroTally = { attempts: 0, successes: 0 };

function statistics(overrides: Partial<MatchStatistics> = {}): MatchStatistics {
  return {
    possession: { home: 61, away: 39 },
    shots: { home: 14, away: 5 },
    shotsOnTarget: { home: 6, away: 2 },
    corners: { home: 7, away: 1 },
    fouls: { home: 8, away: 12 },
    cards: { yellow: { home: 1, away: 3 }, red: { home: 0, away: 0 } },
    passes: {
      home: { attempted: 100, completed: 80 },
      away: { attempted: 60, completed: 30 },
    },
    lateGoals: { home: 0, away: 0 },
    fastBreakGoals: { home: 0, away: 0 },
    actionBreakdown: {
      home: { short_pass: zeroTally, long_pass: zeroTally, through_ball: zeroTally, cross: zeroTally, dribble: zeroTally },
      away: { short_pass: zeroTally, long_pass: zeroTally, through_ball: zeroTally, cross: zeroTally, dribble: zeroTally },
    },
    playerRatings: { p1: 8.2, p2: 5.5, p3: 6.9 },
    ...overrides,
  };
}

describe('MatchStatsSheet:', () => {
  test('renders the headline rows with both sides’ numbers', () => {
    render(<MatchStatsSheet statistics={statistics()} homeName="Us" awayName="Them" title="Match stats" />);
    expect(screen.getByText('Match stats')).toBeInTheDocument();
    expect(screen.getByText('Possession')).toBeInTheDocument();
    expect(screen.getByText('61%')).toBeInTheDocument();
    expect(screen.getByText('39%')).toBeInTheDocument();
    expect(screen.getByText('Shots')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    // pass completion derived from the tallies: 80/100 and 30/60
    expect(screen.getByText('Pass completion')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  test('hides the red-card row when neither side saw red, shows it otherwise', () => {
    const { rerender } = render(
      <MatchStatsSheet statistics={statistics()} homeName="Us" awayName="Them" title="Match stats" />,
    );
    expect(screen.queryByText('Red cards')).not.toBeInTheDocument();
    rerender(
      <MatchStatsSheet
        statistics={statistics({ cards: { yellow: { home: 0, away: 0 }, red: { home: 1, away: 0 } } })}
        homeName="Us" awayName="Them" title="Match stats"
      />,
    );
    expect(screen.getByText('Red cards')).toBeInTheDocument();
  });

  test('player ratings expand sorted by rating, with name, effective position and team colours', () => {
    const info: Record<string, { name: string; position: string; colors?: { primary: string; secondary: string } }> = {
      p1: { name: 'Alice', position: 'RWB', colors: { primary: 'rgb(255, 0, 0)', secondary: 'rgb(255, 255, 255)' } },
      p2: { name: 'Bea', position: 'ST', colors: { primary: 'rgb(0, 0, 255)', secondary: 'rgb(255, 255, 0)' } },
      p3: { name: 'Cleo', position: 'GK' },
    };
    render(
      <MatchStatsSheet
        statistics={statistics()} homeName="Us" awayName="Them" title="Match stats"
        resolvePlayer={(id) => info[id]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /player ratings/i }));
    const chips = ['Alice · RWB · 8.2', 'Cleo · GK · 6.9', 'Bea · ST · 5.5'];
    const rendered = chips.map(label => screen.getByText(label));
    // sorted best-first in the DOM
    expect(rendered.map(el => el.textContent)).toEqual(chips);
    // team colours land on the pill
    const alicePill = rendered[0].closest('.MuiChip-root');
    expect(alicePill).toHaveStyle({ backgroundColor: 'rgb(255, 0, 0)' });
  });

  test('unresolved players fall back to their id', () => {
    render(
      <MatchStatsSheet
        statistics={statistics({ playerRatings: { mystery: 7.0 } })}
        homeName="Us" awayName="Them" title="Match stats"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /player ratings/i }));
    expect(screen.getByText('mystery · 7.0')).toBeInTheDocument();
  });

  test('no ratings section when the statistics carry no player ratings', () => {
    render(
      <MatchStatsSheet statistics={statistics({ playerRatings: {} })} homeName="Us" awayName="Them" title="Match stats" />,
    );
    expect(screen.queryByRole('button', { name: /player ratings/i })).not.toBeInTheDocument();
  });
});
