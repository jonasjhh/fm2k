import { describe, it, expect } from 'vitest';
import { createMatchLog } from './match-log.ts';
import { SITUATION_TARGETS } from './situation-targets.ts';
import type { Formation, Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import type { Band } from '../lineup/bands.ts';
import type { Situation } from './duel/flow.ts';

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

// 4-4-1-1: covers GK, WDEF, DEF, WMID, MID, AM, ATT
// 4-1-2-3: covers GK, WDEF, DEF, DM, MID, WATT, ATT
// DM/AM are FormationPosition only — players use CM as their card position
type Slot = [PlayerPosition, number];
const HOME_FORMATION: Slot[] = [
  ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1],
  ['LM', 1], ['CM', 3], ['RM', 1],  // last CM plays AM slot
  ['ST', 1],
];
const AWAY_FORMATION: Slot[] = [
  ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1],
  ['CM', 3],             // first CM plays DM slot
  ['LW', 1], ['ST', 1], ['RW', 1],
];

function makeTeam(id: string, v: number, formation: Slot[], formationName: Formation): Team {
  const squad: Player[] = [];
  formation.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      squad.push({ id: `${id}-${pos}${i}`, name: `${id} ${pos}${i}`, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v) });
    }
  });
  return { id, name: id, formation: formationName, squad, colors: { primary: '#fff', secondary: '#000' } };
}

const N_MATCHES = 1000;

describe('situation distribution — calibration gates:', () => {
  it('each band chooses situations at the target frequency (±tol) over 1 000 matches', () => {
    // Aggregate tick counts per band × situation
    const counts: Record<Band, Record<string, number>> = {
      GK: {}, DEF: {}, WDEF: {}, DM: {}, MID: {}, WMID: {}, AM: {}, ATT: {}, WATT: {},
    };
    const totals: Record<Band, number> = { GK: 0, DEF: 0, WDEF: 0, DM: 0, MID: 0, WMID: 0, AM: 0, ATT: 0, WATT: 0 };

    for (let seed = 0; seed < N_MATCHES; seed++) {
      const home = makeTeam('h', 60, HOME_FORMATION, '4-4-1-1');
      const away = makeTeam('a', 60, AWAY_FORMATION, '4-1-2-3');
      const log = createMatchLog({
        matchDuration: 90,
        eventsPerMinute: 13,
        homeTeam: home,
        awayTeam: away,
        homeStarters: home.squad,
        awayStarters: away.squad,
        rng: mulberry32(seed * 7 + 1337),
      });

      for (const frame of log) {
        for (const tick of frame.ticks) {
          if (!tick.situation || !tick.carrierBand) { continue; }
          const band = tick.carrierBand;
          const sit = tick.situation as string;
          counts[band][sit] = (counts[band][sit] ?? 0) + 1;
          totals[band]++;
        }
      }
    }

    // Print summary table
    const allSits = Array.from(new Set(Object.values(counts).flatMap(c => Object.keys(c)))).sort();
    const bands = Object.keys(counts) as Band[];
    const header = ['band', ...allSits].map(s => s.padEnd(18)).join('');
    console.log('\n' + header);
    console.log('-'.repeat(header.length));
    for (const band of bands) {
      const total = totals[band];
      if (total === 0) { continue; }
      const row = [band, ...allSits.map(sit => {
        const pct = ((counts[band][sit] ?? 0) / total * 100).toFixed(1) + '%';
        const target = (SITUATION_TARGETS[band] as Record<string, { pct: number }>)[sit];
        return target ? pct + ` (${(target.pct * 100).toFixed(0)}%)` : pct;
      })].map(s => s.padEnd(18)).join('');
      console.log(row);
    }
    console.log('');

    // Verify each target
    for (const [band, targets] of Object.entries(SITUATION_TARGETS) as [Band, typeof SITUATION_TARGETS[Band]][]) {
      const total = totals[band];
      if (total === 0) { continue; }
      for (const [sit, target] of Object.entries(targets) as [Situation, { pct: number; tol: number }][]) {
        const actual = (counts[band][sit] ?? 0) / total;
        expect(actual, `${band}.${sit}: expected ~${(target.pct * 100).toFixed(0)}%, got ${(actual * 100).toFixed(1)}%`,
        ).toBeGreaterThan(target.pct - target.tol);
        expect(actual, `${band}.${sit}: expected ~${(target.pct * 100).toFixed(0)}%, got ${(actual * 100).toFixed(1)}%`,
        ).toBeLessThan(target.pct + target.tol);
      }
    }
  });
});
