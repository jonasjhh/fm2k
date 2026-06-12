import { applyPromotionRelegation } from './promotion.ts';
import type { EditableCountry } from './editable-country.ts';
import type { Team } from '@fm2k/engine';

function team(id: string): Team {
  return {
    id, name: id, formation: '4-4-2', starters: [], substitutes: [],
    colors: { primary: '#fff', secondary: '#000' },
  };
}

/** A division of teams `${id}-1`..`${id}-n`. */
function division(id: string, level: number, n: number) {
  return { id, name: id, level, teams: Array.from({ length: n }, (_, i) => team(`${id}-${i + 1}`)) };
}

function country(): EditableCountry {
  return {
    id: 'england', name: 'England', nationality: 'english',
    divisions: [division('d1', 1, 6), division('d2', 2, 6), division('d3', 3, 6)],
  };
}

function teamIdsIn(c: EditableCountry, divId: string): string[] {
  return c.divisions.find(d => d.id === divId)!.teams.map(t => t.id);
}

describe('applyPromotionRelegation:', () => {
  // standings: best-first; here we just use natural order for the upper part and
  // place the "bottom" teams last.
  const ranked: Record<string, string[]> = {
    d1: ['d1-1', 'd1-2', 'd1-3', 'd1-4', 'd1-5', 'd1-6'],
    d2: ['d2-1', 'd2-2', 'd2-3', 'd2-4', 'd2-5', 'd2-6'],
    d3: ['d3-1', 'd3-2', 'd3-3', 'd3-4', 'd3-5', 'd3-6'],
  };

  it('given a full ladder then bottom-2 of each division swap with top-2 of the one below', () => {
    const [out] = applyPromotionRelegation([country()], ranked);

    // d1: kept its top 4, gained d2's top 2; lost its bottom 2
    expect(teamIdsIn(out, 'd1').sort()).toEqual(
      ['d1-1', 'd1-2', 'd1-3', 'd1-4', 'd2-1', 'd2-2'].sort(),
    );
    // d2: kept middle (3,4) + its own... it lost top 2 (up) and bottom 2 (down), gained d1 bottom 2 + d3 top 2
    expect(teamIdsIn(out, 'd2').sort()).toEqual(
      ['d2-3', 'd2-4', 'd1-5', 'd1-6', 'd3-1', 'd3-2'].sort(),
    );
    // d3: kept its top 4, gained d2's bottom 2; promoted its top 2
    expect(teamIdsIn(out, 'd3').sort()).toEqual(
      ['d3-3', 'd3-4', 'd3-5', 'd3-6', 'd2-5', 'd2-6'].sort(),
    );
  });

  it('given a full ladder then every division keeps its size', () => {
    const [out] = applyPromotionRelegation([country()], ranked);
    expect(out.divisions.map(d => d.teams.length)).toEqual([6, 6, 6]);
  });

  it('given missing standings then the country is returned unchanged', () => {
    const c = country();
    const [out] = applyPromotionRelegation([c], { d1: ranked.d1 }); // d2/d3 absent
    expect(out).toBe(c);
  });
});
