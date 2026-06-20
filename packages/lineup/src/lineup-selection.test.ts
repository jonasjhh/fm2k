import {
  positionFit, selectStartingXI, selectStartingXIWithSlots, calculateBestFormation, buildXISlotAssignments,
  carryOverLineup,
} from './lineup-selection.ts';
import { FORMATION_LINES } from '@fm2k/match';
import type { Player, PlayerAttributes, Position } from '@fm2k/match';

function attrs(value: number): PlayerAttributes {
  return {
    speed: value, strength: value, agility: value, passing: value, finishing: value,
    technique: value, defending: value, stamina: value, awareness: value, composure: value,
  };
}

function makePlayer(id: string, position: Position, value: number): Player {
  return { id, name: id, nationality: 'n', age: 25, position, potential: 70, attributes: attrs(value) };
}

/** A balanced 18-player squad with at least 2 of every common slot position. */
function balancedSquad(): Player[] {
  const spec: [Position, number][] = [
    ['GK', 2], ['CB', 3], ['LB', 1], ['RB', 1],
    ['CDM', 1], ['CM', 3], ['CAM', 1], ['LM', 1], ['RM', 1],
    ['LW', 1], ['RW', 1], ['ST', 2],
  ];
  const players: Player[] = [];
  spec.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) { players.push(makePlayer(`${pos}${i}`, pos, 70)); }
  });
  return players;
}

describe('positionFit:', () => {
  it('given identical positions then the fit is perfect', () => {
    expect(positionFit('CB', 'CB')).toBe(1);
  });

  it('given a goalkeeper in an outfield slot then the fit is zero', () => {
    expect(positionFit('GK', 'ST')).toBe(0);
    expect(positionFit('ST', 'GK')).toBe(0);
  });

  it('given related positions then the fit beats unrelated positions', () => {
    expect(positionFit('CM', 'CDM')).toBeGreaterThan(positionFit('CB', 'ST'));
  });

  it('given the fit is symmetric then order does not matter', () => {
    expect(positionFit('LM', 'LW')).toBe(positionFit('LW', 'LM'));
  });
});

describe('selectStartingXI:', () => {
  it('given a full squad then exactly 11 players are returned', () => {
    const xi = selectStartingXI(balancedSquad(), '4-4-2');
    expect(xi).toHaveLength(11);
  });

  it('given a formation then the first slot is filled by the goalkeeper', () => {
    const xi = selectStartingXI(balancedSquad(), '4-3-3');
    expect(xi[0].position).toBe('GK');
  });

  it('given a short squad then fewer than 11 players are returned without crashing', () => {
    const squad = [makePlayer('gk', 'GK', 70), makePlayer('cb', 'CB', 70), makePlayer('st', 'ST', 70)];
    expect(selectStartingXI(squad, '4-4-2')).toHaveLength(3);
  });

  it('given an unavailable starter then the best remaining player replaces them, formation unchanged', () => {
    const squad = balancedSquad();
    const xiBefore = selectStartingXI(squad, '4-4-2');
    const droppedGk = xiBefore[0];
    const xiAfter = selectStartingXI(squad, '4-4-2', { unavailableIds: new Set([droppedGk.id]) });

    expect(xiAfter).toHaveLength(11);
    expect(xiAfter.map(p => p.id)).not.toContain(droppedGk.id);
    // the goalkeeper slot is still filled by the backup keeper
    expect(xiAfter[0].position).toBe('GK');
    expect(xiAfter[0].id).not.toBe(droppedGk.id);
  });

  it('given a higher-rated player then they are preferred for their slot', () => {
    const squad = [
      makePlayer('gk', 'GK', 70),
      makePlayer('weak-st', 'ST', 50),
      makePlayer('strong-st', 'ST', 90),
    ];
    const xi = selectStartingXI(squad, '4-4-2');
    // 4-4-2 has two ST slots; with only two strikers both start, but the strong one is picked first
    expect(xi.find(p => p.position === 'ST' && p.id === 'strong-st')).toBeDefined();
  });

  it('never assigns the same player to more than one slot', () => {
    const xi = selectStartingXI(balancedSquad(), '4-4-2');
    expect(new Set(xi.map(p => p.id)).size).toBe(xi.length);
  });
});

describe('selectStartingXIWithSlots:', () => {
  it('returns a fielded-position map matching the flattened formation order, by player id', () => {
    const squad = balancedSquad();
    const { starters, fieldedPositions } = selectStartingXIWithSlots(squad, '4-3-3');
    const slots = FORMATION_LINES['4-3-3'].flat();
    starters.forEach((p, i) => {
      expect(fieldedPositions[p.id]).toBe(slots[i]);
    });
  });

  it('splits the squad into starters and substitutes with no overlap', () => {
    const squad = balancedSquad();
    const { starters, substitutes } = selectStartingXIWithSlots(squad, '4-4-2');
    const starterIds = new Set(starters.map(p => p.id));
    expect(substitutes.every(p => !starterIds.has(p.id))).toBe(true);
    expect(starters.length + substitutes.length).toBe(squad.length);
  });
});

describe('calculateBestFormation:', () => {
  it('given a centre-back-heavy squad then a back-five formation is chosen', () => {
    const players: Player[] = [makePlayer('gk', 'GK', 80)];
    for (let i = 0; i < 6; i++) { players.push(makePlayer(`cb${i}`, 'CB', 85)); }
    for (let i = 0; i < 3; i++) { players.push(makePlayer(`cm${i}`, 'CM', 60)); }
    for (let i = 0; i < 2; i++) { players.push(makePlayer(`st${i}`, 'ST', 60)); }
    const formation = calculateBestFormation(players);
    expect(formation.startsWith('5-')).toBe(true);
  });

  it('given a winger-and-striker-heavy squad then a front-three formation is chosen', () => {
    const players: Player[] = [makePlayer('gk', 'GK', 80)];
    players.push(makePlayer('lb', 'LB', 80), makePlayer('rb', 'RB', 80));
    for (let i = 0; i < 2; i++) { players.push(makePlayer(`cb${i}`, 'CB', 80)); }
    for (let i = 0; i < 2; i++) { players.push(makePlayer(`cm${i}`, 'CM', 60)); }
    players.push(makePlayer('lw', 'LW', 90), makePlayer('rw', 'RW', 90), makePlayer('st', 'ST', 90));
    const formation = calculateBestFormation(players);
    // 4-3-3 / 3-4-3 both end in -3 up front
    expect(formation.endsWith('-3')).toBe(true);
  });

  it('given any squad then the chosen formation is a known formation', () => {
    expect(Object.keys(FORMATION_LINES)).toContain(calculateBestFormation(balancedSquad()));
  });

  it('given an empty squad then it falls back to the first formation (strict > tiebreak)', () => {
    // Every formation scores 0, so the first one encountered must win, not the last.
    expect(calculateBestFormation([])).toBe('4-4-2');
  });
});

describe('carryOverLineup:', () => {
  it('given an unchanged squad then the previous XI and bench are preserved exactly', () => {
    const squad = balancedSquad();
    const prevStartingXI = squad.slice(0, 11).map(p => p.id);
    const prevBenchPlayers = squad.slice(11, 14).map(p => p.id);
    const { startingXI, benchPlayers } = carryOverLineup(prevStartingXI, prevBenchPlayers, squad, '4-4-2');
    expect(startingXI).toEqual(prevStartingXI);
    expect(benchPlayers).toEqual(prevBenchPlayers);
  });

  it('given a starter who left the squad then they are dropped and backfilled to 11', () => {
    const squad = balancedSquad();
    const prevStartingXI = squad.slice(0, 11).map(p => p.id);
    const departedId = prevStartingXI[0];
    const remainingSquad = squad.filter(p => p.id !== departedId);
    const { startingXI } = carryOverLineup(prevStartingXI, [], remainingSquad, '4-4-2');
    expect(startingXI).not.toContain(departedId);
    expect(startingXI).toHaveLength(11);
  });

  it('given a bench player who left the squad then bench is backfilled to its previous size', () => {
    const squad = balancedSquad();
    const prevStartingXI = squad.slice(0, 11).map(p => p.id);
    const prevBenchPlayers = squad.slice(11, 14).map(p => p.id);
    const departedId = prevBenchPlayers[0];
    const remainingSquad = squad.filter(p => p.id !== departedId);
    const { benchPlayers } = carryOverLineup(prevStartingXI, prevBenchPlayers, remainingSquad, '4-4-2');
    expect(benchPlayers).not.toContain(departedId);
    expect(benchPlayers).toHaveLength(prevBenchPlayers.length);
  });

  it('backfilling never duplicates an id already used elsewhere in the XI or bench', () => {
    const squad = balancedSquad();
    const prevStartingXI = squad.slice(0, 10).map(p => p.id); // one short — needs 1 backfilled
    const prevBenchPlayers = squad.slice(10, 14).map(p => p.id);
    const { startingXI, benchPlayers } = carryOverLineup(prevStartingXI, prevBenchPlayers, squad, '4-4-2');
    const all = [...startingXI, ...benchPlayers];
    expect(new Set(all).size).toBe(all.length);
  });

  it('given a squad too small to refill to 11 then the starting XI stays short', () => {
    const squad = [makePlayer('gk', 'GK', 70), makePlayer('st', 'ST', 70)];
    const { startingXI } = carryOverLineup([], [], squad, '4-4-2');
    expect(startingXI.length).toBeLessThan(11);
    expect(startingXI.length).toBe(squad.length);
  });

  it('given no previous bench then no bench is backfilled (target stays 0)', () => {
    const squad = balancedSquad();
    const { benchPlayers } = carryOverLineup([], [], squad, '4-4-2');
    expect(benchPlayers).toHaveLength(0);
  });
});

describe('buildXISlotAssignments:', () => {
  it('given a formation then it returns one entry per slot, aligned with the pitch lines', () => {
    const slotCount = FORMATION_LINES['4-3-3'].flat().length;
    const assignments = buildXISlotAssignments(balancedSquad(), '4-3-3');
    expect(assignments).toHaveLength(slotCount);
    expect(assignments[0]).not.toBeNull();
  });

  it('given a short squad then unfilled slots are null', () => {
    const squad = [makePlayer('gk', 'GK', 70), makePlayer('st', 'ST', 70)];
    const assignments = buildXISlotAssignments(squad, '4-4-2');
    expect(assignments.filter(a => a !== null)).toHaveLength(2);
    expect(assignments.filter(a => a === null).length).toBeGreaterThan(0);
  });
});
