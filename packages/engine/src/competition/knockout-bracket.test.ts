import { drawBracket, recordWinner, roundComplete, roundTieCounts, shuffle } from './knockout-bracket.ts';
import type { Team, Formation } from '../shared/types.ts';
import type { KnockoutFormatConfig } from './competition-types.ts';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function team(id: string): Team {
  return { id, name: id, formation: '4-4-2' as Formation, colors: { primary: '#fff', secondary: '#000' }, starters: [], substitutes: [] };
}

function teamsByLevel(): Map<number, Team[]> {
  return new Map([
    [1, Array.from({ length: 16 }, (_, i) => team(`l1-${i}`))],
    [2, Array.from({ length: 16 }, (_, i) => team(`l2-${i}`))],
    [3, Array.from({ length: 16 }, (_, i) => team(`l3-${i}`))],
  ]);
}

const CFG: KnockoutFormatConfig = {
  kind: 'knockout', byeLevel: 1, preliminaryLevels: [2, 3],
  roundNames: ['Round 1', 'Round 2', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
  byeTeamPlaysAway: true, higherSlotHostsFromRound: 3,
};

describe('roundTieCounts:', () => {
  test('48-team field collapses 16→16→8→4→2→1', () => {
    expect(roundTieCounts(32, 16)).toEqual([16, 16, 8, 4, 2, 1]);
  });
  test('throws when prelim is not double the byes', () => {
    expect(() => roundTieCounts(30, 16)).toThrow();
  });
});

describe('shuffle:', () => {
  test('is a permutation (same multiset)', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffle(input, mulberry32(1));
    expect(out).toHaveLength(20);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
  test('does not mutate the input', () => {
    const input = [1, 2, 3, 4];
    shuffle(input, mulberry32(2));
    expect(input).toEqual([1, 2, 3, 4]);
  });
});

describe('drawBracket:', () => {
  const bracket = drawBracket(CFG, teamsByLevel(), mulberry32(42));

  test('has 47 ties across 6 rounds', () => {
    expect(bracket.slots).toHaveLength(47);
    expect(bracket.rounds).toBe(6);
  });

  test('round 1 pairs exactly the 32 preliminary (level 2 & 3) teams, no duplicates', () => {
    const r1 = bracket.slots.filter(s => s.round === 1);
    expect(r1).toHaveLength(16);
    const ids = r1.flatMap(s => [s.homeTeamId!, s.awayTeamId!]);
    expect(new Set(ids).size).toBe(32);
    expect(ids.every(id => id.startsWith('l2-') || id.startsWith('l3-'))).toBe(true);
  });

  test('round 2 introduces all 16 top-flight teams, each drawn away vs an empty home slot', () => {
    const r2 = bracket.slots.filter(s => s.round === 2);
    expect(r2).toHaveLength(16);
    expect(r2.every(s => s.homeTeamId === null)).toBe(true);
    const byeIds = r2.map(s => s.awayTeamId!);
    expect(new Set(byeIds).size).toBe(16);
    expect(byeIds.every(id => id.startsWith('l1-'))).toBe(true);
  });

  test('round 1 winners feed round 2 home slots 1:1', () => {
    const r1 = bracket.slots.filter(s => s.round === 1);
    r1.forEach((s, i) => {
      expect(s.nextTieId).toBe(`r2-t${i}`);
      expect(s.nextSlot).toBe('home');
    });
  });

  test('from round 3 the lower-indexed feeder hosts', () => {
    const r3 = bracket.slots.filter(s => s.round === 2); // feeders into round 3
    r3.forEach((s, i) => {
      expect(s.nextTieId).toBe(`r3-t${Math.floor(i / 2)}`);
      expect(s.nextSlot).toBe(i % 2 === 0 ? 'home' : 'away');
    });
  });

  test('the final has no onward wiring', () => {
    const final = bracket.slots.find(s => s.round === 6)!;
    expect(final.nextTieId).toBeNull();
    expect(final.nextSlot).toBeNull();
  });

  test('is deterministic for a given rng seed', () => {
    const a = drawBracket(CFG, teamsByLevel(), mulberry32(7));
    const b = drawBracket(CFG, teamsByLevel(), mulberry32(7));
    expect(a.slots.map(s => [s.homeTeamId, s.awayTeamId])).toEqual(b.slots.map(s => [s.homeTeamId, s.awayTeamId]));
  });
});

describe('recordWinner:', () => {
  test('advances a round-1 winner into its round-2 home slot', () => {
    const bracket = drawBracket(CFG, teamsByLevel(), mulberry32(3));
    const r1 = bracket.slots.find(s => s.tieId === 'r1-t0')!;
    const { nextTieId } = recordWinner(bracket, 'r1-t0', r1.homeTeamId!, r1.homeTeamName!);
    expect(nextTieId).toBe('r2-t0');
    const r2 = bracket.slots.find(s => s.tieId === 'r2-t0')!;
    expect(r2.homeTeamId).toBe(r1.homeTeamId);
  });

  test('crowns the champion when the final is recorded', () => {
    const bracket = drawBracket(CFG, teamsByLevel(), mulberry32(3));
    recordWinner(bracket, 'r6-t0', 'l1-0', 'l1-0');
    expect(bracket.championTeamId).toBe('l1-0');
  });

  test('roundComplete is false until every tie in the round has a winner', () => {
    const bracket = drawBracket(CFG, teamsByLevel(), mulberry32(3));
    expect(roundComplete(bracket, 1)).toBe(false);
    for (const s of bracket.slots.filter(s => s.round === 1)) {
      recordWinner(bracket, s.tieId, s.homeTeamId!, s.homeTeamName!);
    }
    expect(roundComplete(bracket, 1)).toBe(true);
  });
});
