import { computeLadderMovements, type LadderDivision } from './promotion.ts';

/** Build a division of `n` teams named `${id}-1`..`${id}-n`, ranked best first. */
function division(id: string, n: number): LadderDivision {
  return { id, rankedTeamIds: Array.from({ length: n }, (_, i) => `${id}-${i + 1}`) };
}

describe('computeLadderMovements:', () => {
  const ladder = [division('d1', 16), division('d2', 16), division('d3', 16)];

  it('given a 3-division ladder and swap 2 then the top division relegates 2 and promotes 0', () => {
    const moves = computeLadderMovements(ladder, 2);
    // bottom two of d1 go down to d2
    expect(moves.get('d1-15')).toBe('d2');
    expect(moves.get('d1-16')).toBe('d2');
    // no d1 team moves up (there is no division above)
    expect([...moves].filter(([, to]) => to === 'd1').map(([id]) => id))
      .toEqual(['d2-1', 'd2-2']);
  });

  it('given the middle division then its top 2 go up and bottom 2 go down', () => {
    const moves = computeLadderMovements(ladder, 2);
    expect(moves.get('d2-1')).toBe('d1');
    expect(moves.get('d2-2')).toBe('d1');
    expect(moves.get('d2-15')).toBe('d3');
    expect(moves.get('d2-16')).toBe('d3');
  });

  it('given the bottom division then its top 2 are promoted and none are relegated', () => {
    const moves = computeLadderMovements(ladder, 2);
    expect(moves.get('d3-1')).toBe('d2');
    expect(moves.get('d3-2')).toBe('d2');
    expect([...moves].filter(([id]) => id.startsWith('d3-') && id !== 'd3-1' && id !== 'd3-2'))
      .toHaveLength(0);
  });

  it('given a symmetric swap then each division keeps its size', () => {
    const moves = computeLadderMovements(ladder, 2);
    for (const div of ladder) {
      const leaving = div.rankedTeamIds.filter(id => moves.has(id) && moves.get(id) !== div.id).length;
      const arriving = [...moves].filter(([, to]) => to === div.id).length;
      expect(arriving).toBe(leaving);
    }
  });

  it('given swapCount 0 then no team moves', () => {
    expect(computeLadderMovements(ladder, 0).size).toBe(0);
  });

  it('given a single division then there are no movements', () => {
    expect(computeLadderMovements([division('only', 16)], 2).size).toBe(0);
  });
});
