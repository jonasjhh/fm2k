/**
 * Calibration report harness (rework Step 6a) — runs a deterministic matchup matrix
 * through the v2 duel engine and writes one markdown report to the repo root:
 *
 *   pnpm --filter @fm2k/engine calibration-report   →  CALIBRATION_REPORT.md
 *
 * Sections: synthetic tiers (even + gapped), real regenerated squads per division,
 * tactics sweeps, a full league season per division, and a multi-season churn drift
 * run. All seeds are fixed, so a re-run on unchanged code reproduces the report
 * byte-for-byte — tune a knob, re-run, and diff.
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  runDistribution, mulberry32, simulateMatch, getTeamOVR, defaultIntent,
  TACTICAL_STYLE_IDS,
  type Team, type Player, type PlayerAttributes, type PlayerPosition,
  type TeamTacticsIntent, type DistributionInput, type DistributionResult,
  type SideInput, type TacticalStyleId,
} from '@fm2k/match';
import { selectStartingXI } from '@fm2k/lineup';
import { COUNTRY_DATA, COUNTRY_IDS } from '../src/data/teams-data.ts';
import { getAllDivisions } from '../src/data/country-data.ts';
import {
  churnSquad, churnFreeAgents, runAiMarket, academyBiasForLevel, facilityForLevel, trainingBonusesForLevel, generatorYouthFactory,
  type OverflowSpec,
} from '../src/world/world-churn.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_PATH = join(REPO_ROOT, 'CALIBRATION_REPORT.md');

// ── matchup builders ──────────────────────────────────────────────────────────

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, keeping: 10 };
}

const F442: [PlayerPosition, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];

function syntheticTeam(id: string, v: number): Team {
  const starters: Player[] = [];
  F442.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      const a = pos === 'GK' ? { ...attrs(v), keeping: v } : attrs(v);
      starters.push({ id: `${id}-${pos}${i}`, name: id, nationality: 'n', age: 25, position: pos, potential: 70, attributes: a });
    }
  });
  return { id, name: id, formation: '4-4-2', squad: starters, colors: { primary: '#fff', secondary: '#000' } };
}

const neutralIntent = (): TeamTacticsIntent => defaultIntent('4-4-2');

function syntheticSide(id: string, v: number, intent: TeamTacticsIntent = neutralIntent()): SideInput {
  const team = syntheticTeam(id, v);
  return { team, starters: team.squad, intent };
}

function realSide(team: Team): SideInput {
  const starters = selectStartingXI(team.squad, team.formation);
  return { team, starters, intent: defaultIntent(team.formation) };
}

// ── formatting helpers ────────────────────────────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

function marginLine(hist: Record<number, number>, n: number): string {
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  return keys.map(k => `${k > 0 ? '+' : ''}${k}:${pct((hist[k] ?? 0) / n)}`).join(' ');
}

function duelLine(r: DistributionResult): string {
  const t = (['speed', 'strength', 'dribble', 'pass', 'shot'] as const)
    .map(k => `${k} ${f1(r.duelsWonHome[k])}–${f1(r.duelsWonAway[k])}`);
  return t.join(', ');
}

const DIST_HEADER = '| Matchup | W/D/L | Goals (h–a) | Total | CS h/a | BTS | Shots (h–a) | SOT | Poss | Fouls | Pens | Reds | Corners |';
const DIST_ALIGN = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';

function distRow(label: string, r: DistributionResult): string {
  return `| ${label} | ${pct(r.homeWinPct)}/${pct(r.drawPct)}/${pct(r.awayWinPct)}`
    + ` | ${f2(r.goals.homeMean)}–${f2(r.goals.awayMean)} | ${f2(r.goals.totalMean)}`
    + ` | ${pct(r.cleanSheetHomePct)}/${pct(r.cleanSheetAwayPct)} | ${pct(r.bothScoredPct)}`
    + ` | ${f1(r.shotsHome)}–${f1(r.shotsAway)} | ${f1(r.shotsOnTargetHome)}–${f1(r.shotsOnTargetAway)}`
    + ` | ${pct(r.possessionHome / 100)} | ${f1(r.foulsPerMatch)} | ${f2(r.penaltiesPerMatch)}`
    + ` | ${f2(r.redsPerMatch)} | ${f1(r.cornersPerMatch)} |`;
}

function distDetail(label: string, r: DistributionResult): string {
  return `- **${label}** — margins: ${marginLine(r.goals.marginHistogram, r.n)}; duels won (h–a): ${duelLine(r)};`
    + ` long throws ${f2(r.longThrowsPerMatch)}/m, last-man fouls ${f2(r.lastManFoulsPerMatch)}/m,`
    + ` injuries ${f2(r.injuriesPerMatch)}/m, end energy ${f1(r.endEnergyHome)}/${f1(r.endEnergyAway)}`;
}

// Every cell gets its own fixed seed block so adding/removing cells never reshuffles others.
let seedBlock = 0;
function nextSeedBase(): number {
  seedBlock += 1;
  return seedBlock * 1_000_000 + 1;
}

function runCell(input: DistributionInput, n: number): DistributionResult {
  return runDistribution(input, n, nextSeedBase());
}

// ── section 1+2: synthetic tiers ──────────────────────────────────────────────

function syntheticSection(lines: string[]): void {
  const N = 300;
  lines.push('## 1. Synthetic tiers — even matches', '');
  lines.push(`Identical flat-attribute 4-4-2 teams (keeping = OVR for the GK), balanced style, neutral sliders. N=${N} per cell.`, '');
  lines.push(DIST_HEADER, DIST_ALIGN);
  const details: string[] = [];
  for (const v of [25, 40, 55, 70, 85]) {
    const r = runCell({ home: syntheticSide('h', v), away: syntheticSide('a', v) }, N);
    lines.push(distRow(`${v} v ${v}`, r));
    details.push(distDetail(`${v} v ${v}`, r));
  }
  lines.push('', ...details, '');

  lines.push('## 2. Synthetic tiers — quality gaps', '');
  lines.push(`Home is the stronger side. N=${N} per cell.`, '');
  lines.push(DIST_HEADER, DIST_ALIGN);
  const gapDetails: string[] = [];
  for (const gap of [10, 20, 30]) {
    const hv = 55 + gap / 2, av = 55 - gap / 2;
    const r = runCell({ home: syntheticSide('h', hv), away: syntheticSide('a', av) }, N);
    lines.push(distRow(`${hv} v ${av} (gap ${gap})`, r));
    gapDetails.push(distDetail(`${hv} v ${av}`, r));
  }
  lines.push('', ...gapDetails, '');
}

// ── section 3: real regenerated squads ────────────────────────────────────────

function realSquadSection(lines: string[]): void {
  const N = 100;
  lines.push('## 3. Real squads — regenerated world in play', '');
  lines.push('Best XI per team (auto-picked formation), balanced style. Strongest-vs-weakest and the two mid-table',
    `neighbours per division. Bracketed numbers are starting-XI OVR. N=${N} per cell.`, '');
  for (const countryId of COUNTRY_IDS) {
    const data = COUNTRY_DATA[countryId];
    lines.push(`### ${data.country}`, '');
    lines.push(DIST_HEADER, DIST_ALIGN);
    for (const div of getAllDivisions(data)) {
      const rated = div.teams
        .map(t => ({ t, ovr: getTeamOVR(selectStartingXI(t.squad, t.formation)) }))
        .sort((a, b) => b.ovr - a.ovr);
      const strongest = rated[0], weakest = rated[rated.length - 1];
      const midA = rated[Math.floor(rated.length / 2) - 1], midB = rated[Math.floor(rated.length / 2)];
      const extremes = runCell({ home: realSide(strongest.t), away: realSide(weakest.t) }, N);
      const adjacent = runCell({ home: realSide(midA.t), away: realSide(midB.t) }, N);
      lines.push(distRow(`D${div.level} ${strongest.t.name} [${strongest.ovr}] v ${weakest.t.name} [${weakest.ovr}]`, extremes));
      lines.push(distRow(`D${div.level} ${midA.t.name} [${midA.ovr}] v ${midB.t.name} [${midB.ovr}]`, adjacent));
    }
    lines.push('');
  }
}

// ── section 4: tactics sweeps ─────────────────────────────────────────────────

function tacticsSection(lines: string[]): void {
  const N = 300;
  const baseline = () => syntheticSide('base', 55);
  lines.push('## 4. Tactics sweeps — style/slider vs a balanced 55', '');
  lines.push(`Home runs the listed tactic, away is always balanced/neutral at the same OVR 55. N=${N} per cell.`, '');
  lines.push(DIST_HEADER, DIST_ALIGN);
  const details: string[] = [];
  for (const style of TACTICAL_STYLE_IDS.filter((s): s is TacticalStyleId => s !== 'balanced')) {
    const intent: TeamTacticsIntent = { ...neutralIntent(), style };
    const r = runCell({ home: syntheticSide('h', 55, intent), away: baseline() }, N);
    lines.push(distRow(`style: ${style}`, r));
    details.push(distDetail(`style: ${style}`, r));
  }
  for (const slider of ['tempo', 'risk', 'defensiveLine'] as const) {
    for (const value of [10, 90]) {
      const intent = neutralIntent();
      intent.sliders[slider] = value;
      const r = runCell({ home: syntheticSide('h', 55, intent), away: baseline() }, N);
      lines.push(distRow(`slider: ${slider}=${value}`, r));
      details.push(distDetail(`slider: ${slider}=${value}`, r));
    }
  }
  lines.push('', ...details, '');
}

// ── section 5: full league seasons (Norway) ──────────────────────────────────

interface TableRow { team: Team; ovr: number; pts: number; w: number; d: number; l: number; gf: number; ga: number }

function seasonSection(lines: string[]): void {
  const data = COUNTRY_DATA.norway;
  lines.push('## 5. League seasons — Norway, one double round-robin per division', '');
  lines.push('Every match seeded and simulated with best XIs and balanced tactics (no fatigue carryover, no transfers —',
    'pure engine table). Real fixture asymmetry: each pairing plays home and away.', '');
  for (const div of getAllDivisions(data)) {
    const sides = new Map(div.teams.map(t => [t.id, realSide(t)]));
    const rows = new Map<string, TableRow>(div.teams.map(t => [t.id, {
      team: t, ovr: getTeamOVR(sides.get(t.id)!.starters), pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0,
    }]));
    const scorers = new Map<string, { name: string; team: string; goals: number }>();
    const seedBase = nextSeedBase();
    let matchIdx = 0, totalGoals = 0, matches = 0;

    for (const home of div.teams) {
      for (const away of div.teams) {
        if (home.id === away.id) { continue; }
        const r = simulateMatch({ home: sides.get(home.id)!, away: sides.get(away.id)!, rng: mulberry32(seedBase + matchIdx++) });
        const H = rows.get(home.id)!, A = rows.get(away.id)!;
        const { home: hg, away: ag } = r.score;
        H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
        totalGoals += hg + ag; matches++;
        if (hg > ag) { H.pts += 3; H.w++; A.l++; } else if (ag > hg) { A.pts += 3; A.w++; H.l++; } else { H.pts++; A.pts++; H.d++; A.d++; }
        for (const e of r.events) {
          if (e.type !== 'goal' || !e.playerId) { continue; }
          const side = e.team === 'home' ? sides.get(home.id)! : sides.get(away.id)!;
          const p = side.starters.find(s => s.id === e.playerId);
          if (!p) { continue; }
          const s = scorers.get(p.id) ?? { name: p.name, team: side.team.name, goals: 0 };
          s.goals++;
          scorers.set(p.id, s);
        }
      }
    }

    const table = [...rows.values()].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    lines.push(`### ${div.name} (D${div.level}) — ${matches} matches, ${f2(totalGoals / matches)} goals/match`, '');
    lines.push('| # | Team | OVR | Pts | W-D-L | GF-GA |', '|---|---|---|---|---|---|');
    table.forEach((row, i) => {
      lines.push(`| ${i + 1} | ${row.team.name} | ${row.ovr} | ${row.pts} | ${row.w}-${row.d}-${row.l} | ${row.gf}-${row.ga} |`);
    });
    const spread = table[0].pts - table[table.length - 1].pts;
    const top = [...scorers.values()].sort((a, b) => b.goals - a.goals).slice(0, 3);
    lines.push('',
      `Points spread ${spread} (top ${table[0].pts}, bottom ${table[table.length - 1].pts}).`
      + ` Champions OVR ${table[0].ovr}; relegation-zone OVR ${table.slice(-2).map(r => r.ovr).join(', ')}.`,
      `Top scorers: ${top.map(s => `${s.name} (${s.team}) ${s.goals}`).join('; ')}.`, '');
  }
}

// ── section 6: multi-season churn drift (Norway) ─────────────────────────────

function churnSection(lines: string[]): void {
  const SEASONS = 25;
  const data = COUNTRY_DATA.norway;
  const divisions = getAllDivisions(data);
  const rng = mulberry32(nextSeedBase());
  const youthFactory = generatorYouthFactory(rng);

  // Mutable world: every club squad plus one shared national free-agent pool.
  const clubs = divisions.flatMap(div => div.teams.map(t => ({
    id: t.id, divisionLevel: div.level, squad: [...t.squad],
  })));
  let freeAgents: Player[] = [];

  const meanOvr = (players: Player[]) => players.length === 0 ? 0 : getTeamOVR(players);
  const meanAge = (players: Player[]) => players.length === 0 ? 0 : players.reduce((s, p) => s + p.age, 0) / players.length;
  const divStats = () => divisions.map(div => {
    const all = clubs.filter(c => c.divisionLevel === div.level).flatMap(c => c.squad);
    return { level: div.level, ovr: meanOvr(all), age: meanAge(all) };
  });

  lines.push('## 6. Multi-season churn drift — Norway, no matches, world mechanics only', '');
  lines.push(`Per season: every club runs churnSquad (ageing, development, retirement, academy intake at`,
    `academyBiasForLevel(5 − division)), overflow + free agents churn, then one runAiMarket window`,
    `(activity 0.5, target size 25). ${SEASONS} seasons, one shared national pool. Watch for band drift.`, '');
  lines.push('| Season | D1 OVR | D1 age | D2 OVR | D2 age | D3 OVR | D3 age | Pool size | Pool OVR |', '|---|---|---|---|---|---|---|---|---|');
  const stat0 = divStats();
  lines.push(`| 0 (now) | ${stat0.map(s => `${s.ovr} | ${f1(s.age)}`).join(' | ')} | ${freeAgents.length} | – |`);

  for (let season = 1; season <= SEASONS; season++) {
    const overflow: OverflowSpec[] = [];
    for (const club of clubs) {
      const res = churnSquad(club.squad, {
        // Average AI training modelled as an equivalent development bonus (6b phase 6),
        // not simulated matches — see plan. Roughly a mid-table training setup.
        rng, youthFactory, nationality: data.nationality,
        ...trainingBonusesForLevel(facilityForLevel(club.divisionLevel)),
        academyBias: academyBiasForLevel(facilityForLevel(club.divisionLevel)),
      });
      club.squad = res.squad;
      overflow.push(...res.overflow.map(position => ({ position, nationality: data.nationality })));
    }
    freeAgents = churnFreeAgents(freeAgents, { rng, youthFactory, overflow, youthLevel: 3 });
    const market = runAiMarket(clubs.map(c => ({ id: c.id, squad: c.squad })), freeAgents, {
      rng, activity: 0.5, targetSizes: Object.fromEntries(clubs.map(c => [c.id, 25])),
    });
    for (const t of market.teams) { clubs.find(c => c.id === t.id)!.squad = t.squad; }
    freeAgents = market.freeAgents;

    const st = divStats();
    const poolOvr = freeAgents.length > 0 ? `${meanOvr(freeAgents)}` : '–';
    lines.push(`| ${season} | ${st.map(s => `${s.ovr} | ${f1(s.age)}`).join(' | ')} | ${freeAgents.length} | ${poolOvr} |`);
  }
  lines.push('');
}

// ── main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const started = Date.now();
  const lines: string[] = [
    '# Calibration report (rework Step 6a)',
    '',
    'Generated by `pnpm --filter @fm2k/engine calibration-report` — deterministic seeds, so re-runs on',
    'unchanged code are identical; tune a knob, re-run, and diff. CS = clean sheet, BTS = both teams scored,',
    'per-match rates unless noted. Real-football reference targets: ~2.5–3.0 goals/match, ~25% draws,',
    'clean sheets ~30%, BTS ~50%, home advantage a few points of win%.',
    '',
  ];
  console.log('Section 1–2: synthetic tiers…');
  syntheticSection(lines);
  console.log('Section 3: real squads…');
  realSquadSection(lines);
  console.log('Section 4: tactics sweeps…');
  tacticsSection(lines);
  console.log('Section 5: league seasons…');
  seasonSection(lines);
  console.log('Section 6: churn drift…');
  churnSection(lines);
  writeFileSync(OUT_PATH, lines.join('\n'));
  console.log(`✓ Wrote CALIBRATION_REPORT.md in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
