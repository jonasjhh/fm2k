import { applyPromotionRelegation } from './promotion.ts';
import { buildWorld, teamsInDivision, type World } from './world.ts';
import type { EditableCountry } from './editable-country.ts';
import type { Team } from '@fm2k/engine';

function team(id: string): Team {
  return {
    id, name: id, formation: '4-4-2', squad: [],
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

function teamIdsIn(world: World, divId: string): string[] {
  return teamsInDivision(world, divId).map(t => t.id);
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
    const world = buildWorld([country()]);
    applyPromotionRelegation(world, ranked);

    // d1: kept its top 4, gained d2's top 2; lost its bottom 2
    expect(teamIdsIn(world, 'd1').sort()).toEqual(
      ['d1-1', 'd1-2', 'd1-3', 'd1-4', 'd2-1', 'd2-2'].sort(),
    );
    // d2: kept middle (3,4) + its own... it lost top 2 (up) and bottom 2 (down), gained d1 bottom 2 + d3 top 2
    expect(teamIdsIn(world, 'd2').sort()).toEqual(
      ['d2-3', 'd2-4', 'd1-5', 'd1-6', 'd3-1', 'd3-2'].sort(),
    );
    // d3: kept its top 4, gained d2's bottom 2; promoted its top 2
    expect(teamIdsIn(world, 'd3').sort()).toEqual(
      ['d3-3', 'd3-4', 'd3-5', 'd3-6', 'd2-5', 'd2-6'].sort(),
    );
  });

  it('given a full ladder then every division keeps its size', () => {
    const world = buildWorld([country()]);
    applyPromotionRelegation(world, ranked);
    expect(['d1', 'd2', 'd3'].map(id => teamIdsIn(world, id).length)).toEqual([6, 6, 6]);
  });

  it('given missing standings then the country is left unchanged', () => {
    const world = buildWorld([country()]);
    applyPromotionRelegation(world, { d1: ranked.d1 }); // d2/d3 absent
    expect(teamIdsIn(world, 'd1').sort()).toEqual(['d1-1', 'd1-2', 'd1-3', 'd1-4', 'd1-5', 'd1-6'].sort());
    expect(teamIdsIn(world, 'd2').sort()).toEqual(['d2-1', 'd2-2', 'd2-3', 'd2-4', 'd2-5', 'd2-6'].sort());
  });

  it('given divisions out of level order then they are sorted by level before laddering', () => {
    const reversed: EditableCountry = {
      ...country(),
      divisions: [division('d3', 3, 6), division('d1', 1, 6), division('d2', 2, 6)],
    };
    const world = buildWorld([reversed]);
    applyPromotionRelegation(world, ranked);
    // Same outcome as the in-order case: only correct level-adjacency produces this.
    expect(teamIdsIn(world, 'd1').sort()).toEqual(
      ['d1-1', 'd1-2', 'd1-3', 'd1-4', 'd2-1', 'd2-2'].sort(),
    );
  });

  it('given a single division then there are no movements and teams are unchanged', () => {
    const single: EditableCountry = {
      id: 'england', name: 'England', nationality: 'english',
      divisions: [division('d1', 1, 6)],
    };
    const world = buildWorld([single]);
    applyPromotionRelegation(world, { d1: ranked.d1 });
    expect(teamIdsIn(world, 'd1')).toEqual(['d1-1', 'd1-2', 'd1-3', 'd1-4', 'd1-5', 'd1-6']);
  });
});
