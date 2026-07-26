import { render, screen } from '@testing-library/react';
import type { ClubPlayer, PlayerAttributes } from '@fm2k/engine';

// TrainingTab reads the store via useGameStore(selector) — with useShallow for its own slice and
// a bare selector inside useDivisionPar — so a single selector-driven mock covers both.
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
}));

import TrainingTab from './TrainingTab';

function attrs(v = 40): PlayerAttributes {
  return {
    speed: v, strength: v, stamina: v, passing: v,
    technique: v, finishing: v, defending: v, goalkeeping: v,
  };
}

function player(id: string, name: string, age = 25): ClubPlayer {
  return {
    id, name, nationality: 'Norwegian', age, position: 'CM', potential: 70,
    attributes: attrs(), fitness: 1000,
  } as ClubPlayer;
}

function state(over: Record<string, unknown> = {}) {
  return {
    clubState: {
      divisionId: 'div1',
      squad: [player('veteran', 'Stayed All Season'), player('rookie', 'Just Arrived', 16)],
      recentDevelopment: [],
      recentArrivals: [],
      ...(over.clubState as object ?? {}),
    },
    setTraining: () => {},
  };
}

describe('TrainingTab development column:', () => {
  test('a player who was here all season and did not change reads as no change', () => {
    storeState = state();
    render(<TrainingTab />);
    expect(screen.getAllByText(/no change last season/i)).toHaveLength(2);
  });

  test('a mid-season arrival reads as newly joined, not as a player who stagnated', () => {
    // The distinction the engine's `recentArrivals` exists to carry: an academy intake has no
    // season-start baseline, so it can never have a delta. Reporting that as "no change" told
    // the player their training facilities were doing nothing.
    storeState = state({ clubState: { recentArrivals: ['rookie'] } });
    render(<TrainingTab />);
    expect(screen.getByText(/joined this season/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no change last season/i)).toHaveLength(1);
  });

  test('an arrival that somehow has a delta shows the delta rather than the joined label', () => {
    storeState = state({
      clubState: {
        recentArrivals: ['rookie'],
        recentDevelopment: [
          { playerId: 'rookie', playerName: 'Just Arrived', age: 16, deltas: { speed: 2 } },
        ],
      },
    });
    render(<TrainingTab />);
    expect(screen.getByText('SPD +2')).toBeInTheDocument();
    expect(screen.queryByText(/joined this season/i)).not.toBeInTheDocument();
  });
});
