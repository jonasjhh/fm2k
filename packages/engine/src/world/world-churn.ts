import type { Player, PlayerAttributes, PlayerPosition } from '@fm2k/match';
import { calculateOverall } from '@fm2k/match';
import { developOverSeason, DEFAULT_REGIMENT, type RegimentId } from '../player/progression.ts';
import { PlayerGenerator } from '@fm2k/players';
import { playerValue } from '@fm2k/valuation';
import type { YouthBias } from '../club/facilities/facility-types.ts';

/**
 * World churn — the season-boundary lifecycle for the **shared player pool**: every squad develops
 * and ages, veterans retire, and youth arrive to backfill, so the world keeps circulating instead of
 * freezing. Pure and **rng-injected** (the youth generator is injected too), so it is deterministic
 * and unit/mutation testable. Used by both the player's club (`ClubManager.handleSeasonComplete`) and
 * the AI world + free-agent pool (orchestrated by the session).
 *
 * Retirement reaches an *equilibrium*: high current skill resists retirement, so elite players last
 * longer — but ageing keeps eroding their attributes (`developOverSeason` decline), and once a
 * veteran's skill has fallen far enough the rising age chance is no longer held back and they retire.
 * Youth backfill is **position-preserving**: a retired player is replaced by a prospect in the same
 * position, so squads (and the world) keep their positional variety.
 */

type AttrKey = keyof PlayerAttributes;

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ── retirement curve ────────────────────────────────────────────────────────────
const RETIRE_AGE_MIN = 31;       // below this age: never retires
const RETIRE_AGE_CERTAIN = 40;   // at/above this age: effectively certain to retire
const RETIRE_AGE_SLOPE = 0.09;   // chance gained per year past 30
const RETIRE_SKILL_PIVOT = 45;   // overall at/below which skill offers no resistance
const RETIRE_SKILL_SPAN = 40;    // overall above the pivot for full resistance
const RETIRE_SKILL_RESIST = 0.6; // maximum resistance an elite player gets

/** Chance a player retires this season — rises with age, resisted by current skill. */
export function retirementChance(age: number, overall: number): number {
  if (age < RETIRE_AGE_MIN) { return 0; }
  if (age >= RETIRE_AGE_CERTAIN) { return 0.98; }
  const base = (age - (RETIRE_AGE_MIN - 1)) * RETIRE_AGE_SLOPE;
  const resist = clamp(0, RETIRE_SKILL_RESIST, ((overall - RETIRE_SKILL_PIVOT) / RETIRE_SKILL_SPAN) * RETIRE_SKILL_RESIST);
  return clamp(0, 0.98, base - resist);
}

// ── youth quality ───────────────────────────────────────────────────────────────
// Prospects start low (they develop via progression) but their *potential* band — the real measure
// of an academy — widens and lifts with recruitment quality, so good academies can produce stars.
// These are the "nothing built" floor; Regional Scouting Hubs (and, for AI clubs without real
// wings, academyBiasForLevel) add on top via `bias`.
const YOUTH_BASE_OVERALL = 26;
const YOUTH_BASE_POTENTIAL_RANGE: [number, number] = [40, 62];
const YOUTH_AGE_MIN = 16;
const YOUTH_AGE_MAX = 19;

/** Maps a division level (1 = top flight) to the 1–4 facility-quality tier used to approximate
 *  AI clubs' training and academy — D1 gets elite (4), D2 experienced (3), D3+ junior (2 or 1). */
export function facilityForLevel(divisionLevel: number): number {
  return Math.max(1, Math.min(4, 5 - divisionLevel));
}

/** Maps the 1–4 facility tier to (growthBonus, ceilingBonus) used by `developOverSeason` —
 *  the same axes as the player's Training Facilities wings, approximated for AI clubs. */
export function trainingBonusesForLevel(level: number): { growthBonus: number; ceilingBonus: number } {
  return ([
    { growthBonus: 0, ceilingBonus: 0 },
    { growthBonus: 0.1, ceilingBonus: 6 },
    { growthBonus: 0.2, ceilingBonus: 11 },
    { growthBonus: 0.3, ceilingBonus: 15 },
  ] as const)[level - 1] ?? { growthBonus: 0, ceilingBonus: 0 };
}

/** Maps the old flat 1–4 academy level onto a YouthBias — an exact equivalence, used by AI
 *  clubs (which approximate their academy from division tier rather than owning real hubs). */
export function academyBiasForLevel(level: number): YouthBias {
  const l = clamp(1, 4, Math.round(level));
  const overallBonus = (l - 1) * 4;
  const potentialRangeBonus: [number, number] = [(l - 1) * 6, (l - 1) * 8];
  return { overallBonus, potentialRangeBonus, nationalityPool: [], gkOverallBonus: overallBonus, gkPotentialRangeBonus: potentialRangeBonus };
}

/** A factory that mints a youth player to the requested spec (injected; impure part lives here). */
export type YouthFactory = (
  position: PlayerPosition,
  spec: { overall: number; age: number; potential: number; nationality: string },
) => Player;

/** The default youth factory: a `PlayerGenerator` shaped to the requested overall/age/potential. */
export function generatorYouthFactory(rng: () => number = Math.random): YouthFactory {
  const generator = new PlayerGenerator('female', 'all', rng);
  return (position, spec) => ({
    ...generator.generatePlayer(position, { overall: spec.overall, age: spec.age, potential: spec.potential }),
    nationality: spec.nationality,
  });
}

/** Build a youth spec from the recruitment bias (Regional Scouting Hubs, or an AI-club
 *  equivalent via academyBiasForLevel), then mint via the factory. Goalkeeper intakes use the
 *  bias's GK-specific bonuses instead of its outfield ones (e.g. the Goalkeeping Academy Hub);
 *  a non-empty `nationalityPool` overrides the passed `nationality` for this prospect. */
export function makeYouth(
  position: PlayerPosition, bias: YouthBias, nationality: string, factory: YouthFactory, rng: () => number,
): Player {
  const isGK = position === 'GK';
  const overallBonus = isGK ? bias.gkOverallBonus : bias.overallBonus;
  const [bonusLo, bonusHi] = isGK ? bias.gkPotentialRangeBonus : bias.potentialRangeBonus;
  const overall = YOUTH_BASE_OVERALL + overallBonus + Math.round((rng() - 0.5) * 8);
  const pLo = YOUTH_BASE_POTENTIAL_RANGE[0] + bonusLo;
  const pHi = YOUTH_BASE_POTENTIAL_RANGE[1] + bonusHi;
  const potential = Math.round(pLo + rng() * (pHi - pLo));
  const age = YOUTH_AGE_MIN + Math.floor(rng() * (YOUTH_AGE_MAX - YOUTH_AGE_MIN + 1));
  const pickedNationality = bias.nationalityPool.length > 0
    ? bias.nationalityPool[Math.floor(rng() * bias.nationalityPool.length)]
    : nationality;
  return factory(position, {
    overall: clamp(20, 99, overall), age, potential: clamp(overall, 99, potential), nationality: pickedNationality,
  });
}

// ── squad churn ───────────────────────────────────────────────────────────────────
export interface PlayerDelta {
  playerId: string;
  playerName: string;
  age: number;
  /** Net per-attribute change this season (only non-zero deltas). */
  deltas: Partial<Record<AttrKey, number>>;
}

/** Default per-season direct youth intake a club receives: a random 1 or 2. */
export function randomIntakeCap(rng: () => number): number {
  return 1 + Math.floor(rng() * 2);
}

export interface SquadChurnOptions {
  rng: () => number;
  youthFactory: YouthFactory;
  nationality: string;
  /** Training Facilities' composed growth-axis bonus (FacilityManager.trainingAxes). */
  growthBonus: number;
  /** Training Facilities' composed ceiling-axis bonus (FacilityManager.trainingAxes). */
  ceilingBonus: number;
  /** Recruitment bias driving youth intake quality (Regional Scouting Hubs, merged with any
   *  intake-quality bonus from youth development wings — see FacilityManager). */
  academyBias: YouthBias;
  /** The training regiment for a given player (defaults to balanced). */
  regimentOf?: (player: Player) => RegimentId;
  /** Max academy youth that join the club directly this season (default: random 1–2). */
  maxIntake?: number;
}

export interface SquadChurnResult {
  /** Surviving players (developed + aged) plus up to `maxIntake` youth — may be below the prior size. */
  squad: Player[];
  /** Players who developed then retired this season (post-development state), for messaging. */
  retired: Player[];
  /** Net deltas for survivors whose attributes changed this season. */
  developed: PlayerDelta[];
  /** Academy youth that actually joined the club this season (≤ maxIntake). */
  youth: Player[];
  /** Retiree positions left unfilled — overflow to be minted into the free-agent pool. */
  overflow: PlayerPosition[];
}

/** Per-attribute net change between two attribute snapshots (only non-zero entries). */
export function attributeDelta(before: PlayerAttributes, after: PlayerAttributes): Partial<Record<AttrKey, number>> {
  const deltas: Partial<Record<AttrKey, number>> = {};
  for (const key of Object.keys(after) as AttrKey[]) {
    const d = after[key] - before[key];
    if (d !== 0) { deltas[key] = d; }
  }
  return deltas;
}

/**
 * Run one season-boundary step for a single squad: develop+age everyone, retire by the equilibrium
 * curve, then take a *small* direct academy intake (≤ maxIntake). Retiree positions beyond the cap
 * are returned as `overflow` for the caller to mint into the free-agent pool — the club rebuilds the
 * rest from the market. World population is conserved: every retiree maps to one same-position youth
 * (some in the club, the rest in the pool).
 */
export function churnSquad(squad: Player[], opts: SquadChurnOptions): SquadChurnResult {
  const regimentOf = opts.regimentOf ?? (() => DEFAULT_REGIMENT);
  const maxIntake = opts.maxIntake ?? randomIntakeCap(opts.rng);
  const survivors: Player[] = [];
  const retired: Player[] = [];
  const developed: PlayerDelta[] = [];

  for (const player of squad) {
    const dev = developOverSeason(player, regimentOf(player), opts.growthBonus, opts.ceilingBonus, opts.rng);
    const grown: Player = { ...player, attributes: dev.attributes, age: dev.age };
    const deltas = attributeDelta(player.attributes, dev.attributes);
    if (Object.keys(deltas).length > 0) {
      developed.push({ playerId: grown.id, playerName: grown.name, age: grown.age, deltas });
    }
    if (opts.rng() < retirementChance(grown.age, calculateOverall(grown.attributes))) {
      retired.push(grown);
    } else {
      survivors.push(grown);
    }
  }

  // Only a small intake joins directly; the rest of the retiree positions overflow to the pool.
  const intake = retired.slice(0, maxIntake);
  const youth = intake.map(r => makeYouth(r.position, opts.academyBias, opts.nationality, opts.youthFactory, opts.rng));
  const overflow = retired.slice(maxIntake).map(r => r.position);

  return { squad: [...survivors, ...youth], retired, developed, youth, overflow };
}

// ── free-agent pool churn ───────────────────────────────────────────────────────────
/** A youth to mint into the pool: overflow from clubs (a retiree position they didn't backfill). */
export interface OverflowSpec { position: PlayerPosition; nationality: string }

export interface PoolChurnOptions {
  rng: () => number;
  youthFactory: YouthFactory;
  /** Club overflow (retiree positions not backfilled in-club) to mint into the pool. */
  overflow: OverflowSpec[];
  /** Academy band used for pool youth (unattached prospects); defaults to 2. */
  youthLevel?: number;
  /** Growth-axis bonus used to develop unattached players; defaults to a neutral mid-tier value. */
  growthBonus?: number;
  /** Ceiling-axis bonus used to develop unattached players; defaults to a neutral mid-tier value. */
  ceilingBonus?: number;
  /** Share of pool replacements minted as ready-made backfill players instead of academy
   *  youths, so the market always carries some signable squad players; defaults to 0.6. */
  backfillShare?: number;
}

// ── backfill players ────────────────────────────────────────────────────────────
// A pool made only of 16–19-year-old prospects collapses: the AI market signs anything
// playable and leaves dregs, and clubs can't replace retirees at level. Backfill players
// are ready-made pros released from nowhere in particular, minted along a quality pyramid
// that spans every division: mostly D3/D2 fillers, a solid middle, and rare genuine D1
// starters. Within the elite band a super-rare wonderkid can appear — already top-notch
// at 18–19 with real headroom left.
const BACKFILL_MID_SHARE = 0.3;     // OVR 55–70 (upper-D2 / lower-D1)
const BACKFILL_ELITE_SHARE = 0.1;   // OVR 70+ tapering (genuine D1 starters)
                                    // remainder (~0.6): OVR 30–55 (D3/D2 fillers)
const BACKFILL_AGE_MIN = 21;
const BACKFILL_AGE_SPAN = 12;       // 21–32 years old
const BACKFILL_POTENTIAL_HEADROOM = 4;
const WONDERKID_CHANCE = 0.15;      // within the elite band only → ~1.5% of all backfill
const WONDERKID_POTENTIAL_BONUS: [number, number] = [8, 15];

/** Mint a ready-made free agent along the division-spanning quality pyramid. */
export function makeBackfillPlayer(
  position: PlayerPosition, nationality: string, factory: YouthFactory, rng: () => number,
): Player {
  const band = rng();
  if (band < BACKFILL_ELITE_SHARE) {
    // Elite band: 70+ tapering toward 70 (rng² thins out the very top end).
    const overall = Math.round(70 + rng() * rng() * 12);
    if (rng() < WONDERKID_CHANCE) {
      const [bLo, bHi] = WONDERKID_POTENTIAL_BONUS;
      const potential = clamp(overall, 99, overall + bLo + Math.round(rng() * (bHi - bLo)));
      const age = 18 + Math.floor(rng() * 2);
      return factory(position, { overall, age, potential, nationality });
    }
    const age = BACKFILL_AGE_MIN + Math.floor(rng() * BACKFILL_AGE_SPAN);
    const potential = clamp(overall, 99, overall + Math.round(rng() * BACKFILL_POTENTIAL_HEADROOM));
    return factory(position, { overall, age, potential, nationality });
  }
  const [lo, hi] = band < BACKFILL_ELITE_SHARE + BACKFILL_MID_SHARE ? [55, 70] : [30, 55];
  const overall = Math.round(lo + rng() * (hi - lo));
  const age = BACKFILL_AGE_MIN + Math.floor(rng() * BACKFILL_AGE_SPAN);
  const potential = clamp(overall, 99, overall + Math.round(rng() * BACKFILL_POTENTIAL_HEADROOM));
  return factory(position, { overall, age, potential, nationality });
}

/**
 * Age/develop the free-agent pool and retire its veterans, then conserve population: replace each
 * pool retiree 1:1 with a fresh youth (same position), and mint the supplied club `overflow`.
 */
export function churnFreeAgents(pool: Player[], opts: PoolChurnOptions): Player[] {
  // Neutral mid-tier defaults — equivalent to the old flat training-facility level 2.
  const growthBonus = opts.growthBonus ?? 0.1;
  const ceilingBonus = opts.ceilingBonus ?? 6;
  const youthLevel = opts.youthLevel ?? 2;
  const next: Player[] = [];
  const retiredSpecs: OverflowSpec[] = [];

  for (const player of pool) {
    const dev = developOverSeason(player, DEFAULT_REGIMENT, growthBonus, ceilingBonus, opts.rng);
    const grown: Player = { ...player, attributes: dev.attributes, age: dev.age };
    if (opts.rng() >= retirementChance(grown.age, calculateOverall(grown.attributes))) {
      next.push(grown);
    } else {
      retiredSpecs.push({ position: grown.position, nationality: grown.nationality }); // replace 1:1
    }
  }

  const youthBias = academyBiasForLevel(youthLevel);
  const backfillShare = opts.backfillShare ?? 0.6;
  for (const spec of [...retiredSpecs, ...opts.overflow]) {
    next.push(opts.rng() < backfillShare
      ? makeBackfillPlayer(spec.position, spec.nationality, opts.youthFactory, opts.rng)
      : makeYouth(spec.position, youthBias, spec.nationality, opts.youthFactory, opts.rng));
  }

  return next;
}

// ── AI market activity ───────────────────────────────────────────────────────────
// During a transfer window AI clubs try to improve: each (with some probability) upgrades its weakest
// position from the free-agent pool, releasing the player it displaces back into the pool. They act on
// even a *marginal* improvement (a small threshold rather than demanding a bargain) — the "bounded
// overspend" that keeps clubs active and stops the market stagnating into a race to the bottom.

export interface AiMarketTeam { id: string; squad: Player[] }

export interface AiMarketOptions {
  rng: () => number;
  /** Probability each club attempts activity this window. */
  activity?: number;
  /** Minimum overall improvement (in points) that justifies an upgrade swap. */
  improveThreshold?: number;
  /** Per-club squad size to refill toward (clamped to MAX_SQUAD_SIZE). */
  targetSizes?: Record<string, number>;
  /** AI visibility filter on the pool (the pickup-delay drip: fresh free agents stay invisible
   *  to AI clubs for a while). Players released *during this window* are always signable. */
  canSign?: (p: Player) => boolean;
}

/** One discrete player movement between a club and the free-agent pool, for headline/inspection use. */
export interface AiMarketMove {
  teamId: string;
  playerId: string;
  playerName: string;
  direction: 'signed' | 'released';
}

export interface AiMarketResult {
  teams: AiMarketTeam[];
  freeAgents: Player[];
  /** Every individual player movement this window (for calibration/inspection and news headlines). */
  moves: AiMarketMove[];
}

/** Hard cap on an AI squad: above this, the club releases its lowest-value players. */
export const MAX_SQUAD_SIZE = 25;

const ovr = (p: Player) => calculateOverall(p.attributes);
const weakestIndex = (squad: Player[]) =>
  squad.reduce((lo, p, i) => (ovr(p) < ovr(squad[lo]) ? i : lo), 0);

/**
 * One window of AI-to-pool trading. Per active club: trim above the 25 cap, optionally consolidate
 * (release the two weakest to sign one stronger of comparable combined value), upgrade the weakest
 * slot, then refill open slots from the pool toward the club's target size. Only *moves* players
 * between clubs and the pool, so it never changes world population.
 */
export function runAiMarket(teams: AiMarketTeam[], freeAgents: Player[], opts: AiMarketOptions): AiMarketResult {
  const activity = opts.activity ?? 0.5;
  const threshold = opts.improveThreshold ?? 2;
  const pool = [...freeAgents];
  const moves: AiMarketMove[] = [];
  const releasedNow = new Set<string>();
  const visible = (p: Player) => releasedNow.has(p.id) || (opts.canSign?.(p) ?? true);

  const takeBest = (predicate: (p: Player) => boolean): Player | null => {
    let best = -1;
    for (let i = 0; i < pool.length; i++) {
      if (!visible(pool[i]) || !predicate(pool[i])) { continue; }
      if (best === -1 || ovr(pool[i]) > ovr(pool[best])) { best = i; }
    }
    return best === -1 ? null : pool.splice(best, 1)[0];
  };

  const result = teams.map(team => {
    if (opts.rng() >= activity || team.squad.length === 0) { return team; }
    const squad = [...team.squad];
    const target = Math.min(MAX_SQUAD_SIZE, opts.targetSizes?.[team.id] ?? squad.length);
    const recordMove = (player: Player, direction: 'signed' | 'released') => {
      if (direction === 'released') { releasedNow.add(player.id); }
      moves.push({ teamId: team.id, playerId: player.id, playerName: player.name, direction });
    };

    // 1. Trim above the cap: release lowest-value players to the pool.
    while (squad.length > MAX_SQUAD_SIZE) {
      const idx = squad.reduce((lo, p, i) => (playerValue(p) < playerValue(squad[lo]) ? i : lo), 0);
      const released = squad.splice(idx, 1)[0];
      pool.push(released);
      recordMove(released, 'released');
    }

    // 2. Consolidate: swap the two weakest for one clearly better player (net −1, quality up).
    if (squad.length >= 2) {
      const sorted = [...squad].sort((a, b) => playerValue(a) - playerValue(b));
      const [w1, w2] = sorted;
      const combined = playerValue(w1) + playerValue(w2);
      const star = takeBest(p => playerValue(p) >= combined && ovr(p) > ovr(w1));
      if (star) {
        for (const w of [w1, w2]) {
          pool.push(squad.splice(squad.findIndex(p => p.id === w.id), 1)[0]);
          recordMove(w, 'released');
        }
        squad.push(star);
        recordMove(star, 'signed');
      }
    }

    // 3. Upgrade the weakest slot with a clearly better same-position free agent.
    if (squad.length > 0) {
      const wi = weakestIndex(squad);
      const bar = ovr(squad[wi]) + threshold;
      const better = takeBest(p => p.position === squad[wi].position && ovr(p) >= bar);
      if (better) {
        pool.push(squad[wi]);
        recordMove(squad[wi], 'released');
        squad[wi] = better;
        recordMove(better, 'signed');
      }
    }

    // 4. Refill open slots toward the target with the best players the pool offers.
    while (squad.length < target) {
      const signing = takeBest(() => true);
      if (!signing) { break; }
      squad.push(signing);
      recordMove(signing, 'signed');
    }

    return { ...team, squad };
  });

  return { teams: result, freeAgents: pool, moves };
}
