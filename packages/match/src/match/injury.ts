import type { Player } from '../shared/types.ts';
import type { MatchEvent, MatchState } from './types.ts';

/** An injury picked up in a match — duration is *pre-mitigation* (before medical facilities). */
export interface InjuryReport {
  playerId: string;
  type: string;
  /** Matches out, before any club medical-facility mitigation. */
  baseDuration: number;
}

/** An in-match injury: the report plus where/when/how it happened on the pitch. */
export interface MatchInjury extends InjuryReport {
  team: 'home' | 'away';
  minute: number;
  /** What the player was doing — drives the ticker text. */
  cause: InjuryTrigger;
}

// ── severity catalogue ─────────────────────────────────────────────────────────
// Weighted per trigger category so short knocks are common (~70%), moderate
// injuries occasional (~25%) and serious ones rare (~5%, and only reachable
// through the high-impact triggers).

interface InjuryTypeDef {
  type: string;
  weight: number;
  /** [min, max] matches out, inclusive. */
  duration: [number, number];
}

const IMPACT_INJURIES: InjuryTypeDef[] = [
  { type: 'dead_leg', weight: 42, duration: [1, 2] },
  { type: 'ankle_sprain', weight: 30, duration: [2, 4] },
  { type: 'knee_injury', weight: 22, duration: [3, 5] },
  { type: 'knee_ligament_tear', weight: 6, duration: [8, 12] },
];

/** A card-worthy challenge can break bones — only reachable via the foul trigger. */
const CARDED_FOUL_INJURIES: InjuryTypeDef[] = [
  ...IMPACT_INJURIES,
  { type: 'broken_leg', weight: 8, duration: [10, 15] },
];

const MUSCLE_INJURIES: InjuryTypeDef[] = [
  { type: 'muscle_strain', weight: 40, duration: [1, 2] },
  { type: 'calf_strain', weight: 25, duration: [2, 4] },
  { type: 'groin_strain', weight: 18, duration: [2, 3] },
  { type: 'hamstring_pull', weight: 13, duration: [3, 5] },
  { type: 'torn_hamstring', weight: 4, duration: [8, 10] },
];

const AERIAL_INJURIES: InjuryTypeDef[] = [
  { type: 'head_knock', weight: 55, duration: [1, 2] },
  { type: 'shoulder_injury', weight: 33, duration: [2, 4] },
  { type: 'concussion', weight: 12, duration: [8, 10] },
];

const KEEPER_INJURIES: InjuryTypeDef[] = [
  { type: 'bruised_ribs', weight: 45, duration: [1, 2] },
  { type: 'wrist_sprain', weight: 40, duration: [2, 3] },
  { type: 'finger_injury', weight: 15, duration: [1, 2] },
];

/** Every type this engine can produce (UI labels, tests). */
export const INJURY_TYPES = [
  ...new Set(
    [...CARDED_FOUL_INJURIES, ...MUSCLE_INJURIES, ...AERIAL_INJURIES, ...KEEPER_INJURIES].map(d => d.type),
  ),
] as const;

function pickInjury(table: InjuryTypeDef[], rng: () => number): { type: string; baseDuration: number } {
  const total = table.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  let picked = table[table.length - 1];
  for (const d of table) { r -= d.weight; if (r <= 0) { picked = d; break; } }
  const [lo, hi] = picked.duration;
  return { type: picked.type, baseDuration: lo + Math.floor(rng() * (hi - lo + 1)) };
}

// ── triggers ───────────────────────────────────────────────────────────────────
// Injuries are consequences of what actually happened: each risky involvement in a
// minute's events rolls against its trigger's exposure. Challenges carry the highest
// risk (and cards mark the nasty ones); sprints strain muscles; aerial duels knock
// heads; keepers pick up rare impact knocks.

export type InjuryTrigger = 'challenge' | 'foul' | 'sprint' | 'through_run' | 'aerial' | 'save';

/** Per-involvement injury chance at full fitness (fatigue multiplies it, below).
 *  Tuned so a season lands near ~1 injury per team every 3–4 matches (see BALANCE.md;
 *  final numbers are set in the Step 9C recalibration pass). */
const TRIGGER_EXPOSURE: Record<InjuryTrigger, number> = {
  challenge: 0.0035,   // being tackled / tackling
  foul: 0.006,         // the fouled player (multiplied when the foul draws a card)
  sprint: 0.002,       // dribble carry
  through_run: 0.002,  // sprinting onto a through ball
  aerial: 0.0015,      // header duel in the box
  save: 0.0005,        // keeper impact
};

/** Cards mark the nasty challenges: the fouled player's roll scales up with them. */
const YELLOW_FOUL_MULT = 2;
const RED_FOUL_MULT = 6;
/** The tackling defender risks less than the player being hit. */
const TACKLER_FACTOR = 0.5;

const CAUSE_TEXT: Record<InjuryTrigger, string> = {
  challenge: 'comes off worse in the challenge',
  foul: 'stays down after the foul',
  sprint: 'pulls up mid-run',
  through_run: 'pulls up sprinting onto the through ball',
  aerial: 'lands badly after the aerial duel',
  save: 'is hurt making the save',
};

export function injuryDescription(playerName: string, injury: MatchInjury): string {
  const label = injury.type.replace(/_/g, ' ');
  return `Injury! ${playerName} ${CAUSE_TEXT[injury.cause]} — ${label}, out ${injury.baseDuration} match${injury.baseDuration === 1 ? '' : 'es'}`;
}

/**
 * Fatigue multiplier on every injury roll: low stamina and empty legs are where
 * players break down (same shape the old end-of-match model used).
 */
export function fatigueRiskFactor(player: Player, energy: number): number {
  const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));
  const staminaFactor = clamp(0.7, 1.5, 1 + (50 - player.attributes.stamina) / 160);
  const energyFactor = clamp(0.7, 2, 1 + (55 - energy) / 70);
  return staminaFactor * energyFactor;
}

export interface InjuryExposure {
  playerId: string;
  team: 'home' | 'away';
  trigger: InjuryTrigger;
  /** Extra multiplier on top of the trigger exposure (carded fouls, the tackler's share). */
  mult: number;
  table: InjuryTypeDef[];
}

/** Every risky involvement in one minute's (flattened) event list. */
export function collectExposures(events: MatchEvent[]): InjuryExposure[] {
  const out: InjuryExposure[] = [];
  const cardedFoulers = new Set(
    events.filter(e => e.type === 'yellow_card' || e.type === 'red_card').map(e => e.playerId),
  );
  const redFoulers = new Set(events.filter(e => e.type === 'red_card').map(e => e.playerId));

  for (const e of events) {
    const attackerId = e.metadata?.attackerId as string | undefined;
    const attackingTeam = e.metadata?.attackingTeam as 'home' | 'away' | undefined;

    switch (e.type) {
    case 'tackle':
      // The challenged carrier takes the brunt; the tackler risks a share too.
      if (attackerId && attackingTeam) {
        out.push({ playerId: attackerId, team: attackingTeam, trigger: 'challenge', mult: 1, table: IMPACT_INJURIES });
      }
      if (e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'challenge', mult: TACKLER_FACTOR, table: IMPACT_INJURIES });
      }
      break;
    case 'foul': {
      // The fouled player: a card marks the challenge as nasty — higher risk, and
      // only here can the worst (a broken leg) happen.
      if (!attackerId || !attackingTeam) { break; }
      const carded = cardedFoulers.has(e.playerId);
      out.push({
        playerId: attackerId, team: attackingTeam, trigger: 'foul',
        mult: redFoulers.has(e.playerId) ? RED_FOUL_MULT : carded ? YELLOW_FOUL_MULT : 1,
        table: carded ? CARDED_FOUL_INJURIES : IMPACT_INJURIES,
      });
      break;
    }
    case 'dribble':
      if (e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'sprint', mult: 1, table: MUSCLE_INJURIES });
      }
      break;
    case 'through_ball': {
      const receiverId = e.metadata?.receiverId as string | undefined;
      if (receiverId) {
        out.push({ playerId: receiverId, team: e.team, trigger: 'through_run', mult: 1, table: MUSCLE_INJURIES });
      }
      break;
    }
    case 'shot':
      if (e.metadata?.aerial && e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'aerial', mult: 1, table: AERIAL_INJURIES });
      }
      break;
    case 'save':
      if (e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'save', mult: 1, table: KEEPER_INJURIES });
      }
      break;
    }
  }
  return out;
}

/** A state's in-match injuries split per side, stripped to the report shape the
 *  club layer consumes (medical mitigation happens there). */
export function injuriesBySide(state: MatchState): { home: InjuryReport[]; away: InjuryReport[] } {
  const all = state.matchInjuries ?? [];
  const strip = ({ playerId, type, baseDuration }: MatchInjury): InjuryReport => ({ playerId, type, baseDuration });
  return {
    home: all.filter(i => i.team === 'home').map(strip),
    away: all.filter(i => i.team === 'away').map(strip),
  };
}

/**
 * Roll one minute's exposures against the dedicated injury rng. At most one injury
 * per player per match (`alreadyInjured` seeds the exclusion — pass everyone already
 * off the pitch too). Deterministic under `injuryRng`; consumes no main-stream rng.
 */
export function rollInjuries(
  events: MatchEvent[],
  state: MatchState,
  alreadyInjured: ReadonlySet<string>,
  injuryRng: () => number,
): MatchInjury[] {
  const out: MatchInjury[] = [];
  const hit = new Set(alreadyInjured);

  for (const exp of collectExposures(events)) {
    if (hit.has(exp.playerId)) { continue; }
    const player = state.currentPlayers[exp.team].find(p => p.id === exp.playerId);
    if (!player) { continue; }
    const energy = state.energy?.[exp.team]?.[exp.playerId] ?? 100;
    const chance = TRIGGER_EXPOSURE[exp.trigger] * exp.mult * fatigueRiskFactor(player, energy);
    if (injuryRng() >= chance) { continue; }

    const picked = pickInjury(exp.table, injuryRng);
    hit.add(exp.playerId);
    out.push({
      playerId: exp.playerId,
      team: exp.team,
      minute: state.minute,
      cause: exp.trigger,
      type: picked.type,
      baseDuration: picked.baseDuration,
    });
  }
  return out;
}
