import { FORMATION_LINES, buildSlotAssignments } from './lineup.ts';
import type { Position } from '../shared/types.ts';
import type { ClubPlayer } from '../club/club-types.ts';

function player(id: string, position: Position): ClubPlayer {
  return {
    id, name: id, nationality: 'n', age: 25, position, potential: 70,
    attributes: {
      speed: 60, strength: 60, agility: 60, passing: 60, finishing: 60,
      technique: 60, defending: 60, stamina: 60, awareness: 60, composure: 60,
    },
    fitness: 100,
  } as ClubPlayer;
}

const XI: ClubPlayer[] = [
  player('gk', 'GK'),
  player('lb', 'LB'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'),
  player('lm', 'LM'), player('cm1', 'CM'), player('cm2', 'CM'), player('rm', 'RM'),
  player('st1', 'ST'), player('st2', 'ST'),
];

describe('FORMATION_LINES:', () => {
  it('every formation starts with a keeper and totals 11 outfield slots', () => {
    for (const [formation, lines] of Object.entries(FORMATION_LINES)) {
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
});
