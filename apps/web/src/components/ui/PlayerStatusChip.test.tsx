import { render, screen } from '@testing-library/react';
import PlayerStatusChip from './PlayerStatusChip';

describe('PlayerStatusChip:', () => {
  test('an injured player shows "Injured <n>md"', () => {
    render(<PlayerStatusChip player={{ injury: { type: 'hamstring', matchesRemaining: 2 } }} />);
    expect(screen.getByText('Injured 2md')).toBeInTheDocument();
  });

  test('a suspended player shows "Susp. <n>md"', () => {
    render(<PlayerStatusChip player={{ suspension: { matchesRemaining: 1 } }} />);
    expect(screen.getByText('Susp. 1md')).toBeInTheDocument();
  });

  test('a player with neither injury nor suspension shows "Fit"', () => {
    render(<PlayerStatusChip player={{}} />);
    expect(screen.getByText('Fit')).toBeInTheDocument();
  });

  test('injury takes priority over suspension when both are present', () => {
    render(<PlayerStatusChip player={{
      injury: { type: 'knee', matchesRemaining: 3 },
      suspension: { matchesRemaining: 5 },
    }} />);
    expect(screen.getByText('Injured 3md')).toBeInTheDocument();
  });
});
