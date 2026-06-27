import { render, screen } from '@testing-library/react';

// NewspaperTab reads from the zustand store via useGameStore(selector). We mock the store
// module (canonical '@/store/game-store' specifier, same as StatsBar.test.tsx) to drive the
// selector against a fixed, controlled state.
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
}));

import NewspaperTab from './NewspaperTab';

const TS = { year: 2026, month: 3, day: 1, hour: 12, minute: 0 };

describe('NewspaperTab:', () => {
  test('shows a placeholder when there are no current headlines', () => {
    storeState = { headlines: [] };
    render(<NewspaperTab />);
    expect(screen.getByText(/no news to report/i)).toBeInTheDocument();
  });

  test('renders each headline, newest first', () => {
    storeState = {
      headlines: [
        { id: 1, category: 'blowout', headline: 'Rovers HUMILIATE United 5-0', timestamp: TS },
        { id: 2, category: 'transfer', headline: 'You\'ve completed the signing of Jane Doe!', timestamp: TS },
      ],
    };
    render(<NewspaperTab />);
    const headlines = screen.getAllByText(/HUMILIATE|signing of Jane Doe/);
    expect(headlines).toHaveLength(2);
    // newest-pushed (transfer, id 2) renders before the older one (blowout, id 1).
    expect(headlines[0]).toHaveTextContent('Jane Doe');
    expect(headlines[1]).toHaveTextContent('HUMILIATE');
  });

  test('tags each article with its category label', () => {
    storeState = {
      headlines: [{ id: 1, category: 'upset', headline: 'SHOCK RESULT: Minnows stun Giants', timestamp: TS }],
    };
    render(<NewspaperTab />);
    expect(screen.getByText('Shock Result')).toBeInTheDocument();
  });
});
