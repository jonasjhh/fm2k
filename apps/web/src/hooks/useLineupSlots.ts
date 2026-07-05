import { useState, useMemo } from 'react';
import type React from 'react';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { FORMATION_LINES, effectiveRole, effectiveDisplayOrder, MAX_BENCH_SIZE } from '@fm2k/engine';
import type { Formation, FormationPosition } from '@fm2k/engine';

/** Bench slots are optional: pad the named subs with empty slots up to the cap. */
function padBench(benchPlayers: string[]): (string | null)[] {
  return [...benchPlayers, ...Array(MAX_BENCH_SIZE).fill(null)].slice(0, MAX_BENCH_SIZE);
}

export function useLineupSlots() {
  const { clubState, setStartingXI, setBench } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    setStartingXI: s.setStartingXI,
    setBench: s.setBench,
  })));

  const formation = (clubState?.formation ?? '4-4-2') as Formation;
  const customSlots = clubState?.customSlots ?? null;
  const emptySlotRoles = clubState?.emptySlotRoles ?? null;
  const lines = useMemo(() => FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2'], [formation]);
  const starterSlots = useMemo(() => lines.flat(), [lines]);

  // `clubState.startingXI` is itself the canonical, slot-ordered, hole-preserving 11-array —
  // no local copy or resync effect needed; deriving directly here means there's nothing left
  // for a stale re-derivation to clobber (the bug this hook used to have).
  const slotAssignments = useMemo(() => [
    ...(clubState?.startingXI ?? Array(11).fill(null)),
    ...padBench(clubState?.benchPlayers ?? []),
  ], [clubState?.startingXI, clubState?.benchPlayers]);

  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const playerSlotMap = useMemo(() => {
    const m = new Map<string, number>();
    slotAssignments.forEach((id, i) => { if (id) {m.set(id, i);} });
    return m;
  }, [slotAssignments]);

  const allSlots = useMemo(() => [
    ...starterSlots.map((templatePos, i) => (
      { pos: effectiveRole(slotAssignments[i], templatePos as FormationPosition, customSlots, emptySlotRoles?.[i]?.role), idx: i, isSub: false }
    )),
    ...Array.from({ length: MAX_BENCH_SIZE }, (_, i) => ({ pos: 'SUB', idx: 11 + i, isSub: true })),
  ], [starterSlots, slotAssignments, customSlots, emptySlotRoles]);

  // Display-only ordering for pills/table rows — derived from customSlots (the live
  // free-positioning geometry) when set, so a player who's been dragged to a new band shows
  // up in the right place in the list, not just under the right label. Never read by
  // handleSlotClick/handlePlayerDrop/commitAssignments below, which keep addressing slots by
  // their original index regardless of display order.
  const displayOrder = useMemo(
    () => effectiveDisplayOrder(slotAssignments, customSlots, formation, emptySlotRoles),
    [slotAssignments, customSlots, formation, emptySlotRoles],
  );

  const commitAssignments = (newAssignments: (string | null)[]) => {
    setStartingXI(newAssignments.slice(0, 11));
    setBench(newAssignments.slice(11).filter(Boolean) as string[]);
  };

  const handleSlotClick = (slotIdx: number) => {
    const next = [...slotAssignments];
    next[slotIdx] = null;
    commitAssignments(next);
  };

  const handleDragEnd = () => {
    setDraggingSlot(null);
    setDropTargetId(null);
  };

  const handlePlayerDragOver = (e: React.DragEvent, playerId: string) => {
    if (draggingSlot === null) {return;}
    e.preventDefault();
    setDropTargetId(playerId);
  };

  const handlePlayerDrop = (e: React.DragEvent, playerId: string) => {
    e.preventDefault();
    if (draggingSlot === null) {return;}
    const next = [...slotAssignments];
    const existing = next.indexOf(playerId);
    if (existing !== -1) {next[existing] = null;}
    next[draggingSlot] = playerId;
    commitAssignments(next);
    setDraggingSlot(null);
    setDropTargetId(null);
  };

  return {
    lines,
    starterSlots,
    allSlots,
    displayOrder,
    slotAssignments,
    playerSlotMap,
    draggingSlot,
    dropTargetId,
    setDraggingSlot,
    commitAssignments,
    handleSlotClick,
    handleDragEnd,
    handlePlayerDragOver,
    handlePlayerDrop,
    setDropTargetId,
  };
}
