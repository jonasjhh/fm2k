import { runDistribution, type DistributionInput } from './distribution.ts';
import type { Player, PlayerAttributes, Position, Team } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, agility: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, awareness: v, composure: v };
}
const F: [Position, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];
function team(id: string, v: number): Team {
  const starters: Player[] = [];
  F.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v) });
    }
  });
  return { id, name: id, formation: '4-4-2', starters, substitutes: [], colors: { primary: '#fff', secondary: '#000' } };
}
const intent: TeamTacticsIntent = { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50 } };
const matchup = (hv: number, av: number): DistributionInput => ({
  home: { team: team('h', hv), intent }, away: { team: team('a', av), intent },
});

const N = 400;

/**
 * Black-box calibration gates: run many seeded matches and assert the outcome
 * distribution sits in a realistic-football band. These are the target the
 * white-box rebalance tunes toward.
 */
describe('match distribution — calibration gates:', () => {
  const even = [matchup(35, 35), matchup(55, 55), matchup(75, 75)];

  it('even matches score a realistic number of goals at every tier', () => {
    for (const m of even) {
      const r = runDistribution(m, N, 1);
      expect(r.goals.totalMean).toBeGreaterThan(2.0);
      expect(r.goals.totalMean).toBeLessThan(3.2);
    }
  });

  it('even matches are not draw-dominated', () => {
    const r = runDistribution(matchup(55, 55), N, 1);
    expect(r.drawPct).toBeLessThan(0.38);
  });

  it('a clear quality gap is usually decisive; a big gap nearly always is', () => {
    expect(runDistribution(matchup(65, 45), N, 1).homeWinPct).toBeGreaterThan(0.72);
    const big = runDistribution(matchup(75, 25), N, 1);
    expect(big.homeWinPct).toBeGreaterThan(0.93);
    expect(big.goals.homeMean).toBeGreaterThan(big.goals.awayMean * 2.5);
  });

  it('discipline & set pieces sit at sane, roughly tier-flat per-match rates', () => {
    for (const m of even) {
      const r = runDistribution(m, N, 1);
      expect(r.foulsPerMatch).toBeGreaterThan(2);  // deliberately moderate (not a free-kick fest)
      expect(r.foulsPerMatch).toBeLessThan(20);
      expect(r.penaltiesPerMatch).toBeLessThan(0.45);
      expect(r.redsPerMatch).toBeLessThan(0.18);
      expect(r.cornersPerMatch).toBeGreaterThan(6);
      expect(r.injuriesPerMatch).toBeLessThan(0.6);
    }
  });
});
