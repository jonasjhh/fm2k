/**
 * Norway divisions calibration — calibration-only, never runs in normal test suite.
 * Simulates 1 000 matchups per division (D1 vs D1, D2 vs D2, D3 vs D3) using real
 * Norwegian team/player data, then prints a BALANCE.md-style summary table.
 *
 * Run with:
 *   mise exec -- pnpm --filter @fm2k/match test:calibration norway-divisions
 */
import { describe, it, expect } from 'vitest';
import { simulateMatch } from './simulate.ts';
import type { SideInput } from './simulate.ts';
import type { Player, PlayerPosition, Team } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';
import rawTeams from '../../../engine/src/data/norway/teams.json';
import rawPlayers from '../../../engine/src/data/norway/players.json';

// ── RNG ──────────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Data adapters ─────────────────────────────────────────────────────────────
const POS_MAP: Record<string, PlayerPosition> = {
  GK: 'GK', CB: 'CB', LB: 'LB', RB: 'RB',
  CM: 'CM', LM: 'LM', RM: 'RM', LW: 'LW', RW: 'RW', ST: 'ST',
};

interface RawPlayer {
  id: string; name: string; clubId: string; nationality: string; age: number;
  pos: string; pot: number;
  attr: { spd: number; str: number; sta: number; pas: number; tec: number; fin: number; def: number; kee: number };
}

function toPlayer(r: RawPlayer): Player {
  return {
    id: r.id, name: r.name, nationality: r.nationality, age: r.age,
    position: POS_MAP[r.pos] ?? 'CM',
    potential: r.pot,
    attributes: {
      speed: r.attr.spd, strength: r.attr.str, stamina: r.attr.sta,
      passing: r.attr.pas, technique: r.attr.tec, finishing: r.attr.fin,
      defending: r.attr.def, goalkeeping: r.attr.kee,
    },
  };
}

// Build team map and players-by-club
const playersByClub: Record<string, Player[]> = {};
for (const r of rawPlayers as RawPlayer[]) {
  (playersByClub[r.clubId] ??= []).push(toPlayer(r));
}
const allPlayers = Object.values(playersByClub).flat();

interface RawTeam { id: string; name: string; divisionId: string; primaryColor: string; secondaryColor: string }

const teamsByDiv: Record<string, RawTeam[]> = {};
for (const t of rawTeams as RawTeam[]) {
  (teamsByDiv[t.divisionId] ??= []).push(t);
}

// ── XI selection: best 11 by position needs ──────────────────────────────────
const FORMATION_NEEDS: PlayerPosition[] = ['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'];

function pickXI(players: Player[]): Player[] {
  const used = new Set<string>();
  const xi: Player[] = [];
  const byPos: Record<string, Player[]> = {};
  for (const p of players) {
    (byPos[p.position] ??= []).push(p);
  }
  // Sort each position by overall (avg attrs desc)
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => {
      const ovr = (p: Player) => Object.values(p.attributes).reduce((s, v) => s + v, 0);
      return ovr(b) - ovr(a);
    });
  }
  // Fill slots greedily
  for (const slot of FORMATION_NEEDS) {
    const candidates = (byPos[slot] ?? []).filter(p => !used.has(p.id));
    if (candidates.length > 0) {
      xi.push(candidates[0]);
      used.add(candidates[0].id);
    } else {
      // Fallback: any unused player
      const fallback = players.find(p => !used.has(p.id));
      if (fallback) { xi.push(fallback); used.add(fallback.id); }
    }
  }
  return xi.slice(0, 11);
}

function makeSide(raw: RawTeam): SideInput {
  const players = playersByClub[raw.id] ?? [];
  const team: Team = {
    id: raw.id, name: raw.name, formation: '4-4-2', squad: players,
    colors: { primary: raw.primaryColor, secondary: raw.secondaryColor },
  };
  const intent: TeamTacticsIntent = {
    formation: '4-4-2', style: 'balanced',
    sliders: { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 },
  };
  return { team, starters: pickXI(players), intent };
}

// ── Stat accumulator ──────────────────────────────────────────────────────────
interface Acc {
  goals: number; shots: number; shotsOnTarget: number;
  corners: number; fouls: number; penalties: number;
  yellows: number; reds: number; injuries: number;
  crosses: number; throughBalls: number; longBalls: number;
  shortPasses: number; dribbles: number; backPasses: number;
  homeWins: number; draws: number; awayWins: number; n: number;
}

function emptyAcc(): Acc {
  return { goals:0, shots:0, shotsOnTarget:0, corners:0, fouls:0, penalties:0,
           yellows:0, reds:0, injuries:0, crosses:0, throughBalls:0, longBalls:0,
           shortPasses:0, dribbles:0, backPasses:0, homeWins:0, draws:0, awayWins:0, n:0 };
}

function accumulate(acc: Acc, result: ReturnType<typeof simulateMatch>) {
  const s = result.statistics;
  const ev = result.events;
  acc.goals       += result.score.home + result.score.away;
  acc.shots       += s.shots.home + s.shots.away;
  acc.shotsOnTarget += s.shotsOnTarget.home + s.shotsOnTarget.away;
  acc.corners     += s.corners.home + s.corners.away;
  acc.fouls       += s.fouls.home + s.fouls.away;
  acc.injuries    += (result.playerUpdates.home.filter(u => u.injury).length +
                      result.playerUpdates.away.filter(u => u.injury).length);
  for (const e of ev) {
    if (e.type === 'yellow_card')  { acc.yellows++; }
    if (e.type === 'red_card')     { acc.reds++; }
    if (e.type === 'penalty')      { acc.penalties++; }
    if (e.type === 'cross')        { acc.crosses++; }
    if (e.type === 'through_ball') { acc.throughBalls++; }
    if (e.type === 'long_pass' || e.type === 'gk_long') { acc.longBalls++; }
    if (e.type === 'short_pass' || e.type === 'gk_short') { acc.shortPasses++; }
    if (e.type === 'dribble')      { acc.dribbles++; }
    if (e.type === 'back_pass')    { acc.backPasses++; }
  }
  if (result.score.home > result.score.away)      { acc.homeWins++; }
  else if (result.score.home === result.score.away) { acc.draws++; }
  else                                              { acc.awayWins++; }
  acc.n++;
}

function pct(n: number, total: number) { return total ? ((n / total) * 100).toFixed(0) + '%' : '-'; }
function avg(n: number, total: number) { return total ? (n / total).toFixed(2) : '-'; }

function printDiv(label: string, acc: Acc) {
  const n = acc.n;
  console.log(`\n  ── ${label} (n=${n}) ${'─'.repeat(44 - label.length)}`);
  console.log(`  Goals/match:        ${avg(acc.goals, n)}  (home ${pct(acc.homeWins, n)} / draw ${pct(acc.draws, n)} / away ${pct(acc.awayWins, n)})`);
  console.log(`  Shots/match:        ${avg(acc.shots, n)}  (on target: ${avg(acc.shotsOnTarget, n)})`);
  console.log(`  Corners/match:      ${avg(acc.corners, n)}`);
  console.log(`  Fouls/match:        ${avg(acc.fouls, n)}`);
  console.log(`  Penalties/match:    ${avg(acc.penalties, n)}`);
  console.log(`  Yellows/match:      ${avg(acc.yellows, n)}`);
  console.log(`  Reds/match:         ${avg(acc.reds, n)}`);
  console.log(`  Injuries/match:     ${avg(acc.injuries, n)}`);
  console.log(`  Short passes/match: ${avg(acc.shortPasses, n)}`);
  console.log(`  Through balls/match:${avg(acc.throughBalls, n)}`);
  console.log(`  Long balls/match:   ${avg(acc.longBalls, n)}`);
  console.log(`  Crosses/match:      ${avg(acc.crosses, n)}`);
  console.log(`  Dribbles/match:     ${avg(acc.dribbles, n)}`);
  console.log(`  Back passes/match:  ${avg(acc.backPasses, n)}`);
}

// ── Test ──────────────────────────────────────────────────────────────────────
const N = 1000;
const DIVS: [string, string][] = [['D1', 'nor-d1'], ['D2', 'nor-d2'], ['D3', 'nor-d3']];

describe('Norway divisions — calibration report:', () => {
  it(`simulates ${N} matchups per division and prints a stats summary`, () => {
    const rng0 = mulberry32(42);

    console.log(`\n${'═'.repeat(52)}`);
    console.log(`  Norway division calibration — ${N} matchups each`);
    console.log(`${'═'.repeat(52)}`);

    for (const [label, divId] of DIVS) {
      const teams = teamsByDiv[divId] ?? [];
      expect(teams.length).toBeGreaterThan(1);

      const acc = emptyAcc();
      const sides = teams.map(makeSide);

      for (let i = 0; i < N; i++) {
        // Pick two different teams at random
        const hi = Math.floor(rng0() * sides.length);
        let ai = Math.floor(rng0() * (sides.length - 1));
        if (ai >= hi) {ai++;}
        const result = simulateMatch({
          home: sides[hi],
          away: sides[ai],
          rng: mulberry32(i * 31 + sides.length),
        });
        accumulate(acc, result);
      }

      printDiv(label, acc);
    }

    console.log(`\n${'═'.repeat(52)}\n`);
    console.log('  Reference targets (from BALANCE.md):');
    console.log('  Goals/match:     2.5 – 3.1');
    console.log('  Penalties/match: < 0.45');
    console.log('  Yellows/match:   0.47 – 0.73');
    console.log('  Reds/match:      < 0.10');
    console.log('  Corners/match:   6 – 9');
    console.log('  Injuries/match:  < 0.45');
    console.log(`${'═'.repeat(52)}\n`);

    expect(true).toBe(true);
  });
});
