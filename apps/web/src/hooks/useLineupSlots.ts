import { useState, useEffect, useRef, useMemo } from 'react';
import type React from 'react';
import { useGameStore } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { ClubPlayer, Formation } from '@fm2k/engine';

export const FORMATION_LINES: Record<Formation, string[][]> = {
  // 4-back
  '4-4-2':   [['GK'], ['LB','CB','CB','RB'], ['LM','CM','CM','RM'],         ['ST','ST']],
  '4-3-3':   [['GK'], ['LB','CB','CB','RB'], ['CM','CM','CM'],               ['LW','ST','RW']],
  '4-5-1':   [['GK'], ['LB','CB','CB','RB'], ['LM','CM','CM','CM','RM'],     ['ST']],
  '4-2-3-1': [['GK'], ['LB','CB','CB','RB'], ['CDM','CDM'], ['CAM','CAM','CAM'], ['ST']],
  '4-1-4-1': [['GK'], ['LB','CB','CB','RB'], ['CDM'], ['LM','CM','CM','RM'], ['ST']],
  '4-4-1-1': [['GK'], ['LB','CB','CB','RB'], ['LM','CM','CM','RM'],         ['CAM'], ['ST']],
  '4-2-4':   [['GK'], ['LB','CB','CB','RB'], ['CDM','CDM'],                 ['LW','ST','ST','RW']],
  // 3-back
  '3-5-2':   [['GK'], ['CB','CB','CB'], ['LM','CM','CM','CM','RM'],          ['ST','ST']],
  '3-4-3':   [['GK'], ['CB','CB','CB'], ['LM','CM','CM','RM'],               ['LW','ST','RW']],
  '3-4-2-1': [['GK'], ['CB','CB','CB'], ['LM','CM','CM','RM'],               ['CAM','CAM'], ['ST']],
  // 5-back
  '5-3-2':   [['GK'], ['LB','CB','CB','CB','RB'], ['CM','CM','CM'],          ['ST','ST']],
  '5-4-1':   [['GK'], ['LB','CB','CB','CB','RB'], ['LM','CM','CM','RM'],     ['ST']],
};

function buildSlotAssignments(
  xiIds: string[],
  benchIds: string[],
  squad: ClubPlayer[],
  formation: Formation,
): (string | null)[] {
  const slots = (FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2']).flat();
  const players = xiIds.map(id => squad.find(p => p.id === id)).filter(Boolean) as ClubPlayer[];
  const result: (string | null)[] = Array(slots.length).fill(null);
  const used = new Set<string>();

  for (let i = 0; i < slots.length; i++) {
    const match = players.find(p => !used.has(p.id) && p.position === slots[i]);
    if (match) { result[i] = match.id; used.add(match.id); }
  }
  const remaining = players.filter(p => !used.has(p.id));
  for (let i = 0; i < result.length; i++) {
    if (!result[i] && remaining.length) { result[i] = remaining.shift()!.id; }
  }

  const bench: (string | null)[] = Array(4).fill(null);
  benchIds.slice(0, 4).forEach((id, i) => { bench[i] = id; });
  return [...result, ...bench];
}

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
