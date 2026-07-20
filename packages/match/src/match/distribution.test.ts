import { runDistribution, type DistributionInput } from './distribution.ts';
import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: 10 };
}
const F: [PlayerPosition, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];
function team(id: string, v: number): Team {
  const starters: Player[] = [];
  F.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad: starters, colors: { primary: '#fff', secondary: '#000' } };
}
const intent: TeamTacticsIntent = { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 } };
const input: DistributionInput = (() => {
  const home = team('h', 60);
  const away = team('a', 50);
  return { home: { team: home, starters: home.squad, intent }, away: { team: away, starters: away.squad, intent } };
})();

const N = 50;

describe('runDistribution aggregation:', () => {
  const r = runDistribution(input, N, 7);

  it('is deterministic for a fixed seed base', () => {
    expect(runDistribution(input, N, 7)).toEqual(r);
  });

  it('outcome fractions and both histograms account for every match', () => {
    expect(r.n).toBe(N);
    expect(r.homeWinPct + r.drawPct + r.awayWinPct).toBeCloseTo(1);
    const histTotal = Object.values(r.goals.histogram).reduce((s, c) => s + c, 0);
    const marginTotal = Object.values(r.goals.marginHistogram).reduce((s, c) => s + c, 0);
    expect(histTotal).toBe(N);
    expect(marginTotal).toBe(N);
  });

  it('margin histogram agrees with the win/draw/loss split', () => {
    const share = (pred: (margin: number) => boolean) =>
      Object.entries(r.goals.marginHistogram)
        .filter(([m]) => pred(Number(m)))
        .reduce((s, [, c]) => s + c, 0) / N;
    expect(share(m => m > 0)).toBeCloseTo(r.homeWinPct);
    expect(share(m => m === 0)).toBeCloseTo(r.drawPct);
    expect(share(m => m < 0)).toBeCloseTo(r.awayWinPct);
  });

  it('clean-sheet and both-scored fractions partition consistently', () => {
    for (const p of [r.cleanSheetHomePct, r.cleanSheetAwayPct, r.bothScoredPct]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    // A match either has at least one clean sheet or both teams scored (0-0 counts twice
    // on the clean-sheet side), so the three fractions must cover everything.
    expect(r.cleanSheetHomePct + r.cleanSheetAwayPct + r.bothScoredPct).toBeGreaterThanOrEqual(1);
  });

  it('reports per-match duels won for both sides, favouring the stronger side overall', () => {
    const sum = (t: Record<string, number>) => Object.values(t).reduce((s, x) => s + x, 0);
    expect(sum(r.duelsWonHome)).toBeGreaterThan(0);
    expect(sum(r.duelsWonAway)).toBeGreaterThan(0);
    expect(sum(r.duelsWonHome)).toBeGreaterThan(sum(r.duelsWonAway));
  });

  it('event-derived rates are finite non-negative per-match means', () => {
    for (const rate of [r.longThrowsPerMatch, r.lastManFoulsPerMatch, r.penaltiesPerMatch]) {
      expect(Number.isFinite(rate)).toBe(true);
      expect(rate).toBeGreaterThanOrEqual(0);
    }
  });
});
