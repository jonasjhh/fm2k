// The v2 possession loop (REWORK_01.md §4/§4b) — the engine's skeleton, replacing
// action-selector's job. The ball is explicit state: CARRIED by a player, or FREE at a
// point. Each flow tick either resolves a pickup race (free) or lets the carrier's
// situation chooser pick a situation which resolves as a short duel chain (§4).
//
// Events emitted here keep v1's EventType vocabulary and metadata contract
// (contestedAction / attackingTeam / attackerId / receiverId / aerial) so stats.ts and
// injury.ts consume them unchanged, plus additive `metadata.duel` for the ticker.

import type { Player, PlayerAttributes } from '../../shared/types.ts';
import type { EventType } from '../types.ts';
import type { MatchParameters } from '../../tactics/match-parameters.ts';
import {
  SPEED_DUEL, STRENGTH_DUEL, DRIBBLE_DUEL, PASS_DUEL, SHOT_DUEL, PENALTY_DUEL,
  CROSS_DELIVERY, LONG_BALL_DELIVERY, THROUGH_BALL_DELIVERY, SET_PIECE_DELIVERY,
  LONG_THROW_DELIVERY, PRO_FOUL_RED_CHANCE,
  resolveDuel, escalates, deliveryCheck, deliveryBonus, foulChance, lastManFoulChance,
  type DuelOutcome, type DuelSpec, type DeliverySpec,
} from './duels.ts';
import {
  type XY, type Side, projectPresence, cellOf, presenceAt, spareManSurplus,
  nearestTo, distance,
} from './field.ts';
import { BAND_OF_ROLE, type Band } from '../../lineup/bands.ts';

// ── flow state ───────────────────────────────────────────────────────────────────

export type BallState =
  | { mode: 'carried'; side: Side; carrierId: string }
  | { mode: 'free'; at: XY };

/** One side's live match view for a flow tick. `positions` is mutated in place —
 *  duels move players (a beaten defender is behind the play, a runner is through). */
export interface FlowTeam {
  side: Side;
  /** Fatigued view of the on-pitch players. */
  players: Player[];
  positions: Record<string, XY>;
  params: MatchParameters;
  /** Short-lived attacking momentum (0 = none) — small shot-duel bonus. */
  momentum: number;
  gkId: string | null;
  /** Formation role per player id (e.g. 'CB', 'CM') — used for band-aware situation weights. */
  fieldedPositions?: Record<string, string>;
  /** Player ids that already have a yellow card this match — reduces their yellow chance. */
  bookedPlayers?: Set<string>;
}

/** A not-yet-wrapped MatchEvent: the simulator adds id/minute/resultingState. */
export interface FlowEvent {
  type: EventType;
  team: Side;
  playerId?: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface FlowTickResult {
  events: FlowEvent[];
  ball: BallState;
  /** Set when the chain ended in a goal for that side. */
  goal?: Side;
}

// ── real-football reference targets (combined both teams, per match) ─────────────
// Goals: 2.6–3.1        Shots on target: 7.5–9.0     Shots off/blocked: 14–17
// Corners: 9.5–11       Through balls: 2–4            Crosses attempted: 30–36
// Crosses completed: 6.5–8.5                          Dribble attempts: 36–44
// Successful dribbles: 16–21                          Progressive carries: 34–42
// Loose ball recoveries: 95–112                       Interceptions: 15–19
// Tackles attempted: 31–36   Tackles won: 17.5–21.5  Clearances: 28–35
// Fouls: 20–24 (low until TASK_12)                   Yellow cards: 3.8–4.6
// Red cards: 0.1–0.15   GK saves: 5–6.8              GK short passes: 24–31
// GK long passes: 14.5–19.5
// ─────────────────────────────────────────────────────────────────────────────────

// ── tuning knobs (calibration targets, Step 6) ───────────────────────────────────

/** Ground gained toward goal by a clean dribble/escape, in pitch lengths. */
export const CARRY_DISTANCE = 0.12;
/** Attacking-frame y beyond which shooting becomes an option (edge of range). */
export const SHOT_RANGE_Y = 0.72;
/** Second-defender rule (§6): attacker penalty per unit of extra defensive presence
 *  in the ball cell beyond the first defender, and its cap. */
export const SECOND_DEFENDER_SCALE = 0.12;
export const SECOND_DEFENDER_CAP = 0.15;
/** Pass-target rule (§6): receiver bonus per unit of attacking presence in the
 *  receiving cell, and its cap. */
export const PASS_TARGET_SCALE = 0.06;
export const PASS_TARGET_CAP = 0.1;
/** Spare-man rule (§6): back-band surplus needed for the covering defender to join
 *  through-ball races at full strength (below it, the runner gets a bonus). */
export const SPARE_MAN_BONUS = 0.08;
/** Momentum → shot-duel bonus conversion. */
export const MOMENTUM_SHOT_SCALE = 0.002;
/** chanceQuality slider → shot-duel bonus conversion (carries home advantage). */
export const CHANCE_QUALITY_SHOT_SCALE = 0.002;
/** Direct free kick: the wall's flat penalty on the shot duel. */
export const WALL_PENALTY = 0.08;
/** Chance a save/clearance near goal concedes a corner. */
export const CORNER_CHANCE_ON_SAVE = 0.3;
export const CORNER_CHANCE_ON_CLEARANCE = 0.2;
/** D7: probability a narrow save spills into a scramble (vs keeper smothering it). */
export const REBOUND_CHANCE = 0.2;
/** Card severity from foul margin.
 *  Every foul rolls independently for a yellow first; bad fouls (margin > RED_MARGIN)
 *  then roll a second time for a red upgrade on top of that yellow. */
export const YELLOW_CHANCE = 0.38;
/** Fraction of YELLOW_CHANCE applied when the fouler already has a yellow — models
 *  the "calm down after a booking" effect that prevents unrealistic double-bookings. */
export const YELLOW_SECOND_BOOKING_MODIFIER = 0.40;
export const RED_MARGIN = 0.45;       // margin threshold to be eligible for a red
export const RED_CHANCE = 0.01;       // upgrade chance when margin clears the threshold
/** Attacking-frame y beyond which a beaten cover defender counts as the last man. */
export const LAST_MAN_Y = 0.75;
/** Minimum Strength for a touchline restart in the final third to go long (§4) —
 *  accessible from 65, but the delivery is anchored high so success stays earned. */
export const LONG_THROW_MIN_STRENGTH = 65;
/** Above the minimum, going long is a strength-scaled choice, not an automatic —
 *  a specialist (90+) launches every third one, a borderline taker almost never. */
export const LONG_THROW_CHANCE_SPREAD = 60;
export const LONG_THROW_CHANCE_CAP = 0.5;
export function longThrowChance(strength: number): number {
  if (strength < LONG_THROW_MIN_STRENGTH) { return 0; }
  return Math.min(LONG_THROW_CHANCE_CAP, (strength - LONG_THROW_MIN_STRENGTH) / LONG_THROW_CHANCE_SPREAD);
}

/** Perpendicular distance from point `p` to the line segment `a`→`b`. */
function linePointDistance(a: XY, b: XY, p: XY): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const len2 = ab.x * ab.x + ab.y * ab.y;
  if (len2 < 1e-9) { return distance(a, p); }
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2));
  return distance(p, { x: a.x + t * ab.x, y: a.y + t * ab.y });
}

// ── frame helpers ────────────────────────────────────────────────────────────────

/** y in the ATTACKING frame of `side`: 0 = own goal line, 1 = opponent's. */
export function attackY(pos: XY, side: Side): number {
  return side === 'home' ? pos.y : 1 - pos.y;
}

/** The goal the side attacks, in the absolute frame. */
export function goalPoint(side: Side): XY {
  return { x: 0.5, y: side === 'home' ? 1 : 0 };
}

/** Move a point `dist` toward the attacked goal (clamped on the pitch). */
export function carryForward(pos: XY, side: Side, dist: number): XY {
  const goal = goalPoint(side);
  const d = distance(pos, goal);
  if (d < 1e-9) { return { ...pos }; }
  const t = Math.min(1, dist / d);
  return { x: pos.x + (goal.x - pos.x) * t, y: pos.y + (goal.y - pos.y) * t };
}

// ── player lookups ───────────────────────────────────────────────────────────────

function byId(team: FlowTeam, id: string): Player | undefined {
  return team.players.find(p => p.id === id);
}

function attr(team: FlowTeam, id: string, key: keyof PlayerAttributes): number {
  return byId(team, id)?.attributes[key] ?? 50;
}

/** Side-wide mean of an attribute — the resist bar when no single opponent contests
 *  (unmarked delivery, uncovered run). Keeps every check relative to the opposition's
 *  level instead of an absolute constant, so match texture doesn't scale with tier. */
function teamAvg(team: FlowTeam, key: keyof PlayerAttributes): number {
  const ids = Object.keys(team.positions).filter(id => id !== team.gkId);
  if (ids.length === 0) { return 50; }
  return ids.reduce((s, id) => s + attr(team, id, key), 0) / ids.length;
}

function name(team: FlowTeam, id: string): string {
  return byId(team, id)?.name ?? id;
}

/** Outfield ids with live positions (GK excluded). */
function outfieldIds(team: FlowTeam): string[] {
  return Object.keys(team.positions).filter(id => id !== team.gkId);
}

/** The defending outfielder nearest to a point — the duel opponent. */
function nearestDefender(defending: FlowTeam, point: XY): string | null {
  return nearestTo(point, defending.positions, defending.gkId ? new Set([defending.gkId]) : undefined)[0] ?? null;
}

/** Best forward-ish teammate to receive: prefers players ahead of the ball by a
 *  progress-minus-distance score, then samples from viable candidates using softmax
 *  temperature weighting so the ball distributes across the squad rather than always
 *  going to the single highest-scoring player. Returns null if the carrier is alone. */
function pickReceiver(
  attacking: FlowTeam, from: XY, rng: () => number,
  opts?: { advanced?: boolean },
): string | null {
  const carrierY = attackY(from, attacking.side);
  const scored: Array<{ id: string; score: number }> = [];
  for (const id of outfieldIds(attacking)) {
    const pos = attacking.positions[id];
    if (pos === from) { continue; }
    const progress = attackY(pos, attacking.side) - carrierY;
    if (opts?.advanced && progress <= 0.05) { continue; }
    const score = progress - distance(from, pos) * 0.5;
    if (score <= -0.3) { continue; }
    scored.push({ id, score });
  }
  if (scored.length === 0) { return null; }
  const T = 0.3;
  const weights = scored.map(e => Math.exp(e.score / T));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) { return scored[i].id; }
  }
  return scored[scored.length - 1].id;
}

// ── local-numbers modifiers (§6) ─────────────────────────────────────────────────

export interface LocalNumbers {
  /** Flat penalty on the attacker's duel from extra defenders around the ball. */
  secondDefenderPenalty: number;
  /** Flat bonus on a receiver's contest from attacking support in their cell. */
  passTargetBonus: number;
  /** Back-band presence surplus of the defending side (spare-man rule). */
  spareMan: number;
}

export function localNumbers(attacking: FlowTeam, defending: FlowTeam, ballAt: XY): LocalNumbers {
  const atkGrid = projectPresence(attacking.positions);
  const defGrid = projectPresence(defending.positions);
  const cell = cellOf(ballAt);
  const defHere = presenceAt(defGrid, cell);
  const atkHere = presenceAt(atkGrid, cell);
  return {
    secondDefenderPenalty: Math.min(SECOND_DEFENDER_CAP, Math.max(0, defHere - 0.7) * SECOND_DEFENDER_SCALE),
    passTargetBonus: Math.min(PASS_TARGET_CAP, Math.max(0, atkHere - 0.7) * PASS_TARGET_SCALE),
    spareMan: spareManSurplus(defGrid, atkGrid, defending.side),
  };
}

// ── situation chooser (§4b) ──────────────────────────────────────────────────────

export type Situation =
  | 'short_pass' | 'through_ball' | 'long_ball' | 'cross'
  | 'back_pass' | 'progressive_carry' | 'cutback'
  | 'dribble' | 'shot' | 'shield' | 'clear';

/** Per-band multipliers for each situation. Shapes who does what on the pitch. */
const BAND_WEIGHTS: Record<Band, Partial<Record<Situation, number>>> = {
  GK:  { short_pass: 1.5, back_pass: 0,   progressive_carry: 0,   through_ball: 0,   shot: 0,   dribble: 0,   clear: 0.5, cutback: 0   },
  DEF: { short_pass: 1.3, back_pass: 1.2, progressive_carry: 1.8, through_ball: 0.3, shot: 0.15, dribble: 0.4, clear: 1.5, cutback: 0   },
  DM:  { short_pass: 1.2, back_pass: 1.2, progressive_carry: 1.5, through_ball: 0.7, shot: 0.20, dribble: 0.5, clear: 1.0, cutback: 0   },
  MID: { short_pass: 1.0, back_pass: 0.5, progressive_carry: 0.3, through_ball: 1.0, shot: 0.6, dribble: 1.0, clear: 0.5, cutback: 0   },
  AM:  { short_pass: 1.0, back_pass: 0,   progressive_carry: 0,   through_ball: 1.2, shot: 1.2, dribble: 1.3, clear: 0,   cutback: 0.5 },
  ATT: { short_pass: 0.9, back_pass: 0,   progressive_carry: 0,   through_ball: 0.8, shot: 1.5, dribble: 1.4, clear: 0,   cutback: 2.5 },
};

function carrierBand(carrier: Player, team: FlowTeam): Band {
  const fp = team.fieldedPositions?.[carrier.id];
  if (fp && fp in BAND_OF_ROLE) { return BAND_OF_ROLE[fp as keyof typeof BAND_OF_ROLE]; }
  // Fall back to the player's registered position.
  const pos = carrier.position as string;
  if (pos in BAND_OF_ROLE) { return BAND_OF_ROLE[pos as keyof typeof BAND_OF_ROLE]; }
  return 'MID';
}

/** Weighted situation menu for a carrier: geography (where they are), ability (what
 *  they're good at), sliders (directness/shotFrequency), local numbers (an outnumbered
 *  carrier protects the ball), and band (a CB plays out differently to a striker).
 *  Exported for chooser tests. */
export function situationWeights(
  carrier: Player, pos: XY, team: FlowTeam, local: LocalNumbers,
): Record<Situation, number> {
  const y = attackY(pos, team.side);
  const wide = pos.x < 0.22 || pos.x > 0.78;
  const a = carrier.attributes;
  const directness = (team.params.passingRisk ?? 50) / 50;   // 0..2, neutral 1
  const shotFreq = (team.params.shotFrequency ?? 50) / 50;
  const outnumbered = local.secondDefenderPenalty / SECOND_DEFENDER_CAP; // 0..1
  // Skill shapes WHICH option the carrier prefers, never HOW MANY chances a match
  // has: each attribute is read relative to the carrier's own level, so two flat
  // teams pick from the same menu at OVR 25 as at OVR 85 (goal volume stays put
  // and only the duels express quality).
  const mean = Math.max(10, (a.passing + a.technique + a.finishing + a.strength) / 4);
  const rel = (attrValue: number) => attrValue / mean;

  const band = carrierBand(carrier, team);
  const bw = BAND_WEIGHTS[band];
  const bm = (s: Situation, def = 1) => bw[s] ?? def;

  return {
    short_pass: bm('short_pass') * (2.4 * rel(a.passing) * (2 - directness) * 0.5 + 1.2),
    back_pass:  bm('back_pass', 0) * (y < 0.20 ? 1.5 * (2 - directness) : 0),
    through_ball: bm('through_ball') * (y > 0.35 && y < 0.85 ? 0.7 * directness * rel(a.passing) : 0),
    long_ball: y < 0.6 ? 0.5 * directness : 0,
    cross: wide && y > 0.6 ? 0.7 * rel(a.passing) : 0,
    progressive_carry: bm('progressive_carry', 0) * (y < 0.65 ? 1.2 * rel(a.technique) * (1 - directness * 0.3) : 0),
    dribble: bm('dribble') * (0.25 * rel(a.technique) * (0.6 + y * 0.8)),
    cutback: bm('cutback', 0) * (y > 0.88 && (pos.x < 0.18 || pos.x > 0.82) ? 2.0 : 0),
    shot: bm('shot', 0) * (y > SHOT_RANGE_Y
      ? 0.45 * ((y - SHOT_RANGE_Y) / (1 - SHOT_RANGE_Y)) * shotFreq * rel(a.finishing) * (0.45 + 0.55 * directness)
      : 0),
    shield: outnumbered > 0.6 ? 1.2 * outnumbered * rel(a.strength) : 0,
    clear: bm('clear') * (y < 0.25 && outnumbered > 0.4 ? 1.4 * outnumbered : 0),
  };
}

/** One rng draw picks from the weighted menu. */
export function chooseSituation(weights: Record<Situation, number>, rng: () => number): Situation {
  const entries = Object.entries(weights).filter(([, w]) => w > 0) as Array<[Situation, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) { return 'short_pass'; }
  let roll = rng() * total;
  for (const [situation, w] of entries) {
    roll -= w;
    if (roll <= 0) { return situation; }
  }
  return entries[entries.length - 1][0];
}

// ── event helpers ────────────────────────────────────────────────────────────────

function duelMeta(outcome: DuelOutcome, winnerSide: Side, winnerId: string, loserId: string) {
  return {
    duel: {
      duelType: outcome.spec.type,
      winnerSide, winnerId, loserId,
      margin: Math.round(Math.abs(outcome.margin) * 100) / 100,
    },
  };
}

/** The defender-credited event for a failed contested action, carrying the stats
 *  metadata (contestedAction/attackingTeam/attackerId — see stats.ts). */
function turnoverEvent(
  type: EventType, defending: FlowTeam, defenderId: string, description: string,
  attacking: FlowTeam, attackerId: string, contestedAction: Situation | 'short_pass' | 'long_pass',
  outcome?: DuelOutcome,
): FlowEvent {
  return {
    type, team: defending.side, playerId: defenderId, description,
    metadata: {
      contestedAction, attackingTeam: attacking.side, attackerId,
      ...(outcome ? duelMeta(outcome, defending.side, defenderId, attackerId) : {}),
    },
  };
}

// ── chain resolution ─────────────────────────────────────────────────────────────

interface Ctx {
  attacking: FlowTeam;
  defending: FlowTeam;
  rng: () => number;
  events: FlowEvent[];
}

/** Shot-duel bonus from momentum + the chanceQuality slider (home advantage). */
function shotBonus(team: FlowTeam): number {
  return team.momentum * MOMENTUM_SHOT_SCALE
    + ((team.params.chanceQuality ?? 50) - 50) * CHANCE_QUALITY_SHOT_SCALE;
}

/** Shot duel → shot event + chained goal/save/off-target result. `aerial` tags headers
 *  for the injury system. */
function resolveShot(
  ctx: Ctx, shooterId: string, opts?: { spec?: DuelSpec; bonus?: number; aerial?: boolean; label?: string },
): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const gkId = defending.gkId;
  const goalkeeping = gkId ? attr(defending, gkId, 'goalkeeping') : 25;
  const spec = opts?.spec ?? SHOT_DUEL;
  const finishing = spec === PENALTY_DUEL
    ? (attr(attacking, shooterId, 'finishing') + attr(attacking, shooterId, 'technique')) / 2
    : attr(attacking, shooterId, 'finishing');
  const bonus = (opts?.bonus ?? 0) + shotBonus(attacking);
  const outcome = resolveDuel(finishing, goalkeeping, spec, rng, { bonus });
  const shooter = name(attacking, shooterId);
  const label = opts?.label ?? 'shot';

  events.push({
    type: 'shot', team: attacking.side, playerId: shooterId,
    description: `${shooter} lines up a ${label}`,
    metadata: {
      ...(opts?.aerial ? { aerial: true } : {}),
      ...(gkId ? duelMeta(
        outcome,
        outcome.attackerWins ? attacking.side : defending.side,
        outcome.attackerWins ? shooterId : gkId,
        outcome.attackerWins ? gkId : shooterId,
      ) : {}),
    },
  });

  if (outcome.attackerWins) {
    events.push({
      type: 'goal', team: attacking.side, playerId: shooterId,
      description: opts?.aerial
        ? `GOAL! ${shooter} heads it past the keeper`
        : `GOAL! ${shooter} beats the keeper`,
      ...(opts?.aerial ? { metadata: { aerial: true } } : {}),
    });
    return { events, ball: kickoffBall(ctx.defending), goal: attacking.side };
  }

  // Saved or off target: a big keeper margin is a clean catch, a scramble may go out
  // for a corner, otherwise the keeper has it.
  const saved = gkId && outcome.margin > -0.3;
  if (saved) {
    events.push({
      type: 'save', team: defending.side, playerId: gkId,
      description: `${name(defending, gkId)} saves the ${label} from ${shooter}`,
    });
    // D7: narrow save (keeper barely got there) — ball spills loose for a scramble.
    // REBOUND_CHANCE gates frequency; rebound lands at the edge of the six-yard box
    // so defenders can contest rather than the attacker collecting unopposed.
    if (outcome.margin < -0.1 && rng() < REBOUND_CHANCE) {
      events.push({
        type: 'rebound', team: attacking.side,
        description: `${name(defending, gkId)} can't hold it — rebound!`,
      });
      const reboundAt = { x: 0.5, y: attacking.side === 'home' ? 0.88 : 0.12 };
      return resolveLooseBall(ctx, reboundAt, { includeGk: true });
    }
    if (rng() < CORNER_CHANCE_ON_SAVE) { return resolveCorner(ctx); }
    return { events, ball: { mode: 'carried', side: defending.side, carrierId: gkId } };
  }
  // Off target: goal kick — the keeper restarts.
  if (gkId) { return { events, ball: { mode: 'carried', side: defending.side, carrierId: gkId } }; }
  return { events, ball: { mode: 'free', at: goalPoint(attacking.side) } };
}

/** After a goal: the conceding side kicks off from the centre spot. */
function kickoffBall(conceding: FlowTeam): BallState {
  const centre = { x: 0.5, y: 0.5 };
  const carrierId = nearestTo(centre, conceding.positions, conceding.gkId ? new Set([conceding.gkId]) : undefined)[0]
    ?? conceding.gkId ?? Object.keys(conceding.positions)[0];
  return { mode: 'carried', side: conceding.side, carrierId };
}

/** Emergent foul after a badly lost strength/dribble duel (§4). Returns the follow-up
 *  (free kick / penalty) or null when no foul was committed. */
function maybeFoul(ctx: Ctx, outcome: DuelOutcome, carrierId: string, defenderId: string, at: XY): FlowTickResult | null {
  const { attacking, defending, rng, events } = ctx;
  const p = foulChance(outcome);
  if (p <= 0 || rng() >= p) { return null; }

  events.push({
    type: 'foul', team: defending.side, playerId: defenderId,
    description: `${name(defending, defenderId)} brings down ${name(attacking, carrierId)}`,
    metadata: { attackerId: carrierId, ...duelMeta(outcome, attacking.side, carrierId, defenderId) },
  });

  // Yellow first. Already-booked players are more cautious — reduced chance.
  const alreadyBooked = ctx.defending.bookedPlayers?.has(defenderId) ?? false;
  const yellowP = alreadyBooked ? YELLOW_CHANCE * YELLOW_SECOND_BOOKING_MODIFIER : YELLOW_CHANCE;
  if (rng() < yellowP) {
    events.push({
      type: 'yellow_card', team: defending.side, playerId: defenderId,
      description: `${name(defending, defenderId)} is booked`,
    });
  }
  // Red upgrade: only when the defender was badly beaten — replaces rather than stacks.
  if (outcome.margin > RED_MARGIN && rng() < RED_CHANCE) {
    events.push({
      type: 'red_card', team: defending.side, playerId: defenderId,
      description: `RED CARD! ${name(defending, defenderId)} is sent off`,
    });
  }

  const y = attackY(at, attacking.side);
  const inBox = y > 0.83 && at.x > 0.25 && at.x < 0.75;
  if (inBox) { return resolvePenalty(ctx, carrierId); }
  return resolveFreeKick(ctx, carrierId, at);
}

/** Last-man professional foul (§4): a cover defender beaten in a speed race in the
 *  final band with no spare man behind him may cynically haul the runner down —
 *  a card is certain (red likely), and the attack restarts as a penalty/free kick. */
function maybeLastManFoul(
  ctx: Ctx, race: DuelOutcome, runnerId: string, coverId: string, at: XY, spareMan: number,
): FlowTickResult | null {
  const { attacking, defending, rng, events } = ctx;
  if (attackY(at, attacking.side) < LAST_MAN_Y || spareMan > 0) { return null; }
  const p = lastManFoulChance(race);
  if (p <= 0 || rng() >= p) { return null; }

  events.push({
    type: 'foul', team: defending.side, playerId: coverId,
    description: `${name(defending, coverId)} hauls down ${name(attacking, runnerId)} — the last man!`,
    metadata: { attackerId: runnerId, ...duelMeta(race, attacking.side, runnerId, coverId) },
  });
  if (rng() < PRO_FOUL_RED_CHANCE) {
    events.push({
      type: 'red_card', team: defending.side, playerId: coverId,
      description: `RED CARD! ${name(defending, coverId)} is sent off for denying a clear chance`,
    });
  } else {
    events.push({
      type: 'yellow_card', team: defending.side, playerId: coverId,
      description: `${name(defending, coverId)} is booked for the professional foul`,
    });
  }

  const y = attackY(at, attacking.side);
  const inBox = y > 0.83 && at.x > 0.25 && at.x < 0.75;
  if (inBox) { return resolvePenalty(ctx, runnerId); }
  return resolveFreeKick(ctx, runnerId, at);
}

function resolvePenalty(ctx: Ctx, fouledId: string): FlowTickResult {
  const { attacking, events } = ctx;
  // Best (finishing+technique)/2 among the outfielders takes it.
  const takerId = outfieldIds(attacking).reduce((best, id) => {
    const v = (attr(attacking, id, 'finishing') + attr(attacking, id, 'technique')) / 2;
    const bv = (attr(attacking, best, 'finishing') + attr(attacking, best, 'technique')) / 2;
    return v > bv ? id : best;
  }, fouledId);
  events.push({
    type: 'penalty', team: attacking.side, playerId: takerId,
    description: `Penalty to ${attacking.side === 'home' ? 'the home side' : 'the away side'} — ${name(attacking, takerId)} steps up`,
  });
  return resolveShot(ctx, takerId, { spec: PENALTY_DUEL, label: 'penalty' });
}

function resolveFreeKick(ctx: Ctx, fouledId: string, at: XY): FlowTickResult {
  const { attacking, events } = ctx;
  const y = attackY(at, attacking.side);
  const central = at.x > 0.3 && at.x < 0.7;
  events.push({
    type: 'free_kick', team: attacking.side, playerId: fouledId,
    description: `Free kick to ${name(attacking, fouledId)}'s side`,
  });
  if (y > 0.72 && central) {
    // Direct: shot duel against the wall.
    const takerId = bestBy(attacking, p => (p.attributes.finishing + p.attributes.technique) / 2);
    return resolveShot(ctx, takerId, { bonus: -WALL_PENALTY, label: 'free kick' });
  }
  if (y > 0.6) {
    // Wide/advanced: a set-piece delivery into the box (= cross chain with a bonus).
    return resolveDeliveryIntoBox(ctx, bestBy(attacking, p => p.attributes.passing), SET_PIECE_DELIVERY, 'free kick');
  }
  // Deep free kick: cheap restart, fouled player keeps the ball where it was.
  return { events, ball: { mode: 'carried', side: attacking.side, carrierId: fouledId } };
}

function bestBy(team: FlowTeam, score: (p: Player) => number): string {
  const ids = outfieldIds(team);
  return ids.reduce((best, id) => {
    const p = byId(team, id), b = byId(team, best);
    return p && b && score(p) > score(b) ? id : best;
  }, ids[0]);
}

function resolveCorner(ctx: Ctx): FlowTickResult {
  const { attacking, events } = ctx;
  const takerId = bestBy(attacking, p => p.attributes.passing);
  events.push({
    type: 'corner', team: attacking.side, playerId: takerId,
    description: `Corner, taken by ${name(attacking, takerId)}`,
  });
  return resolveDeliveryIntoBox(ctx, takerId, SET_PIECE_DELIVERY, 'corner');
}

/** Shared chain for crosses, corners, attacking free kicks and long throws: delivery
 *  check → strength duel in the box (GK may claim a poor ball) → header shot or
 *  clearance. `deliverySkill` defaults to the deliverer's Passing (a long throw
 *  checks Strength instead); the deliverer can't be his own aerial target. */
function resolveDeliveryIntoBox(
  ctx: Ctx, deliverId: string, spec: DeliverySpec, label: string, deliverySkill?: number,
): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const boxPoint = carryForward(goalPoint(attacking.side), attacking.side, -0.08); // just in front of goal
  const targetId = bestBy(attacking, p => (p.id === deliverId ? -Infinity : p.attributes.strength));
  const markerId = nearestDefender(defending, boxPoint);
  // The marker reads the flighted ball: delivery quality is relative to his
  // Defending (a spec anchor — the long throw's fixed bar — wins if set).
  const resist = spec.anchor ?? (markerId ? attr(defending, markerId, 'defending') : teamAvg(defending, 'defending'));
  const delivery = deliveryCheck(deliverySkill ?? attr(attacking, deliverId, 'passing'), spec, rng, resist);

  if (!delivery.onTarget) {
    // A poor ball: the keeper claims or it runs loose.
    if (defending.gkId && delivery.margin > -0.25) {
      events.push({
        type: 'gk_claim', team: defending.side, playerId: defending.gkId,
        description: `${name(defending, defending.gkId)} claims the ${label}`,
      });
      return { events, ball: { mode: 'carried', side: defending.side, carrierId: defending.gkId } };
    }
    return { events, ball: { mode: 'free', at: boxPoint } };
  }

  // Aerial strength duel in the box.
  const outcome = resolveDuel(
    attr(attacking, targetId, 'strength'),
    markerId ? attr(defending, markerId, 'strength') : teamAvg(defending, 'strength'),
    STRENGTH_DUEL, rng, { bonus: deliveryBonus(delivery) },
  );
  if (outcome.attackerWins) {
    return resolveShot(ctx, targetId, { aerial: true, label: `header from the ${label}` });
  }
  const clearerId = markerId ?? defending.gkId ?? '';
  events.push({
    type: 'clearance', team: defending.side, playerId: clearerId,
    description: `${name(defending, clearerId)} heads the ${label} clear`,
    metadata: duelMeta(outcome, defending.side, clearerId, targetId),
  });
  if (rng() < CORNER_CHANCE_ON_CLEARANCE) { return resolveCorner(ctx); }
  return { events, ball: { mode: 'free', at: carryForward(boxPoint, defending.side, 0.2) } };
}

// ── situation resolvers ──────────────────────────────────────────────────────────

function resolveShortPass(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const from = attacking.positions[carrierId];
  const receiverId = pickReceiver(attacking, from, rng);
  if (!receiverId) { return resolveDribble(ctx, carrierId); }
  const to = attacking.positions[receiverId];
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const readerId = nearestDefender(defending, midpoint);
  const local = localNumbers(attacking, defending, to);
  const outcome = resolveDuel(
    attr(attacking, carrierId, 'passing'),
    readerId ? attr(defending, readerId, 'defending') : 20,
    PASS_DUEL, rng, { bonus: local.passTargetBonus - local.secondDefenderPenalty },
  );
  if (outcome.attackerWins) {
    events.push({
      type: 'short_pass', team: attacking.side, playerId: carrierId,
      description: `${name(attacking, carrierId)} finds ${name(attacking, receiverId)}`,
      metadata: { receiverId, ...(readerId ? duelMeta(outcome, attacking.side, carrierId, readerId) : {}) },
    });
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId: receiverId } };
  }
  // D1: narrow interception — the ball breaks loose rather than going cleanly to the reader
  if (outcome.margin > -0.3) {
    events.push({
      type: 'loose_ball', team: attacking.side, playerId: carrierId,
      description: `The pass from ${name(attacking, carrierId)} breaks loose`,
      metadata: { contestedAction: 'short_pass', attackingTeam: attacking.side, attackerId: carrierId },
    });
    return resolveLooseBall(ctx, midpoint);
  }
  const reader = readerId ?? defending.gkId ?? '';
  events.push(turnoverEvent(
    'interception', defending, reader,
    `${name(defending, reader)} reads the pass and cuts it out`,
    attacking, carrierId, 'short_pass', outcome,
  ));
  return { events, ball: { mode: 'carried', side: defending.side, carrierId: reader } };
}

function resolveThroughBall(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const from = attacking.positions[carrierId];
  const runnerId = pickReceiver(attacking, from, rng, { advanced: true })
    ?? pickReceiver(attacking, from, rng);
  if (!runnerId) { return resolveDribble(ctx, carrierId); }

  const target = carryForward(attacking.positions[runnerId], attacking.side, 0.15);
  const readerId = nearestDefender(defending, target);
  const delivery = deliveryCheck(
    attr(attacking, carrierId, 'passing'), THROUGH_BALL_DELIVERY, rng,
    readerId ? attr(defending, readerId, 'defending') : teamAvg(defending, 'defending'),
  );
  if (!delivery.onTarget && delivery.margin < -0.2) {
    // Overhit: runs through to the keeper or loose.
    if (defending.gkId) {
      events.push({
        type: 'interception', team: defending.side, playerId: defending.gkId,
        description: `${name(defending, defending.gkId)} gathers the overhit through ball`,
        metadata: { contestedAction: 'through_ball', attackingTeam: attacking.side, attackerId: carrierId },
      });
      return { events, ball: { mode: 'carried', side: defending.side, carrierId: defending.gkId } };
    }
    return { events, ball: { mode: 'free', at: target } };
  }

  // The race: runner vs covering defender; the spare-man rule keeps a back-band
  // surplus defender always eligible (a thin back line hands the runner a bonus).
  const coverId = nearestDefender(defending, target);
  const local = localNumbers(attacking, defending, target);
  const spareBonus = local.spareMan < 0 ? SPARE_MAN_BONUS : 0;
  const outcome = resolveDuel(
    attr(attacking, runnerId, 'speed'),
    coverId ? attr(defending, coverId, 'speed') : teamAvg(defending, 'speed'),
    SPEED_DUEL, rng, { bonus: deliveryBonus(delivery) + spareBonus },
  );

  if (!outcome.attackerWins) {
    // D1: narrow race loss — the ball bobbles through loosely
    if (outcome.margin > -0.3) {
      events.push({
        type: 'loose_ball', team: attacking.side, playerId: carrierId,
        description: `The through ball breaks loose`,
        metadata: { contestedAction: 'through_ball', attackingTeam: attacking.side, attackerId: carrierId },
      });
      return resolveLooseBall(ctx, target);
    }
    const cover = coverId ?? defending.gkId ?? '';
    events.push(turnoverEvent(
      'interception', defending, cover,
      `${name(defending, cover)} gets across to cut out the through ball`,
      attacking, carrierId, 'through_ball', outcome,
    ));
    return { events, ball: { mode: 'carried', side: defending.side, carrierId: cover } };
  }

  if (escalates(outcome) && coverId) {
    // Narrow race win → it gets physical.
    const strength = resolveDuel(
      attr(attacking, runnerId, 'strength'), attr(defending, coverId, 'strength'),
      STRENGTH_DUEL, rng,
    );
    if (!strength.attackerWins) {
      events.push(turnoverEvent(
        'tackle', defending, coverId,
        `${name(defending, coverId)} muscles ${name(attacking, runnerId)} off the ball`,
        attacking, carrierId, 'through_ball', strength,
      ));
      return { events, ball: { mode: 'carried', side: defending.side, carrierId: coverId } };
    }
    // Won the shoulder battle — a beaten defender may foul.
    const foul = maybeFoul(ctx, strength, runnerId, coverId, target);
    if (foul) { return foul; }
  }

  // The runner is through: a beaten last man may choose the professional foul.
  if (coverId) {
    const proFoul = maybeLastManFoul(ctx, outcome, runnerId, coverId, target, local.spareMan);
    if (proFoul) { return proFoul; }
  }

  events.push({
    type: 'through_ball', team: attacking.side, playerId: carrierId,
    description: `${name(attacking, carrierId)} slides ${name(attacking, runnerId)} through${coverId ? ` past ${name(defending, coverId)}` : ''}`,
    metadata: { receiverId: runnerId, ...(coverId ? duelMeta(outcome, attacking.side, runnerId, coverId) : {}) },
  });
  attacking.positions[runnerId] = target;
  if (coverId) { defending.positions[coverId] = carryForward(target, attacking.side, -0.05); }
  return { events, ball: { mode: 'carried', side: attacking.side, carrierId: runnerId } };
}

function resolveLongBall(ctx: Ctx, carrierId: string, opts?: { deliverySkill?: number }): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const targetId = bestBy(attacking, p => p.attributes.strength);
  const landing = carryForward(attacking.positions[targetId], attacking.side, 0.05);
  const readerId = nearestDefender(defending, landing);
  const delivery = deliveryCheck(
    opts?.deliverySkill ?? attr(attacking, carrierId, 'passing'), LONG_BALL_DELIVERY, rng,
    readerId ? attr(defending, readerId, 'defending') : teamAvg(defending, 'defending'),
  );
  if (!delivery.onTarget) {
    if (delivery.margin < -0.2) {
      // Badly overhit — clean interception
      events.push(turnoverEvent(
        'interception', defending, nearestDefender(defending, landing) ?? defending.gkId ?? '',
        'The long ball sails through to the defence',
        attacking, carrierId, 'long_pass',
      ));
      const takerId = nearestDefender(defending, landing) ?? defending.gkId ?? '';
      return { events, ball: { mode: 'carried', side: defending.side, carrierId: takerId } };
    }
    // D1: narrow miss — loose ball in the landing zone
    events.push({
      type: 'loose_ball', team: attacking.side, playerId: carrierId,
      description: `The long ball drops loose in midfield`,
      metadata: { contestedAction: 'long_pass', attackingTeam: attacking.side, attackerId: carrierId },
    });
    return resolveLooseBall(ctx, landing);
  }
  const markerId = nearestDefender(defending, landing);
  const outcome = resolveDuel(
    attr(attacking, targetId, 'strength'),
    markerId ? attr(defending, markerId, 'strength') : teamAvg(defending, 'strength'),
    STRENGTH_DUEL, rng, { bonus: deliveryBonus(delivery) },
  );
  if (outcome.attackerWins) {
    events.push({
      type: 'long_pass', team: attacking.side, playerId: carrierId,
      description: `${name(attacking, carrierId)} launches it long — ${name(attacking, targetId)} wins the header`,
      metadata: { receiverId: targetId, ...(markerId ? duelMeta(outcome, attacking.side, targetId, markerId) : {}) },
    });
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId: targetId } };
  }
  // The marker heads it away — second ball (§4: loser's side contests via speed duel).
  const marker = markerId ?? defending.gkId ?? '';
  events.push(turnoverEvent(
    'clearance', defending, marker,
    `${name(defending, marker)} rises highest and heads the long ball away`,
    attacking, carrierId, 'long_pass', outcome,
  ));
  return resolveLooseBall(ctx, carryForward(landing, defending.side, 0.12));
}

function resolveCross(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, events } = ctx;
  events.push({
    type: 'cross', team: attacking.side, playerId: carrierId,
    description: `${name(attacking, carrierId)} swings a cross into the box`,
  });
  return resolveDeliveryIntoBox(ctx, carrierId, CROSS_DELIVERY, 'cross');
}

function resolveDribble(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const at = attacking.positions[carrierId];
  const defenderId = nearestDefender(defending, at);
  if (!defenderId) {
    // Nobody home: carry forward unopposed.
    attacking.positions[carrierId] = carryForward(at, attacking.side, CARRY_DISTANCE);
    events.push({
      type: 'dribble', team: attacking.side, playerId: carrierId,
      description: `${name(attacking, carrierId)} drives forward into space`,
    });
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId } };
  }

  const local = localNumbers(attacking, defending, at);
  const outcome = resolveDuel(
    attr(attacking, carrierId, 'technique'),
    attr(defending, defenderId, 'defending'),
    DRIBBLE_DUEL, rng, { bonus: -local.secondDefenderPenalty },
  );

  if (!outcome.attackerWins) {
    // Tackled. Near a touchline it goes out for a throw-in instead of a clean turnover.
    const nearTouch = at.x < 0.06 || at.x > 0.94;
    events.push(turnoverEvent(
      'tackle', defending, defenderId,
      `${name(defending, defenderId)} times the tackle on ${name(attacking, carrierId)}`,
      attacking, carrierId, 'dribble', outcome,
    ));
    if (nearTouch && rng() < 0.25) {
      // ~25% of touchline tackles send the ball out of play; the rest stay in.
      // In the final third a strong enough taker launches it into the box (§4);
      // otherwise it's a cheap quick restart.
      const throwerId = bestBy(attacking, p => p.attributes.strength);
      if (attackY(at, attacking.side) > SHOT_RANGE_Y
        && attr(attacking, throwerId, 'strength') >= LONG_THROW_MIN_STRENGTH
        && rng() < longThrowChance(attr(attacking, throwerId, 'strength'))) {
        events.push({
          type: 'throw_in', team: attacking.side, playerId: throwerId,
          description: `${name(attacking, throwerId)} launches a long throw into the box`,
        });
        return resolveDeliveryIntoBox(
          ctx, throwerId, LONG_THROW_DELIVERY, 'long throw', attr(attacking, throwerId, 'strength'),
        );
      }
      const takerId = pickReceiver(attacking, at, rng) ?? carrierId;
      events.push({
        type: 'throw_in', team: attacking.side, playerId: takerId,
        description: `Out for a throw-in — ${name(attacking, takerId)} takes it quickly`,
      });
      return { events, ball: { mode: 'carried', side: attacking.side, carrierId: takerId } };
    }
    return { events, ball: { mode: 'carried', side: defending.side, carrierId: defenderId } };
  }

  // The beaten defender may lunge (emergent foul), then escalation: a narrow win
  // means he recovers enough to make it physical.
  const foul = maybeFoul(ctx, outcome, carrierId, defenderId, at);
  if (foul) { return foul; }

  if (escalates(outcome)) {
    const strength = resolveDuel(
      attr(attacking, carrierId, 'strength'), attr(defending, defenderId, 'strength'),
      STRENGTH_DUEL, rng,
    );
    if (!strength.attackerWins) {
      events.push(turnoverEvent(
        'tackle', defending, defenderId,
        `${name(defending, defenderId)} recovers and shoulders ${name(attacking, carrierId)} off it`,
        attacking, carrierId, 'dribble', strength,
      ));
      return { events, ball: { mode: 'carried', side: defending.side, carrierId: defenderId } };
    }
    const lateFoul = maybeFoul(ctx, strength, carrierId, defenderId, at);
    if (lateFoul) { return lateFoul; }
  }

  attacking.positions[carrierId] = carryForward(at, attacking.side, CARRY_DISTANCE);
  defending.positions[defenderId] = carryForward(at, attacking.side, -0.03); // beaten, behind the play
  events.push({
    type: 'dribble', team: attacking.side, playerId: carrierId,
    description: `${name(attacking, carrierId)} skips past ${name(defending, defenderId)}`,
    metadata: duelMeta(outcome, attacking.side, carrierId, defenderId),
  });
  return { events, ball: { mode: 'carried', side: attacking.side, carrierId } };
}

function resolveShield(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const at = attacking.positions[carrierId];
  const defenderId = nearestDefender(defending, at);
  if (!defenderId) { return resolveDribble(ctx, carrierId); }
  const outcome = resolveDuel(
    attr(attacking, carrierId, 'strength'), attr(defending, defenderId, 'strength'),
    STRENGTH_DUEL, rng,
  );
  if (outcome.attackerWins) {
    const foul = maybeFoul(ctx, outcome, carrierId, defenderId, at);
    if (foul) { return foul; }
    // Held it up — buys transition time; the ball stays with the carrier (no event:
    // shielding is invisible in the ticker unless it produces a foul or turnover).
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId } };
  }
  events.push(turnoverEvent(
    'tackle', defending, defenderId,
    `${name(defending, defenderId)} strips ${name(attacking, carrierId)} of the ball`,
    attacking, carrierId, 'dribble', outcome,
  ));
  return { events, ball: { mode: 'carried', side: defending.side, carrierId: defenderId } };
}

function resolveClear(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, rng, events } = ctx;
  const at = attacking.positions[carrierId];
  // A Defending check (§4): margin decides a controlled clearance vs a loose hack.
  const chance = Math.max(0.2, Math.min(0.95, 0.5 + (attr(attacking, carrierId, 'defending') - 50) / 80));
  const controlled = rng() < chance;
  events.push({
    type: 'clearance', team: attacking.side, playerId: carrierId,
    description: controlled
      ? `${name(attacking, carrierId)} clears his lines`
      : `${name(attacking, carrierId)} hacks it away under pressure`,
  });
  // The loose-ball race below reads both sides symmetrically, so no possession flip
  // is needed for the cleared ball.
  const landing = carryForward(at, attacking.side, controlled ? 0.35 : 0.2);
  return resolveLooseBall(ctx, landing);
}

/** Free-ball pickup (§4b): a speed race between the nearest player of each side,
 *  escalating to strength on a narrow win. */
export function resolveLooseBall(ctx: Ctx, at: XY, opts?: { includeGk?: boolean }): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const atkId = nearestTo(at, attacking.positions, attacking.gkId ? new Set([attacking.gkId]) : undefined)[0];
  const defExclude = (!opts?.includeGk && defending.gkId) ? new Set([defending.gkId]) : undefined;
  const defId = nearestTo(at, defending.positions, defExclude)[0];
  if (!atkId && !defId) { return { events, ball: { mode: 'free', at } }; }
  if (!atkId || !defId) {
    const team = atkId ? attacking : defending;
    const id = (atkId ?? defId)!;
    team.positions[id] = { ...at };
    return { events, ball: { mode: 'carried', side: team.side, carrierId: id } };
  }

  // Closer player gets a head start proportional to the distance gap.
  const gap = distance(defending.positions[defId], at) - distance(attacking.positions[atkId], at);
  const outcome = resolveDuel(
    attr(attacking, atkId, 'speed'), attr(defending, defId, 'speed'),
    SPEED_DUEL, rng, { bonus: Math.max(-0.25, Math.min(0.25, gap * 1.2)) },
  );

  let winner = outcome.attackerWins ? attacking : defending;
  let winnerId = outcome.attackerWins ? atkId : defId;
  if (escalates(outcome)) {
    const strength = resolveDuel(
      attr(attacking, atkId, 'strength'), attr(defending, defId, 'strength'),
      STRENGTH_DUEL, rng,
    );
    winner = strength.attackerWins ? attacking : defending;
    winnerId = strength.attackerWins ? atkId : defId;
  }
  winner.positions[winnerId] = { ...at };
  return { events, ball: { mode: 'carried', side: winner.side, carrierId: winnerId } };
}

/** Back pass: carrier plays the ball backward to the GK or the deepest available
 *  teammate. Very low resistance — almost always succeeds unless under extreme pressure. */
function resolveBackPass(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const from = attacking.positions[carrierId];
  const carrierY = attackY(from, attacking.side);

  // Target: prefer GK; otherwise the deepest outfield player behind the carrier.
  let targetId: string | null = attacking.gkId ?? null;
  if (!targetId || targetId === carrierId) {
    let bestY = Infinity;
    for (const id of outfieldIds(attacking)) {
      if (id === carrierId) { continue; }
      const y = attackY(attacking.positions[id], attacking.side);
      if (y < carrierY && y < bestY) { bestY = y; targetId = id; }
    }
  }
  if (!targetId) { return resolveShortPass(ctx, carrierId); }

  // Nearest defender to the passing lane — back passes are still intercept-able.
  const to = attacking.positions[targetId];
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const readerId = nearestDefender(defending, midpoint);
  // Low resist (25) — this is a routine ball; only heavy pressure intercepts it.
  const outcome = resolveDuel(
    attr(attacking, carrierId, 'passing'),
    readerId ? attr(defending, readerId, 'defending') * 0.4 : 25,
    PASS_DUEL, rng,
  );
  if (outcome.attackerWins) {
    events.push({
      type: 'back_pass', team: attacking.side, playerId: carrierId,
      description: `${name(attacking, carrierId)} plays it back to ${name(attacking, targetId)}`,
      metadata: { receiverId: targetId },
    });
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId: targetId } };
  }
  const reader = readerId ?? defending.gkId ?? '';
  events.push(turnoverEvent(
    'interception', defending, reader,
    `${name(defending, reader)} pounces on the sloppy back pass`,
    attacking, carrierId, 'back_pass', outcome,
  ));
  return { events, ball: { mode: 'carried', side: defending.side, carrierId: reader } };
}

/** Progressive carry: a defender or DM drives forward with the ball into space.
 *  Single duel: (technique + speed bonus) vs the nearest opponent ahead.
 *  Win → carrier advances; lose → loose ball at the carry point. */
function resolveProgressiveCarry(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const at = attacking.positions[carrierId];
  const target = carryForward(at, attacking.side, 0.18);

  const potentialDefId = nearestDefender(defending, target);
  // Only contest carries when a defender is actually close enough to challenge.
  const defenderId = potentialDefId && distance(defending.positions[potentialDefId], target) < 0.35
    ? potentialDefId : null;
  if (!defenderId) {
    // No opposition ahead — free run forward.
    attacking.positions[carrierId] = target;
    events.push({
      type: 'progressive_carry', team: attacking.side, playerId: carrierId,
      description: `${name(attacking, carrierId)} drives forward into space`,
    });
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId } };
  }

  // Single duel: technique + speed bonus vs defender's defending.
  const attackerSkill = attr(attacking, carrierId, 'technique')
    + attr(attacking, carrierId, 'speed') * 0.3;
  const outcome = resolveDuel(attackerSkill, attr(defending, defenderId, 'defending'), DRIBBLE_DUEL, rng);

  if (outcome.attackerWins) {
    const foul = maybeFoul(ctx, outcome, carrierId, defenderId, at);
    if (foul) { return foul; }
    attacking.positions[carrierId] = target;
    defending.positions[defenderId] = carryForward(at, attacking.side, -0.03);
    events.push({
      type: 'progressive_carry', team: attacking.side, playerId: carrierId,
      description: `${name(attacking, carrierId)} carries past ${name(defending, defenderId)} into midfield`,
      metadata: duelMeta(outcome, attacking.side, carrierId, defenderId),
    });
    return { events, ball: { mode: 'carried', side: attacking.side, carrierId } };
  }

  const foul = maybeFoul(ctx, outcome, carrierId, defenderId, at);
  if (foul) { return foul; }
  events.push(turnoverEvent(
    'tackle', defending, defenderId,
    `${name(defending, defenderId)} stops ${name(attacking, carrierId)}'s run`,
    attacking, carrierId, 'progressive_carry', outcome,
  ));
  return resolveLooseBall(ctx, at);
}

/** Cutback from near the byline: deliver to an infield runner for a first-time finish.
 *  Uses passing+technique blend for delivery; on target → technique vs keeper (DRIBBLE_DUEL
 *  — harder than a normal shot, but keeper is stretched). */
function resolveCutback(ctx: Ctx, carrierId: string): FlowTickResult {
  const { attacking, defending, rng, events } = ctx;
  const from = attacking.positions[carrierId];
  const receiverId = pickReceiver(attacking, from, rng);
  if (!receiverId) { return resolveCross(ctx, carrierId); }
  const to = attacking.positions[receiverId];
  const readerId = nearestDefender(defending, to);
  const deliveryAttr = (attr(attacking, carrierId, 'passing') + attr(attacking, carrierId, 'technique')) / 2;
  const outcome = resolveDuel(
    deliveryAttr,
    readerId ? attr(defending, readerId, 'defending') : 25,
    PASS_DUEL, rng,
  );
  if (!outcome.attackerWins) {
    const reader = readerId ?? defending.gkId ?? '';
    events.push(turnoverEvent(
      'interception', defending, reader,
      `The cutback from ${name(attacking, carrierId)} is cut out`,
      attacking, carrierId, 'cutback', outcome,
    ));
    if (rng() < CORNER_CHANCE_ON_CLEARANCE) { return resolveCorner(ctx); }
    return { events, ball: { mode: 'carried', side: defending.side, carrierId: reader } };
  }
  events.push({
    type: 'cutback', team: attacking.side, playerId: carrierId,
    description: `${name(attacking, carrierId)} cuts it back to ${name(attacking, receiverId)}`,
    metadata: { receiverId },
  });
  attacking.positions[receiverId] = { ...to };
  // First-time finish: DRIBBLE_DUEL vs keeper (keeper is stretched, different angle)
  return resolveShot(ctx, receiverId, { spec: DRIBBLE_DUEL, label: 'first-time finish' });
}

// ── the flow tick ────────────────────────────────────────────────────────────────

const RESOLVERS: Record<Situation, (ctx: Ctx, carrierId: string) => FlowTickResult> = {
  short_pass: resolveShortPass,
  through_ball: resolveThroughBall,
  long_ball: resolveLongBall,
  cross: resolveCross,
  back_pass: resolveBackPass,
  progressive_carry: resolveProgressiveCarry,
  cutback: resolveCutback,
  dribble: resolveDribble,
  shot: (ctx, id) => {
    const { attacking, defending, rng, events } = ctx;
    const at = attacking.positions[id];
    const goal = goalPoint(attacking.side);

    // D2: blocked shot — nearest outfield defender in the shooting lane gets a block attempt
    const blockerId = nearestDefender(defending, at);
    if (blockerId) {
      const bPos = defending.positions[blockerId];
      const inLane = linePointDistance(at, goal, bPos) < 0.1;
      const betweenShooterAndGoal = distance(bPos, goal) < distance(at, goal);
      if (inLane && betweenShooterAndGoal) {
        const blockOutcome = resolveDuel(
          attr(defending, blockerId, 'technique'),
          attr(attacking, id, 'finishing'),
          DRIBBLE_DUEL, rng,
        );
        if (blockOutcome.attackerWins) {
          events.push({
            type: 'blocked_shot', team: defending.side, playerId: blockerId,
            description: `${name(defending, blockerId)} blocks the shot`,
            metadata: duelMeta(blockOutcome, defending.side, blockerId, id),
          });
          if (rng() < CORNER_CHANCE_ON_CLEARANCE) { return resolveCorner(ctx); }
          return { events, ball: { mode: 'free', at: carryForward(at, defending.side, 0.05) } };
        }
      }
    }

    // D6: long shot distance penalty when outside the box
    const yAttack = attackY(at, attacking.side);
    const isLongShot = yAttack < 0.83;
    return resolveShot(ctx, id, isLongShot ? { bonus: -0.08, label: 'long shot' } : undefined);
  },
  shield: resolveShield,
  clear: resolveClear,
};

/** Resolve one named situation's duel chain directly (the chooser bypassed) —
 *  exported so chain tests can script every rng draw without steering the chooser. */
export function resolveSituation(
  situation: Situation, attacking: FlowTeam, defending: FlowTeam, carrierId: string, rng: () => number,
): FlowTickResult {
  return RESOLVERS[situation]({ attacking, defending, rng, events: [] }, carrierId);
}

/** One flow tick: resolve a free ball, or let the carrier act. `home`/`away` are the
 *  two live team views; who attacks is read off the ball state. */
export function flowTick(home: FlowTeam, away: FlowTeam, ball: BallState, rng: () => number): FlowTickResult {
  if (ball.mode === 'free') {
    // Symmetric race — call it with home as "attacking" (the roles are equivalent here).
    return resolveLooseBall({ attacking: home, defending: away, rng, events: [] }, ball.at);
  }

  const attacking = ball.side === 'home' ? home : away;
  const defending = ball.side === 'home' ? away : home;
  const carrierId = ball.carrierId;
  const ctx: Ctx = { attacking, defending, rng, events: [] };

  // 15C: GK distribution — emit a narrative event then delegate to the appropriate resolver.
  // GK uses goalkeeping attribute for long kicks (delivery quality), passing for short roll-outs.
  if (carrierId === attacking.gkId) {
    const direct = (attacking.params.passingRisk ?? 50) / 100 * 0.75;
    const isLong = rng() < direct;
    ctx.events.push({
      type: isLong ? 'gk_long' : 'gk_short',
      team: attacking.side, playerId: carrierId,
      description: isLong
        ? `${name(attacking, carrierId)} launches it long`
        : `${name(attacking, carrierId)} rolls it out`,
    });
    if (isLong) {
      return resolveLongBall(ctx, carrierId, { deliverySkill: attr(attacking, carrierId, 'goalkeeping') });
    }
    return resolveShortPass(ctx, carrierId);
  }

  const carrier = byId(attacking, carrierId);
  const pos = attacking.positions[carrierId];
  if (!carrier || !pos) {
    // Carrier left the pitch (sub/red/injury): ball runs loose where play was.
    return resolveLooseBall(ctx, pos ?? { x: 0.5, y: 0.5 });
  }

  const local = localNumbers(attacking, defending, pos);

  // D3: press duel — when carrier is heavily pressured, the presser gets a pre-situation
  // challenge. Fires probabilistically scaled by pressIntensity slider.
  const pressIntensity = (attacking.params.pressIntensity ?? 50) / 100;
  if (local.secondDefenderPenalty >= SECOND_DEFENDER_CAP * 0.8) {
    const presserId = nearestDefender(defending, pos);
    if (presserId && rng() < pressIntensity * 0.4) {
      const pressOutcome = resolveDuel(
        attr(attacking, carrierId, 'technique'),
        attr(defending, presserId, 'defending'),
        DRIBBLE_DUEL, rng,
      );
      if (!pressOutcome.attackerWins) {
        ctx.events.push(turnoverEvent(
          'tackle', defending, presserId,
          `${name(defending, presserId)} wins the ball with a high press`,
          attacking, carrierId, 'dribble', pressOutcome,
        ));
        if (pressOutcome.margin > -0.3) {
          return resolveLooseBall(ctx, pos);
        }
        return { events: ctx.events, ball: { mode: 'carried', side: defending.side, carrierId: presserId } };
      }
      // Carrier survives the press — continue to normal situation choice
    }
  }

  const situation = chooseSituation(situationWeights(carrier, pos, attacking, local), rng);
  return RESOLVERS[situation](ctx, carrierId);
}
