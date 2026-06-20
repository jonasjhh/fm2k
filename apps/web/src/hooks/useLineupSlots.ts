import { useState, useEffect, useRef, useMemo } from 'react';
import type React from 'react';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { FORMATION_LINES, buildSlotAssignments } from '@fm2k/engine';
import type { Formation } from '@fm2k/engine';

export function useLineupSlots() {
  const { clubState, setStartingXI, setBench } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    setStartingXI: s.setStartingXI,
    setBench: s.setBench,
  })));

  const formation = (clubState?.formation ?? '4-4-2') as Formation;
  const xiKey = clubState?.startingXI?.join(',') ?? '';
  const benchKey = clubState?.benchPlayers?.join(',') ?? '';
  const lines = useMemo(() => FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2'], [formation]);
  const starterSlots = useMemo(() => lines.flat(), [lines]);

  const [slotAssignments, setSlotAssignments] = useState<(string | null)[]>(() => {
    if (!clubState) {return Array(15).fill(null);}
    return buildSlotAssignments(clubState.startingXI, clubState.benchPlayers, clubState.squad, formation);
  });
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const ourXiKeyRef = useRef(xiKey);
  const ourBenchKeyRef = useRef(benchKey);
  const ourFormationRef = useRef(formation);

  useEffect(() => {
    const sameXi = xiKey === ourXiKeyRef.current;
    const sameBench = benchKey === ourBenchKeyRef.current;
    const sameFormation = formation === ourFormationRef.current;
    if (sameXi && sameBench && sameFormation) {return;}
    ourXiKeyRef.current = xiKey;
    ourBenchKeyRef.current = benchKey;
    ourFormationRef.current = formation;
    if (!clubState) { setSlotAssignments(Array(15).fill(null)); return; }
    setSlotAssignments(buildSlotAssignments(
      clubState.startingXI, clubState.benchPlayers, clubState.squad, formation,
    ));
  // clubState intentionally omitted — xiKey/benchKey capture the relevant change signals
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xiKey, benchKey, formation]);

  const playerSlotMap = useMemo(() => {
    const m = new Map<string, number>();
    slotAssignments.forEach((id, i) => { if (id) {m.set(id, i);} });
    return m;
  }, [slotAssignments]);

  const allSlots = useMemo(() => [
    ...starterSlots.map((pos, i) => ({ pos, idx: i, isSub: false })),
    ...(['SUB', 'SUB', 'SUB', 'SUB'] as const).map((pos, i) => ({ pos: pos as string, idx: 11 + i, isSub: true })),
  ], [starterSlots]);

  const commitAssignments = (newAssignments: (string | null)[]) => {
    const newXi = newAssignments.slice(0, 11).filter(Boolean) as string[];
    const newBench = newAssignments.slice(11).filter(Boolean) as string[];
    ourXiKeyRef.current = newXi.join(',');
    ourBenchKeyRef.current = newBench.join(',');
    setSlotAssignments(newAssignments);
    setStartingXI(newXi);
    setBench(newBench);
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
