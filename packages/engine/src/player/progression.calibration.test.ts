import { trainOnMatch, developOverSeason, type RegimentId } from './progression.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';

/**
 * Career-development distribution simulation — the **black-box** picture of how players grow
 * over a career. Heavy and gated (run via `pnpm --filter @fm2k/engine test:calibration`); it is
 * the deliberate target of tuning, not a fast unit gate. Use it to re-tune the constants in
 * `progression.ts` (potential/age/facility factors, ceiling, bases) and read the printed table.
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const attrsOf = (v: number): PlayerAttributes => ({
  speed: v, strength: v, agility: v, passing: v, finishing: v,
  technique: v, defending: v, stamina: v, awareness: v, composure: v,
});
const avg = (a: PlayerAttributes) => Object.values(a).reduce((s, v) => s + v, 0) / 10;
const total = (a: PlayerAttributes) => Object.values(a).reduce((s, v) => s + v, 0);

/** Maps the old flat 1–4 facility level onto the new (growthBonus, ceilingBonus) axes —
 *  an exact equivalence (see progression.ts), so the old calibration gates still apply. */
function bonusesFor(level: number): { growthBonus: number; ceilingBonus: number } {
  return [{ growthBonus: 0, ceilingBonus: 0 }, { growthBonus: 0.1, ceilingBonus: 6 },
    { growthBonus: 0.2, ceilingBonus: 11 }, { growthBonus: 0.3, ceilingBonus: 15 }][level - 1];
}

interface Scenario {
  startAge: number;
  potential: number;
  startAttr: number;
  regiment: RegimentId;
  facility: number;
  seasons: number;
  matchesPerSeason?: number;
}

interface CareerOutcome {
  finalAvg: number;
  finalAttrs: PlayerAttributes;
  matchShare: number; // fraction of (positive) growth from per-match training
}

function simulateCareer(s: Scenario, rng: () => number): CareerOutcome {
  const matches = s.matchesPerSeason ?? 34;
  let p: Player = {
    id: 'p', name: 'P', nationality: 'n', age: s.startAge, position: 'ST',
    potential: s.potential, attributes: attrsOf(s.startAttr),
  };
  const { growthBonus, ceilingBonus } = bonusesFor(s.facility);
  let matchGain = 0, seasonGain = 0;
  for (let y = 0; y < s.seasons; y++) {
    for (let m = 0; m < matches; m++) {
      const before = total(p.attributes);
      p = { ...p, attributes: trainOnMatch(p, s.regiment, growthBonus, ceilingBonus, rng) };
      matchGain += total(p.attributes) - before;
    }
    const before = total(p.attributes);
    const dev = developOverSeason(p, s.regiment, growthBonus, ceilingBonus, rng);
    p = { ...p, attributes: dev.attributes, age: dev.age };
    seasonGain += total(p.attributes) - before;
  }
  const grossUp = matchGain + Math.max(0, seasonGain);
  return { finalAvg: avg(p.attributes), finalAttrs: p.attributes, matchShare: grossUp > 0 ? matchGain / grossUp : 0 };
}

interface Aggregate {
  meanAvg: number;
  meanFinishing: number;
  pctFinishing90: number;  // share of careers reaching a world-class focus attribute (≥90)
  meanMatchShare: number;
}

function runScenario(s: Scenario, n = 200, seedBase = 1): Aggregate {
  let sumAvg = 0, sumFin = 0, fin90 = 0, sumMatch = 0;
  for (let i = 0; i < n; i++) {
    const o = simulateCareer(s, mulberry32(seedBase + i * 7919));
    sumAvg += o.finalAvg;
    sumFin += o.finalAttrs.finishing;
    if (o.finalAttrs.finishing >= 90) { fin90++; }
    sumMatch += o.matchShare;
  }
  return { meanAvg: sumAvg / n, meanFinishing: sumFin / n, pctFinishing90: fin90 / n, meanMatchShare: sumMatch / n };
}

const N = 200;
const youngFocus = (potential: number, facility: number): Scenario =>
  ({ startAge: 17, potential, startAttr: 42, regiment: 'finishing', facility, seasons: 13 });

describe('progression calibration (career distributions):', () => {
  it('prints the career distribution table', () => {
    const rows: [string, Aggregate][] = [
      ['pot95 L4 finishing-focus', runScenario(youngFocus(95, 4), N)],
      ['pot95 L1 finishing-focus', runScenario(youngFocus(95, 1), N)],
      ['pot80 L4 finishing-focus', runScenario(youngFocus(80, 4), N)],
      ['pot70 L4 finishing-focus', runScenario(youngFocus(70, 4), N)],
      ['pot95 L4 balanced', runScenario({ startAge: 17, potential: 95, startAttr: 42, regiment: 'balanced', facility: 4, seasons: 13 }, N)],
      ['pot60 L2 balanced', runScenario({ startAge: 20, potential: 60, startAttr: 45, regiment: 'balanced', facility: 2, seasons: 10 }, N)],
      ['pot40 L3 balanced', runScenario({ startAge: 18, potential: 40, startAttr: 45, regiment: 'balanced', facility: 3, seasons: 12 }, N)],
      ['old33 pot55 L2 physical', runScenario({ startAge: 33, potential: 55, startAttr: 70, regiment: 'physical', facility: 2, seasons: 6 }, N)],
    ];
    console.log('\n  scenario                    | finalAvg | meanFin | %fin≥90 | match%');
    for (const [label, a] of rows) {
      console.log(`  ${label.padEnd(27)} |   ${a.meanAvg.toFixed(1).padStart(4)}   |  ${a.meanFinishing.toFixed(1).padStart(4)}  |  ${(a.pctFinishing90 * 100).toFixed(0).padStart(3)}%  |  ${(a.meanMatchShare * 100).toFixed(0)}%`);
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── gates (the intended behaviour, locked) ───────────────────────────────────

  it('a focused world-class prospect (pot95, L4) masters its specialty', () => {
    const a = runScenario(youngFocus(95, 4), N);
    expect(a.meanFinishing).toBeGreaterThanOrEqual(88); // a focused elite prospect becomes elite at its craft
  });

  it('a max-potential player at world-class facilities can grow into a world-class all-rounder', () => {
    // The intended ceiling: top potential + L4 + a full career lifts every attribute high
    // (low → high across the board). Lower potential or worse facilities fall short (see below).
    const a = runScenario({ startAge: 17, potential: 95, startAttr: 42, regiment: 'balanced', facility: 4, seasons: 13 }, N);
    expect(a.meanAvg).toBeGreaterThan(82);
  });

  it('poor facilities (L1) gate the ceiling — even a 95-potential prospect rarely peaks', () => {
    const a = runScenario(youngFocus(95, 1), N);
    expect(a.pctFinishing90).toBeLessThan(0.1);
  });

  it('a modest-potential player (pot70, L4, focus) almost never reaches world class', () => {
    const a = runScenario(youngFocus(70, 4), N);
    expect(a.pctFinishing90).toBeLessThan(0.1);
  });

  it('a low-potential player barely develops over a career', () => {
    const a = runScenario({ startAge: 18, potential: 40, startAttr: 45, regiment: 'balanced', facility: 3, seasons: 12 }, N);
    expect(a.meanAvg).toBeLessThan(50); // started 45 → essentially flat
  });

  it('most player development comes from season-end, the minority from matches (~10–25%)', () => {
    const a = runScenario(youngFocus(95, 4), N);
    expect(a.meanMatchShare).toBeGreaterThan(0.05);
    expect(a.meanMatchShare).toBeLessThan(0.35);
  });

  it('an old player erodes over several seasons', () => {
    const a = runScenario({ startAge: 33, potential: 55, startAttr: 70, regiment: 'physical', facility: 2, seasons: 6 }, N);
    expect(a.meanAvg).toBeLessThan(70); // started at 70 → net decline
  });
});
