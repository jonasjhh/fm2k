import { FORMATION_LINES, buildSlotAssignments } from './lineup.ts';
import type { PlayerPosition, Player } from '../shared/types.ts';

function player(id: string, position: PlayerPosition): Player {
  return {
    id, name: id, nationality: 'n', age: 25, position, potential: 70,
    attributes: {
      speed: 60, strength: 60, agility: 60, passing: 60, finishing: 60,
      technique: 60, defending: 60, stamina: 60, awareness: 60, composure: 60,
    },
  };
}

const XI: Player[] = [
  player('gk', 'GK'),
  player('lb', 'LB'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'),
  player('lm', 'LM'), player('cm1', 'CM'), player('cm2', 'CM'), player('rm', 'RM'),
  player('st1', 'ST'), player('st2', 'ST'),
];

describe('FORMATION_LINES:', () => {
  // Pins every formation's exact pitch layout. The shapes drive match simulation,
  // so each slot position matters — a single wrong or blank slot must fail here.
  const EXPECTED: Record<string, string[][]> = {
    '4-4-2':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
    '4-3-3':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CM', 'CM', 'CM'], ['LW', 'ST', 'RW']],
    '4-5-1':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'CM', 'RM'], ['ST']],
    '4-2-3-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CDM'], ['CAM', 'CAM', 'CAM'], ['ST']],
    '4-1-4-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
    '4-4-1-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['CAM'], ['ST']],
    '4-2-4':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CDM'], ['LW', 'ST', 'ST', 'RW']],
    '3-5-2':   [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
    '3-4-3':   [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['LW', 'ST', 'RW']],
    '3-4-2-1': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['CAM', 'CAM'], ['ST']],
    '5-3-2':   [['GK'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['CM', 'CM', 'CM'], ['ST', 'ST']],
    '5-4-1':   [['GK'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
  };

  it('defines the exact pitch layout for every formation', () => {
    expect(FORMATION_LINES).toEqual(EXPECTED);
  });

  it('every formation starts with a keeper and totals 11 outfield slots', () => {
    for (const lines of Object.values(FORMATION_LINES)) {
      expect(lines[0]).toEqual(['GK']);
      expect(lines.flat()).toHaveLength(11);
    }
  });
});

describe('buildSlotAssignments:', () => {
  it('given a matching XI then each player fills the slot of its own position', () => {
    const result = buildSlotAssignments(XI.map(p => p.id), [], XI, '4-4-2');
    expect(result.slice(0, 11)).toEqual(
      ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'],
    );
  });

  it('returns 15 slots (11 starters + 4 bench) and places bench ids', () => {
    const result = buildSlotAssignments(XI.map(p => p.id), ['b1', 'b2'], XI, '4-4-2');
    expect(result).toHaveLength(15);
    expect(result.slice(11)).toEqual(['b1', 'b2', null, null]);
  });

  it('given a leftover player with no matching slot then it fills an empty slot', () => {
    const squad = [...XI.slice(0, 10), player('extra', 'GK')]; // two keepers, one striker missing
    const result = buildSlotAssignments(squad.map(p => p.id), [], squad, '4-4-2');
    const starters = result.slice(0, 11).filter(Boolean);
    expect(starters).toHaveLength(11);
    expect(starters).toContain('extra');
  });

  it('falls back to 4-4-2 shape for an unknown formation', () => {
    const result = buildSlotAssignments(XI.map(p => p.id), [], XI, 'weird' as never);
    expect(result.slice(0, 11).filter(Boolean)).toHaveLength(11);
  });

  it('matches players to position slots regardless of XI order', () => {
    const scrambled = [...XI].reverse();
    const slots = FORMATION_LINES['4-4-2'].flat();
    const positionById = Object.fromEntries(XI.map(p => [p.id, p.position]));

    const result = buildSlotAssignments(scrambled.map(p => p.id), [], scrambled, '4-4-2');

    result.slice(0, 11).forEach((id, i) => {
      expect(positionById[id as string]).toBe(slots[i]); // each slot holds its own position
    });
  });

  it('ignores extra starters beyond the available slots', () => {
    const extra = [...XI, player('x1', 'ST'), player('x2', 'CM')]; // 13 players, 11 slots
    const result = buildSlotAssignments(extra.map(p => p.id), [], extra, '4-4-2');
    expect(result).toHaveLength(15);
  });

  it('caps the bench at four ids', () => {
    const result = buildSlotAssignments(XI.map(p => p.id), ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], XI, '4-4-2');
    expect(result).toHaveLength(15);
    expect(result.slice(11)).toEqual(['b1', 'b2', 'b3', 'b4']);
  });
});
