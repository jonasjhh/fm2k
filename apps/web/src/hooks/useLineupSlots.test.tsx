import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { ClubPlayer } from '@fm2k/engine';
import { MAX_BENCH_SIZE } from '@fm2k/engine';

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
      speed: 60, strength: 60, passing: 60, finishing: 60,
      technique: 60, defending: 60, stamina: 60,
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

  it('given bench players then they fill the first substitute slots, padded to the bench cap', () => {
    const { result } = renderHook(() => useLineupSlots());
    expect(result.current.slotAssignments.slice(11)).toEqual(['sub1', 'sub2', ...Array(MAX_BENCH_SIZE - 2).fill(null)]);
  });

  it('given a cleared slot then it commits an 11-length array with that slot null, others untouched', () => {
    const { result } = renderHook(() => useLineupSlots());
    act(() => result.current.handleSlotClick(10)); // remove second striker
    expect(setStartingXI).toHaveBeenCalledTimes(1);
    const committedXi = setStartingXI.mock.calls[0][0] as (string | null)[];
    expect(committedXi).toHaveLength(11);
    expect(committedXi[10]).toBeNull();
    expect(committedXi.slice(0, 10)).toEqual(['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1']);
  });

  it('clearing the GK slot does not shift any other slot\'s player (regression)', () => {
    const { result } = renderHook(() => useLineupSlots());
    act(() => result.current.handleSlotClick(0)); // remove the GK
    const committedXi = setStartingXI.mock.calls[0][0] as (string | null)[];
    expect(committedXi[0]).toBeNull();
    expect(committedXi.slice(1)).toEqual(['lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2']);
  });

  it('exposes the formation lines for the active formation', () => {
    const { result } = renderHook(() => useLineupSlots());
    expect(result.current.lines[0]).toEqual(['GK']);
    expect(result.current.starterSlots).toHaveLength(11);
  });

  it('without customSlots, displayOrder matches today\'s slot-index order (delegates to effectiveDisplayOrder)', () => {
    const { result } = renderHook(() => useLineupSlots());
    result.current.slotAssignments.forEach((id, i) => {
      if (id) { expect(result.current.displayOrder.get(id)).toBe(i); }
    });
  });

  it('with a defending-shape entry, a player\'s derived role overrides the template label in allSlots', () => {
    storeState.clubState = {
      ...(storeState.clubState as Record<string, unknown>),
      shapes: { attacking: {}, defending: { cb1: { band: 'ATT', lateral: 0 } } },
    };
    const { result } = renderHook(() => useLineupSlots());
    const cbSlotIdx = result.current.slotAssignments.indexOf('cb1');
    expect(result.current.allSlots[cbSlotIdx].pos).toBe('ST');
  });

  it('an unassigned slot keeps its template label and sorts at its canonical position', () => {
    storeState.clubState = {
      ...(storeState.clubState as Record<string, unknown>),
      startingXI: [SQUAD[0].id, null, ...SQUAD.slice(2, 11).map(p => p.id)], // lb (index 1) unassigned
      shapes: { attacking: {}, defending: {} }, // shapes set (band-aware ordering active)
    };
    const { result } = renderHook(() => useLineupSlots());
    expect(result.current.allSlots[1].pos).toBe('LB');
    const emptySlotRank = result.current.displayOrder.get('__empty-1') as number;
    const lmRank = result.current.displayOrder.get('lm') as number;
    expect(emptySlotRank).toBeLessThan(lmRank); // canonical DEF ranks before MID
  });
});
