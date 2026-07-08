import { render, screen } from '@testing-library/react';
import PlayerStatusChip from './PlayerStatusChip';

describe('PlayerStatusChip:', () => {
  test('an injured player shows "Injured <n>md" alongside the fitness bar', () => {
    render(<PlayerStatusChip player={{ fitness: 800, injury: { type: 'hamstring', matchesRemaining: 2, originalDuration: 2 } }} />);
    expect(screen.getByText('Injured 2md')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  test('a suspended player shows "Susp. <n>md" alongside the fitness bar', () => {
    render(<PlayerStatusChip player={{ fitness: 950, suspension: { matchesRemaining: 1 } }} />);
    expect(screen.getByText('Susp. 1md')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();
  });

  test('a player with neither injury nor suspension shows just the fitness bar', () => {
    render(<PlayerStatusChip player={{ fitness: 720 }} />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.queryByText(/Injured|Susp\./)).not.toBeInTheDocument();
  });

  test('injury takes priority over suspension when both are present', () => {
    render(<PlayerStatusChip player={{
      fitness: 500,
      injury: { type: 'knee', matchesRemaining: 3, originalDuration: 3 },
      suspension: { matchesRemaining: 5 },
    }} />);
    expect(screen.getByText('Injured 3md')).toBeInTheDocument();
    expect(screen.queryByText('Susp. 5md')).not.toBeInTheDocument();
  });
});
