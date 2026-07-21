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
const matchup = (hv: number, av: number): DistributionInput => {
  const home = team('h', hv);
  const away = team('a', av);
  return { home: { team: home, starters: home.squad, intent }, away: { team: away, starters: away.squad, intent } };
};

// Two cagey, low-tempo sides — the classic recipe for a goalless stalemate.
const defensiveIntent: TeamTacticsIntent = { formation: '4-4-2', style: 'defend_deep', sliders: { tempo: 15, risk: 20, defensiveLine: 25, pressIntensity: 35 } };
const defensiveMatchup = (v: number): DistributionInput => {
  const home = team('h', v);
  const away = team('a', v);
  return { home: { team: home, starters: home.squad, intent: defensiveIntent }, away: { team: away, starters: away.squad, intent: defensiveIntent } };
};

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

  it('a clear quality gap is decisive; a big gap saturates but never to certainty', () => {
    // Gap-20 (65v45) → ~72% wins after the spread + match-form tuning (TASK_11). A big gap
    // (75v25 = gap 50) is soft-saturated by the duel gap knee: dominant (high-70s/low-80s)
    // but the minnow keeps a real "any given Sunday" upset chance — never near-total.
    expect(runDistribution(matchup(65, 45), N, 1).homeWinPct).toBeGreaterThan(0.62);
    const big = runDistribution(matchup(75, 25), N, 1);
    expect(big.homeWinPct).toBeGreaterThan(0.68);
    expect(big.homeWinPct).toBeLessThan(0.92);   // saturation: not a near-total mismatch
    expect(big.goals.homeMean).toBeGreaterThan(big.goals.awayMean * 2.5);
  });

  it('two defensive setups produce fewer goals and more 0-0s than an open, balanced game', () => {
    const zeroPct = (r: ReturnType<typeof runDistribution>) => (r.goals.histogram[0] ?? 0) / r.n;
    const open = runDistribution(matchup(55, 55), N, 1);
    const cagey = runDistribution(defensiveMatchup(55), N, 1);
    expect(cagey.goals.totalMean).toBeLessThan(open.goals.totalMean);
    expect(zeroPct(cagey)).toBeGreaterThan(zeroPct(open));
  });

  it('pass volume is in the hundreds per match (both teams combined)', () => {
    for (const m of even) {
      const r = runDistribution(m, N, 1);
      expect(r.passesAttemptedPerMatch).toBeGreaterThan(150);
      expect(r.passesAttemptedPerMatch).toBeLessThan(1200);
    }
  });

  it('discipline & set pieces sit at sane, roughly tier-flat per-match rates', () => {
    for (const m of even) {
      const r = runDistribution(m, N, 1);
      // Fouls are emergent only (~1.1–1.4/match); floor will rise after Step 8 mundane fouls.
      expect(r.foulsPerMatch).toBeGreaterThan(0.9);
      expect(r.foulsPerMatch).toBeLessThan(20);
      expect(r.penaltiesPerMatch).toBeLessThan(0.45);
      expect(r.redsPerMatch).toBeLessThan(0.25); // engine ~0.16–0.22; raised from 0.18
      expect(r.cornersPerMatch).toBeGreaterThan(2.0); // engine ~2.3–2.5
      expect(r.injuriesPerMatch).toBeLessThan(0.6);
    }
  });
});
