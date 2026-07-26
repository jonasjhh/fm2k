import { render, screen } from '@testing-library/react';
import { addDays, createGameDateTime } from '@fm2k/engine';

// The chip reads the game clock to turn an injury's return date into a countdown, so the
// store is mocked (canonical '@/store/game-store' specifier) to pin "today".
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
}));

import PlayerStatusChip from './PlayerStatusChip';

const NOW = createGameDateTime(2026, 3, 1, 15, 0);

beforeEach(() => { storeState = { now: NOW }; });

/** An injury due back `days` from the mocked clock. */
function injury(type: string, days: number) {
  return { type, returnDate: addDays(NOW, days), originalDays: days };
}

describe('PlayerStatusChip:', () => {
  test('an injured player shows the days left until their return date', () => {
    render(<PlayerStatusChip player={{ fitness: 800, injury: injury('hamstring_pull', 18) }} />);
    expect(screen.getByText('Injured 18d')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  test('the countdown shrinks as the clock advances, with the injury unchanged', () => {
    // The whole reason the countdown is derived rather than stored: nothing about the injury
    // changes when time passes, but what the manager needs to read does.
    const player = { fitness: 800, injury: injury('knee_injury', 30) };
    const { rerender } = render(<PlayerStatusChip player={player} />);
    expect(screen.getByText('Injured 30d')).toBeInTheDocument();

    storeState = { now: addDays(NOW, 22) };
    rerender(<PlayerStatusChip player={player} />);
    expect(screen.getByText('Injured 8d')).toBeInTheDocument();
  });

  test('a return date already passed never shows a negative countdown', () => {
    storeState = { now: addDays(NOW, 40) };
    render(<PlayerStatusChip player={{ fitness: 800, injury: injury('muscle_strain', 5) }} />);
    expect(screen.getByText('Injured 0d')).toBeInTheDocument();
  });

  test('a suspended player shows "Susp. <n>md" — bans really are counted in matches', () => {
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
      injury: injury('knee_injury', 21),
      suspension: { matchesRemaining: 5 },
    }} />);
    expect(screen.getByText('Injured 21d')).toBeInTheDocument();
    expect(screen.queryByText('Susp. 5md')).not.toBeInTheDocument();
  });

  test('without a clock the chip still reports the injury, just without a countdown', () => {
    storeState = { now: null };
    render(<PlayerStatusChip player={{ fitness: 800, injury: injury('hamstring_pull', 18) }} />);
    expect(screen.getByText('Injured')).toBeInTheDocument();
  });
});
