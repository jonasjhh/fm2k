import {
  FORMATION_LINES, buildSlotAssignments, canonicalGeometry, deriveCustomFieldedPositions,
  seedGeometryFromFormation, effectiveFormationLabel, effectiveRole, effectiveDisplayOrder, emptySlotKey,
} from './lineup.ts';
import type { PlayerPosition, Player, PlayerGeometry } from '../shared/types.ts';

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
    '4-2-3-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['AM', 'AM', 'AM'], ['ST']],
    '4-1-4-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
    '4-4-1-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['AM'], ['ST']],
    '4-2-4':   [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['LW', 'ST', 'ST', 'RW']],
    '3-5-2':   [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
    '3-4-3':   [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['LW', 'ST', 'RW']],
    '3-4-2-1': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['AM', 'AM'], ['ST']],
    '5-3-2':   [['GK'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['CM', 'CM', 'CM'], ['ST', 'ST']],
    '5-4-1':   [['GK'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
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

describe('canonicalGeometry:', () => {
  it('excludes the GK slot and covers exactly the 10 outfield slots', () => {
    expect(canonicalGeometry('4-4-2')).toHaveLength(10);
  });

  it('matches each slot\'s role and band to FORMATION_LINES/BAND_OF_ROLE', () => {
    const geo = canonicalGeometry('4-2-3-1');
    // ['LB','CB','CB','RB'], ['DM','DM'], ['AM','AM','AM'], ['ST']
    expect(geo.map(g => g.role)).toEqual(['LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'AM', 'AM', 'AM', 'ST']);
    expect(geo.map(g => g.band)).toEqual(['DEF', 'DEF', 'DEF', 'DEF', 'DM', 'DM', 'AM', 'AM', 'AM', 'ATT']);
  });

  it('evenly spaces a row from -1 (left) to 1 (right), centering a lone slot at 0', () => {
    const geo = canonicalGeometry('4-4-2');
    const defLine = geo.filter(g => g.band === 'DEF');
    expect(defLine.map(g => g.lateral)).toEqual([-1, -1 / 3, 1 / 3, 1]);
    const attLine = geo.filter(g => g.band === 'ATT');
    expect(attLine.map(g => g.lateral)).toEqual([-1, 1]); // two STs, no center slot
    const fiveBack = canonicalGeometry('3-5-2').filter(g => g.band === 'DEF');
    expect(fiveBack.map(g => g.lateral)).toEqual([-1, 0, 1]); // 3 CBs: lone center one is 0
  });

  it('falls back to 4-4-2 for an unknown formation, same as FORMATION_LINES', () => {
    expect(canonicalGeometry('weird' as never)).toEqual(canonicalGeometry('4-4-2'));
  });
});

describe('deriveCustomFieldedPositions:', () => {
  it('maps each player to their chosen role for FieldedPositions', () => {
    const geometry: Record<string, PlayerGeometry> = {
      lb: { band: 'DEF', lateral: -1, role: 'LWB' }, // a full-back pushed into a wing-back role
      cm: { band: 'MID', lateral: 0, role: 'CM' },
    };
    const { fieldedPositions } = deriveCustomFieldedPositions(geometry);
    expect(fieldedPositions).toEqual({ lb: 'LWB', cm: 'CM' });
  });

  it('derives line from band (not role) and flank from lateral, independently', () => {
    // A CB role dragged into the ATT band/right flank behaves as an ATT-line, right-flank
    // player for zone-weighting — geometry wins over what the role label would imply.
    const geometry: Record<string, PlayerGeometry> = {
      cb: { band: 'ATT', lateral: 0.8, role: 'CB' },
      lm: { band: 'MID', lateral: -0.1, role: 'LM' }, // near-center lateral buckets to 'center'
    };
    const { fieldedGeometry } = deriveCustomFieldedPositions(geometry);
    expect(fieldedGeometry.cb).toEqual({ line: 'ATT', flank: 'right' });
    expect(fieldedGeometry.lm).toEqual({ line: 'MID', flank: 'center' });
  });
});

describe('seedGeometryFromFormation:', () => {
  it('keys the canonical geometry by player id, skipping the GK at slot 0', () => {
    const startingXI = ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'];
    const seeded = seedGeometryFromFormation('4-4-2', startingXI);
    expect(Object.keys(seeded)).toHaveLength(10);
    expect(seeded.gk).toBeUndefined();
    expect(seeded.lb).toEqual({ band: 'DEF', lateral: -1, role: 'LB' });
  });
});

describe('effectiveFormationLabel:', () => {
  const startingXI = ['gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'];

  it('returns the formation as-is when there is no custom layout', () => {
    expect(effectiveFormationLabel('4-4-2', startingXI, null)).toBe('4-4-2');
  });

  it('still recognises the formation when customSlots happens to match it exactly', () => {
    const customSlots = seedGeometryFromFormation('4-4-2', startingXI);
    expect(effectiveFormationLabel('4-4-2', startingXI, customSlots)).toBe('4-4-2');
  });

  it('returns "custom" once a player has moved off every predefined template', () => {
    const customSlots = seedGeometryFromFormation('4-4-2', startingXI);
    customSlots.lb = { band: 'ATT', lateral: 1, role: 'LB' };
    expect(effectiveFormationLabel('4-4-2', startingXI, customSlots)).toBe('custom');
  });
});

describe('effectiveRole:', () => {
  it('falls back to the template role when customSlots is null', () => {
    expect(effectiveRole('lb', 'LB', null)).toBe('LB');
  });

  it('falls back to the template role when the player has no customSlots entry', () => {
    const customSlots: Record<string, PlayerGeometry> = { cb1: { band: 'DEF', lateral: 0, role: 'CB' } };
    expect(effectiveRole('lb', 'LB', customSlots)).toBe('LB');
  });

  it('falls back to the template role for an empty slot (null playerId)', () => {
    const customSlots: Record<string, PlayerGeometry> = { lb: { band: 'ATT', lateral: 0, role: 'ST' } };
    expect(effectiveRole(null, 'LB', customSlots)).toBe('LB');
  });

  it('prefers the customSlots override over the template role', () => {
    const customSlots: Record<string, PlayerGeometry> = { lb: { band: 'ATT', lateral: 0, role: 'ST' } };
    expect(effectiveRole('lb', 'LB', customSlots)).toBe('ST');
  });

  it('prefers the emptySlotRole over the template role for an empty slot (null playerId)', () => {
    expect(effectiveRole(null, 'LB', null, 'LWB')).toBe('LWB');
  });

  it('falls back to the template role for an empty slot when emptySlotRole is omitted', () => {
    expect(effectiveRole(null, 'LB', null)).toBe('LB');
  });

  it('ignores emptySlotRole for an occupied slot — customSlots/template resolution is unaffected', () => {
    const customSlots: Record<string, PlayerGeometry> = { lb: { band: 'ATT', lateral: 0, role: 'ST' } };
    expect(effectiveRole('lb', 'LB', customSlots, 'LWB')).toBe('ST');
  });
});

describe('effectiveDisplayOrder:', () => {
  const slotAssignments = [
    'gk', 'lb', 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2',
    'b1', 'b2', null, null,
  ];

  it('falls back to slot-index order when customSlots is null', () => {
    const order = effectiveDisplayOrder(slotAssignments, null, '4-4-2', null);
    expect(order.get('gk')).toBe(0);
    expect(order.get('lb')).toBe(1);
    expect(order.get('st1')).toBe(9);
    expect(order.get('b1')).toBe(11);
    expect(order.get('b2')).toBe(12);
  });

  it('ranks a player moved into a new band by band order, ahead of their old band-mates', () => {
    const customSlots = seedGeometryFromFormation('4-4-2', slotAssignments.slice(0, 11) as string[]);
    customSlots.cb1 = { band: 'ATT', lateral: 0, role: 'ST' }; // a CB pushed forward into attack
    const order = effectiveDisplayOrder(slotAssignments, customSlots, '4-4-2', null);

    expect(order.get('gk')).toBe(0); // GK always first
    // Remaining DEF band-mates (lb, cb2, rb) still rank ahead of MID, which ranks ahead of the
    // promoted cb1 (now ATT) and the original strikers.
    const def = ['lb', 'cb2', 'rb'].map(id => order.get(id) as number);
    const mid = ['lm', 'cm1', 'cm2', 'rm'].map(id => order.get(id) as number);
    const att = ['cb1', 'st1', 'st2'].map(id => order.get(id) as number);
    expect(Math.max(...def)).toBeLessThan(Math.min(...mid));
    expect(Math.max(...mid)).toBeLessThan(Math.min(...att));
  });

  it('keeps the bench in its original order, ranked after every starter', () => {
    const customSlots = seedGeometryFromFormation('4-4-2', slotAssignments.slice(0, 11) as string[]);
    const order = effectiveDisplayOrder(slotAssignments, customSlots, '4-4-2', null);
    const starterRanks = slotAssignments.slice(0, 11).map(id => order.get(id as string) as number);
    expect(order.get('b1')).toBe(11);
    expect(order.get('b2')).toBe(12);
    expect(Math.max(...starterRanks)).toBeLessThan(order.get('b1') as number);
  });

  it('ranks an empty slot with no captured geometry at its canonical band position', () => {
    const noLb = [...slotAssignments]; noLb[1] = null; // lb unassigned, nothing customized
    const customSlots = seedGeometryFromFormation('4-4-2', noLb.slice(0, 11) as (string | null)[]);
    const order = effectiveDisplayOrder(noLb, customSlots, '4-4-2', null);
    // The empty LB slot (canonical DEF) still ranks among the DEF band-mates, ahead of MID.
    const emptySlotRank = order.get(emptySlotKey(1)) as number;
    const mid = ['lm', 'cm1', 'cm2', 'rm'].map(id => order.get(id) as number);
    expect(emptySlotRank).toBeLessThan(Math.min(...mid));
  });

  it('ranks an empty slot with a captured custom-band geometry among that band\'s members, not its template band (the reported bug)', () => {
    const noLb = [...slotAssignments]; noLb[1] = null; // lb has been unassigned
    const customSlots = seedGeometryFromFormation('4-4-2', slotAssignments.slice(0, 11) as string[]);
    delete customSlots.lb; // their slot's geometry is now only in emptySlotRoles
    const emptySlotRoles = { 1: { band: 'ATT' as const, lateral: 0, role: 'ST' as const } }; // captured: lb had moved to ATT
    const order = effectiveDisplayOrder(noLb, customSlots, '4-4-2', emptySlotRoles);

    const emptySlotRank = order.get(emptySlotKey(1)) as number;
    const mid = ['lm', 'cm1', 'cm2', 'rm'].map(id => order.get(id) as number);
    expect(Math.max(...mid)).toBeLessThan(emptySlotRank); // ranks after MID, not among it
    // Captured lateral 0 sits between st1 (-1) and st2 (1) within the ATT band.
    expect(order.get('st1') as number).toBeLessThan(emptySlotRank);
    expect(emptySlotRank).toBeLessThan(order.get('st2') as number);
  });
});
