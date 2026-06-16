import type { Formation, Player } from '../shared/types.ts';

/** Pitch slots (by position) for each formation, ordered back-to-front. */
export const FORMATION_LINES: Record<Formation, string[][]> = {
  // 4-back
  '4-4-2':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'],          ['ST', 'ST']],
  '4-3-3':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CM', 'CM', 'CM'],                ['LW', 'ST', 'RW']],
  '4-5-1':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'CM', 'RM'],    ['ST']],
  '4-2-3-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CDM'], ['CAM', 'CAM', 'CAM'], ['ST']],
  '4-1-4-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
  '4-4-1-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'],          ['CAM'], ['ST']],
  '4-2-4':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CDM'],                    ['LW', 'ST', 'ST', 'RW']],
  // 3-back
  '3-5-2':   [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'CM', 'RM'],          ['ST', 'ST']],
  '3-4-3':   [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'],                ['LW', 'ST', 'RW']],
  '3-4-2-1': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'],                ['CAM', 'CAM'], ['ST']],
  // 5-back
  '5-3-2':   [['GK'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['CM', 'CM', 'CM'],          ['ST', 'ST']],
  '5-4-1':   [['GK'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'],    ['ST']],
};

/**
 * Assign players to the 11 formation slots (by matching position first, then
 * filling leftover slots with remaining players) plus 4 bench slots.
 * Returns a 15-length array of player ids (or null for empty slots).
 */
export function buildSlotAssignments(
  xiIds: string[],
  benchIds: string[],
  squad: readonly Player[],
  formation: Formation,
): (string | null)[] {
  const slots = (FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2']).flat();
  const players = xiIds.map(id => squad.find(p => p.id === id)).filter(Boolean) as Player[];
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
