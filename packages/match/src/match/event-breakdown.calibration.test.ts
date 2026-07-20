/**
 * Event-type breakdown — calibration-only, never runs in the normal test suite.
 * Run with: pnpm --filter @fm2k/match test:calibration --reporter=verbose
 * or:       pnpm --filter @fm2k/match exec vitest run --config vitest.calibration.config.ts event-breakdown
 */
import { simulateMatch } from './simulate.ts';
import type { SideInput } from './simulate.ts';
import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: v };
}

const POSITIONS: [PlayerPosition, number][] = [
  ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1],
  ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2],
];

function makeTeam(id: string, ovr: number): Team {
  const squad: Player[] = [];
  POSITIONS.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      squad.push({ id: `${id}-${pos}${i}`, name: `${id} ${pos}${i}`, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(ovr) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad, colors: { primary: '#fff', secondary: '#000' } };
}

function makeSide(id: string, ovr: number): SideInput {
  const team = makeTeam(id, ovr);
  const intent: TeamTacticsIntent = {
    formation: '4-4-2', style: 'balanced',
    sliders: { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 },
  };
  return { team, starters: team.squad, intent };
}

describe('event-type breakdown (calibration only):', () => {
  it('prints per-event-type counts averaged over N matches', () => {
    const N = 200;
    const counts: Record<string, number> = {};
    let totalEvents = 0;

    for (let i = 0; i < N; i++) {
      const result = simulateMatch({ home: makeSide('h', 55), away: makeSide('a', 55), rng: mulberry32(i) });
      for (const e of result.events) {
        counts[e.type] = (counts[e.type] ?? 0) + 1;
        totalEvents++;
      }
    }

    const PASS_TYPES = new Set(['short_pass', 'long_pass', 'through_ball', 'cross', 'back_pass', 'cutback', 'gk_short', 'gk_long']);
    const totalPasses = Array.from(PASS_TYPES).reduce((s, t) => s + (counts[t] ?? 0), 0);

    const perMatch = (n: number) => (n / N).toFixed(1);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);

    // Per-position foul/card distribution
    const foulsByPos: Record<string, number> = {};
    const yellowsByPos: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const result = simulateMatch({ home: makeSide('h', 55), away: makeSide('a', 55), rng: mulberry32(i + N) });
      for (const e of result.events) {
        if (!e.playerId) { continue; }
        const pos = e.playerId.replace(/^[ha]-/, '').replace(/\d+$/, '');
        if (e.type === 'foul') { foulsByPos[pos] = (foulsByPos[pos] ?? 0) + 1; }
        if (e.type === 'yellow_card') { yellowsByPos[pos] = (yellowsByPos[pos] ?? 0) + 1; }
      }
    }

    console.log(`\n${'═'.repeat(52)}`);
    console.log(`  Event breakdown — epm=13, N=${N} matches (55v55)`);
    console.log(`${'═'.repeat(52)}`);
    console.log(`  Total events/match:  ${perMatch(totalEvents)}`);
    console.log(`  Total passes/match:  ${perMatch(totalPasses)}  (all pass types combined)`);
    console.log(`${'─'.repeat(52)}`);
    for (const [type, count] of sorted) {
      const avg = perMatch(count);
      const bar = '█'.repeat(Math.min(30, Math.round(count / N)));
      const tag = PASS_TYPES.has(type) ? ' [pass]' : '';
      console.log(`  ${type.padEnd(22)} ${avg.padStart(6)}/match  ${bar}${tag}`);
    }
    console.log(`${'═'.repeat(52)}`);
    console.log(`  Fouls & yellows by position (both teams, N=${N})`);
    console.log(`${'─'.repeat(52)}`);
    const allPos = new Set([...Object.keys(foulsByPos), ...Object.keys(yellowsByPos)]);
    for (const pos of [...allPos].sort()) {
      const f = ((foulsByPos[pos] ?? 0) / N).toFixed(1);
      const y = ((yellowsByPos[pos] ?? 0) / N).toFixed(1);
      console.log(`  ${pos.padEnd(6)}  fouls ${f.padStart(5)}/match  yellows ${y.padStart(5)}/match`);
    }
    console.log(`${'═'.repeat(52)}\n`);

    // No assertions — this is purely informational
    expect(totalEvents).toBeGreaterThan(0);
  });


});
