import { churnSquad, churnFreeAgents, runAiMarket, generatorYouthFactory, MAX_SQUAD_SIZE, type OverflowSpec } from './world-churn.ts';
import { PlayerGenerator } from '../player/player-generator.ts';
import { calculateOverall, type Player, type Position } from '@fm2k/match';

/**
 * World-churn distribution simulation — the **long-run** picture of the shared pool: do mean skill,
 * mean age, and positional variety stay stable across many seasons, or do they drift? Heavy and gated
 * (run via `pnpm --filter @fm2k/engine test:calibration`); the deliberate target of balance tuning,
 * not a fast unit gate. Stability need not be exact each season — only bounded over the long run.
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

const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'LB', 'RB',
  'CDM', 'CM', 'CM', 'CAM', 'LM', 'RM',
  'LW', 'RW', 'ST', 'ST', 'ST',
];

interface Team { id: string; nationality: string; trainingLevel: number; academyLevel: number; squad: Player[] }

/** Build a world resembling the seeded league data: a spread of ages and overalls across teams. */
function buildWorld(teamCount: number, rng: () => number): Team[] {
  const gen = new PlayerGenerator('female', 'all', rng);
  return Array.from({ length: teamCount }, (_, t) => {
    // Stronger clubs sit in higher tiers with better facilities.
    const tier = (t % 3) + 1;                 // 1..3
    const facility = 5 - tier;                // tier1→4, tier3→2
    const baseOverall = 70 - (tier - 1) * 10; // tier1 ~70, tier3 ~50
    const squad = SQUAD_TEMPLATE.map(pos => {
      const overall = baseOverall + Math.round((rng() - 0.5) * 24);
      const age = 18 + Math.floor(rng() * 17); // 18..34
      return gen.generatePlayer(pos, { overall, age });
    });
    return { id: `t${t}`, nationality: 'unknown', trainingLevel: facility, academyLevel: facility, squad };
  });
}

const meanOverall = (players: Player[]) => players.reduce((s, p) => s + calculateOverall(p.attributes), 0) / players.length;
const meanAge = (players: Player[]) => players.reduce((s, p) => s + p.age, 0) / players.length;

const TEAM_COUNT = 24;
const INITIAL_POPULATION = TEAM_COUNT * SQUAD_TEMPLATE.length;

interface SeasonSnapshot { season: number; meanOverall: number; meanAge: number; clubPlayers: number; pool: number; poolPeak: number; minSquad: number; maxSquad: number }

/**
 * One full season cycle, mirroring the session: cap each club's intake (overflow → pool), conserve
 * the pool, then run the AI market to refill short squads from the pool toward their target size.
 */
function simulate(seasons: number, teamCount: number, seed: number): { history: SeasonSnapshot[]; world: Team[]; pool: Player[] } {
  const rng = mulberry32(seed);
  const youthFactory = generatorYouthFactory(rng);
  let world = buildWorld(teamCount, rng);
  let pool: Player[] = [];
  const targetSizes = Object.fromEntries(world.map(t => [t.id, SQUAD_TEMPLATE.length]));
  const history: SeasonSnapshot[] = [];

  for (let s = 0; s < seasons; s++) {
    const overflow: OverflowSpec[] = [];
    world = world.map(team => {
      const res = churnSquad(team.squad, {
        rng, youthFactory, nationality: team.nationality,
        trainingLevel: team.trainingLevel, academyLevel: team.academyLevel,
      });
      for (const pos of res.overflow) { overflow.push({ position: pos, nationality: team.nationality }); }
      return { ...team, squad: res.squad };
    });
    pool = churnFreeAgents(pool, { rng, youthFactory, overflow });
    const poolPeak = pool.length; // the FA list swells with overflow before clubs draw it down

    // AI market over two windows/season at the default activity (≈ real cadence): clubs refill toward
    // their template size, but don't drain the list — leaving depth for the manager to shop.
    for (let w = 0; w < 2; w++) {
      const market = runAiMarket(world.map(t => ({ id: t.id, squad: t.squad })), pool, { rng, targetSizes });
      const squadById = new Map(market.teams.map(t => [t.id, t.squad]));
      world = world.map(t => ({ ...t, squad: squadById.get(t.id) ?? t.squad }));
      pool = market.freeAgents;
    }

    const sizes = world.map(t => t.squad.length);
    const all = world.flatMap(t => t.squad);
    history.push({
      season: s, meanOverall: meanOverall(all), meanAge: meanAge(all),
      clubPlayers: all.length, pool: pool.length, poolPeak, minSquad: Math.min(...sizes), maxSquad: Math.max(...sizes),
    });
  }
  return { history, world, pool };
}

describe('world-churn calibration (long-run stability):', () => {
  it('prints the multi-season distribution table', () => {
    const { history } = simulate(30, TEAM_COUNT, 12345);
    // eslint-disable-next-line no-console
    console.log('\n  season | meanOVR | meanAge | clubs | poolPeak | pool | squad[min..max]');
    for (const h of history) {
      if (h.season % 3 === 0 || h.season === history.length - 1) {
        // eslint-disable-next-line no-console
        console.log(`   ${String(h.season).padStart(4)}  |  ${h.meanOverall.toFixed(1).padStart(4)}  |  ${h.meanAge.toFixed(1).padStart(4)}  |  ${String(h.clubPlayers).padStart(4)} |   ${String(h.poolPeak).padStart(4)}   | ${String(h.pool).padStart(4)} | ${h.minSquad}..${h.maxSquad}`);
      }
    }
    expect(history.length).toBe(30);
  });

  it('caps bind in high-retirement seasons (squads dip below full, then refill from the pool)', () => {
    const { history } = simulate(30, TEAM_COUNT, 999);
    // The cap occasionally leaves a club short (overflow routed to the FA list), and clubs rebuild
    // from the pool — never overfilling past the template target.
    expect(history.some(h => h.minSquad < SQUAD_TEMPLATE.length)).toBe(true);
    expect(history.some(h => h.poolPeak > 0)).toBe(true);
    expect(history.every(h => h.maxSquad <= SQUAD_TEMPLATE.length)).toBe(true);
  });

  it('conserves total world population exactly every season', () => {
    const { history } = simulate(30, TEAM_COUNT, 999);
    for (const h of history) {
      expect(h.clubPlayers + h.pool).toBe(INITIAL_POPULATION);
    }
  });

  it('keeps squad sizes in a viable band (refilled, never above the cap)', () => {
    const { history } = simulate(30, TEAM_COUNT, 999);
    for (const h of history.slice(5)) {
      expect(h.minSquad).toBeGreaterThanOrEqual(11); // always a fieldable squad
      expect(h.maxSquad).toBeLessThanOrEqual(MAX_SQUAD_SIZE);
    }
  });

  it('keeps mean overall from collapsing or inflating over the long run', () => {
    const { history } = simulate(30, TEAM_COUNT, 999);
    const late = history.slice(20).reduce((s, h) => s + h.meanOverall, 0) / history.slice(20).length;
    expect(late).toBeGreaterThan(40);
    expect(late).toBeLessThan(80);
  });

  it('keeps mean age in a believable band', () => {
    const { history } = simulate(30, TEAM_COUNT, 7);
    const late = history.slice(20).reduce((s, h) => s + h.meanAge, 0) / history.slice(20).length;
    expect(late).toBeGreaterThan(20);
    expect(late).toBeLessThan(30);
  });
});
