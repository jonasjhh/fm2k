import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { ClubPlayer } from '@fm2k/engine';

// The hook reads from the zustand store via useGameStore(selector). We mock the
// store module to drive the selector against a fixed, controlled club state.
const setStartingXI = vi.fn();
const setBench = vi.fn();
let storeState: Record<string, unknown>;

vi.mock('@/store/game-store', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
}));

import { useLineupSlots } from './useLineupSlots';

function squadPlayer(id: string, position: string): ClubPlayer {
  return {
    id, name: id, nationality: 'n', age: 25, position, potential: 70,
    attributes: {
      speed: 60, strength: 60, agility: 60, passing: 60, finishing: 60,
      technique: 60, defending: 60, stamina: 60, awareness: 60, composure: 60,
    },
    fitness: 100,
  } as ClubPlayer;
}

// A 4-4-2 worth of players whose positions match the formation slots exactly.
const SQUAD: ClubPlayer[] = [
  squadPlayer('gk', 'GK'),
  squadPlayer('lb', 'LB'), squadPlayer('cb1', 'CB'), squadPlayer('cb2', 'CB'), squadPlayer('rb', 'RB'),
  squadPlayer('lm', 'LM'), squadPlayer('cm1', 'CM'), squadPlayer('cm2', 'CM'), squadPlayer('rm', 'RM'),
  squadPlayer('st1', 'ST'), squadPlayer('st2', 'ST'),
  squadPlayer('sub1', 'CB'), squadPlayer('sub2', 'ST'),
];

beforeEach(() => {
  setStartingXI.mockClear();
  setBench.mockClear();
  storeState = {
    clubState: {
      formation: '4-4-2',
      startingXI: SQUAD.slice(0, 11).map(p => p.id),
      benchPlayers: ['sub1', 'sub2'],
      squad: SQUAD,
    },
    setStartingXI,
    setBench,
  };
});

describe('useLineupSlots:', () => {
  it('given a matching XI then players occupy the slot of their own position', () => {
    const { result } = renderHook(() => useLineupSlots());
    const starters = result.current.slotAssignments.slice(0, 11);
    // 4-4-2 flat slots: GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST
    expect(starters).toEqual(['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2']);
  });

  it('given bench players then they fill the four substitute slots', () => {
    const { result } = renderHook(() => useLineupSlots());
    expect(result.current.slotAssignments.slice(11)).toEqual(['sub1', 'sub2', null, null]);
  });

  it('given a cleared slot then it commits the reduced XI to the store', () => {
    const { result } = renderHook(() => useLineupSlots());
    act(() => result.current.handleSlotClick(10)); // remove second striker
    expect(setStartingXI).toHaveBeenCalledTimes(1);
    const committedXi = setStartingXI.mock.calls[0][0] as string[];
    expect(committedXi).not.toContain('st2');
    expect(committedXi).toHaveLength(10);
  });

  it('exposes the formation lines for the active formation', () => {
    const { result } = renderHook(() => useLineupSlots());
    expect(result.current.lines[0]).toEqual(['GK']);
    expect(result.current.starterSlots).toHaveLength(11);
  });
});
