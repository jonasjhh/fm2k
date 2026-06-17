import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player, Position } from '../shared/types.ts';
import type { ActionGenerator } from './action-selector.ts';
import { getEffectiveAttributes } from '../shared/position-rules.ts';
import { type MatchParameters, NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';

/**
 * Match skills are **composites** of the 10 base attributes. Each method below is the
 * single source of truth for one skill: the component attributes and their weights are
 * visible here (weights sum to 1, so the result stays on the 1..99 scale). Weights are
 * chosen deliberately to reflect what actually drives the skill — they are NOT assumed
 * equal. When reading a generator, look here to see what a skill is made of.
 */
export class SkillCalculator {
  /** Close control while running: technique-led, helped by pace and balance. */
  static dribbling(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.technique * 0.4 + a.speed * 0.3 + a.agility * 0.3);
  }

  /** Putting the ball away: dominated by finishing, steadied by composure. */
  static finishing(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.7 + a.composure * 0.2 + a.technique * 0.1);
  }

  /** Aerial duel / header: chiefly strength + jumping (agility); finishing matters least. */
  static heading(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.strength * 0.4 + a.agility * 0.35 + a.finishing * 0.25);
  }

  /** Spot kick: a composure test as much as a finishing one. */
  static penalties(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.55 + a.composure * 0.35 + a.technique * 0.1);
  }

  /** Defence-splitting pass: vision (awareness) first, then passing weight. */
  static throughBall(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.awareness * 0.5 + a.passing * 0.4 + a.technique * 0.1);
  }

  /** Shot from distance: finishing + technique, with some composure. */
  static longShot(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.5 + a.technique * 0.3 + a.composure * 0.2);
  }

  /** Delivery from wide: a passing skill above all. */
  static crossing(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.passing * 0.6 + a.technique * 0.3 + a.awareness * 0.1);
  }

  /** Winning the ball in a challenge: defending-led, with reading and power. */
  static tackling(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.defending * 0.6 + a.awareness * 0.2 + a.strength * 0.2);
  }

  /** Reading and cutting out a pass: awareness first, then defending. */
  static interception(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.awareness * 0.5 + a.defending * 0.3 + a.agility * 0.2);
  }

  /** Hoofing the ball clear: power and defending. */
  static clearing(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.defending * 0.5 + a.strength * 0.4 + a.awareness * 0.1);
  }

  /** Shot-stopping (GK): reflexes (agility) first, then positioning and nerve. */
  static gkSaving(gk: Player): number {
    const a = gk.attributes;
    return (a.agility * 0.55 + a.awareness * 0.25 + a.composure * 0.2);
  }
}

// ── balance tuning ──────────────────────────────────────────────────────────
// Scoring is flattened across tiers by making ball retention & progression depend
// on the attacker-vs-defender *differential* (so even matches at any tier produce
// similar volume), while player quality is expressed mainly through conversion.
// Target: most games ~1–2 goals/side, occasional 4–5, rare blowouts on a big gap.
// Every per-action rate is centred at a "parity" value (attacker skill ≈ defender
// skill) and shifted by the differential / SPREAD. At parity — i.e. an even match
// at ANY tier — all rates are identical, so scoring is tier-flat; a quality gap
// shifts the rates and produces dominance (and, at the extreme, blowouts).
const PASS_RETAIN_PARITY = 0.74;   // pass propensity weight at parity (selection, not outcome)
const PASS_RETAIN_SPREAD = 320;
const PASS_FORWARD_BASE = 0.24;    // base chance a completed pass advances a zone
const SHOT_TAKE_PARITY = 0.42;     // chance of shooting when in the final third (skill-light)
const CONV_PARITY = 0.11;          // shot→goal conversion at parity (before zone/params)
const CONV_SPREAD = 220;

// ── the contest (defender resolves the attacker's action) ─────────────────────
// Each non-shot offensive action is contested by a single selected defender. The
// defender-win chance (= the turnover chance) is parity-centred on the *defender's*
// relevant skill vs the *attacker's* relevant skill, so even matches at any tier turn
// the ball over at the same rate while a quality gap shifts it. The per-action parity
// IS the action's "exposure": a sideways short pass is rarely lost, a through-ball or a
// dribble often is. (Replaces the old embedded per-generator success rolls and the
// standalone tackle/interception/clearance actions — turnovers now flow through here.)
const CONTEST_SPREAD = 300;        // (defenderSkill − attackerSkill) → win-chance shift
const CONTEST_PARITY: Record<string, number> = {
  short_pass:   0.32,   // safe ball, seldom intercepted
  long_pass:    0.46,   // direct ball cut out more often
  through_ball: 0.54,   // high-risk killer pass
  cross:        0.54,   // often cleared
  dribble:      0.50,   // beaten/tackled frequently
};
const CONTEST_LO = 0.05;
const CONTEST_HI = 0.85;
// Defenders gate chance *creation*, not just conversion: a stronger defence
// physically compresses space (the ball reaches dangerous zones less often) and
// denies clean looks (fewer shots are worked). Both are parity-centred — equal
// to 1.0 / SHOT_TAKE_PARITY when attack ≈ defence — so even matches at any tier
// are unchanged, while a quality gap shuts a weak attack down before it shoots.
const PROGRESS_SPREAD = 160;       // attacker ball-control vs defence resistance → progression
const SHOT_TAKE_SPREAD = 300;      // attacker (finisher) vs defence → how often a shot is worked

// Discipline & set pieces. A beaten tackle can become a foul (more so under a heavy
// press / from an ill-disciplined defender); a foul may draw a card and concedes a
// set piece — a penalty in the box, a direct free kick in range, else a restart.
// Fouls come from the attacker-vs-defender *challenge*. The dribble and the tackle are
// the same duel seen from each side, so the dribble (the frequent one) is the canonical
// foul source and the tackle adds only a little on top — we don't double-count it. Rates
// are kept deliberately moderate: enough that fouls/cards matter, not so many that the
// match is all free kicks. (Aerial duels at crosses/corners are a natural future source.)
// A challenge can become a foul rather than a clean win/loss. Fouls come overwhelmingly
// from challenges on the ball *carrier* (dribbles), much less from contesting a pass — so
// the base is scaled by a per-action foul exposure.
const FOUL_ON_CHALLENGE = 0.07;      // base chance a contest is a foul (before exposure/press/discipline)
const FOUL_EXPOSURE: Record<string, number> = {
  dribble:      1.0,   // the carrier is challenged directly — the canonical foul source
  cross:        0.4,
  through_ball: 0.4,
  long_pass:    0.25,
  short_pass:   0.2,
};
const YELLOW_ON_FOUL = 0.14;         // a foul cynical/late enough to be booked
const STRAIGHT_RED_ON_FOUL = 0.012;  // a foul bad enough to be a straight red
const CORNER_ON_SAVE = 0.45;         // a saved shot deflected behind
const CORNER_ON_CLEARED_CROSS = 0.40;
// Defenders are more careful in their own box, so fouls there (→ penalties) are rarer.
const BOX_FOUL_FACTOR = 0.35;

// ── helpers ───────────────────────────────────────────────────────────────────

function defTeamSide(state: MatchState): 'home' | 'away' {
  return state.possession === 'home' ? 'away' : 'home';
}

function avgAttrOf(players: Player[], key: keyof Player['attributes']): number {
  if (players.length === 0) { return 50; }
  return players.reduce((s, p) => s + p.attributes[key], 0) / players.length;
}

/** Defensive resistance of the team not in possession (defending + reading). */
function defLineStrength(state: MatchState): number {
  const def = state.currentPlayers[defTeamSide(state)];
  return avgAttrOf(def, 'defending') * 0.6 + avgAttrOf(def, 'awareness') * 0.4;
}

/** Ball-retention quality of the team in possession (control under pressure). */
function atkBallControl(state: MatchState): number {
  const atk = state.currentPlayers[state.possession];
  return avgAttrOf(atk, 'technique') * 0.6 + avgAttrOf(atk, 'composure') * 0.4;
}

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const MIRROR_ZONE: Record<BallPosition['zone'], BallPosition['zone']> = {
  home_box: 'away_box', home_third: 'away_third', middle_third: 'middle_third',
  away_third: 'home_third', away_box: 'home_box',
};

/**
 * Flip the ball to the new possessor's frame of reference. By convention the
 * possessing team always attacks toward `away_box`, so when a turnover changes
 * who has the ball the pitch direction flips too: winning it deep in your own
 * box (a clearance/tackle) leaves you defending, not instantly attacking.
 */
export function mirrorBall(ball: BallPosition): BallPosition {
  const side = ball.side === 'left' ? 'right' : ball.side === 'right' ? 'left' : ball.side;
  return { zone: MIRROR_ZONE[ball.zone], side };
}

/** Tactical parameters of the team in possession (attacking). */
function atkParams(state: MatchState): MatchParameters {
  return state.params?.[state.possession] ?? NEUTRAL_PARAMS;
}

/** Tactical parameters of the defending team. */
function defParams(state: MatchState): MatchParameters {
  return state.params?.[defTeamSide(state)] ?? NEUTRAL_PARAMS;
}

/**
 * Probability that a successful ball action advances toward goal. Driven by the
 * attacker's transition speed and the space the defender leaves behind; equals
 * the baseline factor 1 (and so the original constants) at neutral params.
 */
function advanceFactor(state: MatchState): number {
  const atk = atkParams(state);
  const def = defParams(state);
  // Tactical contribution: attacker transition speed and the space the defender
  // leaves behind help progression; a compact block resists it. Equals 1 at
  // neutral params so the original constants are reproduced there.
  const tactical = 0.4 + 0.7 * (atk.transitionSpeed / 100)
    + 0.5 * (def.spaceLeftBehind / 100)
    - 0.5 * ((def.defensiveCompactness - 50) / 100);
  // Attribute contribution: a side that controls the ball well advances against a
  // weak defence and is stifled by a strong one. 1.0 at parity, so even matches
  // are unchanged; a quality gap is what moves play (or fails to) toward goal.
  return tactical * progressionEdge(state);
}

/** How well the possessing team carries play forward vs the defence — 1.0 at parity. */
function progressionEdge(state: MatchState): number {
  const diff = atkBallControl(state) - defLineStrength(state);
  return clamp(0.5, 1.5, 1 + diff / PROGRESS_SPREAD);
}

/**
 * Bias the flank the ball moves to by build-up width. At the neutral value (50)
 * the side is unchanged and no randomness is consumed (baseline behaviour).
 */
function pickAdvanceSide(
  side: BallPosition['side'],
  buildUpWidth: number,
  rng: () => number,
): BallPosition['side'] {
  const wide = (buildUpWidth - 50) / 100; // -0.5 .. 0.5
  if (wide > 0 && side === 'center') {
    if (rng() < wide) { return rng() < 0.5 ? 'left' : 'right'; }
  } else if (wide < 0 && (side === 'left' || side === 'right')) {
    if (rng() < -wide) { return 'center'; }
  }
  return side;
}

function defPlayers(state: MatchState): Player[] {
  return state.currentPlayers[defTeamSide(state)];
}

function getGK(state: MatchState): Player | null {
  return defPlayers(state).find(p => p.position === 'GK') ?? null;
}

function getDefenders(state: MatchState): Player[] {
  return defPlayers(state).filter(p => ['CB', 'LB', 'RB', 'CDM'].includes(p.position));
}

function pickRandom<T>(arr: T[], rng: () => number): T | null {
  return arr.length > 0 ? arr[Math.floor(rng() * arr.length)] : null;
}

function makeId(): string {
  return `event-${Date.now()}-${Math.random()}`;
}

// ── ShortPassGenerator ────────────────────────────────────────────────────────

export class ShortPassGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    return state.phase === 'first_half' || state.phase === 'second_half';
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Selection weight (a propensity, not the outcome — turnovers are resolved by the
    // contest). Centred so a stronger passer vs a weaker defence is favoured.
    const atk = player.attributes.passing * 0.6 + player.attributes.technique * 0.4;
    const diff = atk - defLineStrength(state);
    const w = clamp(0.4, 0.94, PASS_RETAIN_PARITY + diff / PASS_RETAIN_SPREAD);
    return Math.min(w * this.getPositionModifier(state.ballPosition), 0.95);
  }

  // Success-only: this runs when the contest did not win the ball back (see resolveContest).
  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    return {
      id: makeId(),
      type: 'short_pass',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: `${player.name} completes a short pass`,
      resultingState: { ...state, ballPosition: this.getNewBallPosition(state) },
    };
  }

  private getPositionModifier(ballPosition: BallPosition): number {
    return ballPosition.zone === 'home_box' || ballPosition.zone === 'home_third' ? 1.1 : 0.9;
  }

  private getNewBallPosition(state: MatchState): BallPosition {
    const current = state.ballPosition;
    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(current.zone);
    const pForward = Math.min(0.9, PASS_FORWARD_BASE * advanceFactor(state));
    const moveForward = this.rng() < pForward;
    let newIndex = currentIndex;
    if (moveForward && currentIndex < zones.length - 1) {
      newIndex = currentIndex + 1;
    }
    return { zone: zones[newIndex], side: pickAdvanceSide(current.side, atkParams(state).buildUpWidth, this.rng) };
  }
}

// ── DribbleGenerator ──────────────────────────────────────────────────────────

export class DribbleGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    // Any outfielder may attempt to dribble; weak dribblers vs strong defenders
    // simply lose it more often (no absolute skill gate — that created a volume
    // cliff at the threshold and broke tier-flatness).
    return player.position !== 'GK' &&
           (state.phase === 'first_half' || state.phase === 'second_half');
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Selection weight (a propensity, not the outcome — being tackled is resolved by
    // the contest). A better dribbler vs a weaker defence is more likely to try it on.
    const diff = SkillCalculator.dribbling(player) - defLineStrength(state);
    const base = clamp(0.2, 0.85, 0.5 + diff / 300);
    return Math.min(base * this.getZoneModifier(state.ballPosition), 0.85);
  }

  // Success-only: runs when the contest did not stop the dribble (see resolveContest).
  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    return {
      id: makeId(),
      type: 'dribble',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: `${player.name} beats the defender with skillful dribbling`,
      resultingState: { ...state, ballPosition: this.advanceBallPosition(state) },
    };
  }

  private getZoneModifier(ballPosition: BallPosition): number {
    switch (ballPosition.zone) {
    case 'home_box':    return 0.6;
    case 'home_third':  return 0.8;
    case 'middle_third': return 1.0;
    case 'away_third':  return 1.2;
    case 'away_box':    return 1.1;
    default:            return 1.0;
    }
  }

  private advanceBallPosition(state: MatchState): BallPosition {
    const currentPosition = state.ballPosition;
    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(currentPosition.zone);
    // Faster transitions advance two zones more often; neutral keeps the 0.6 split.
    const pSingle = Math.max(0.1, Math.min(0.9, 0.6 / advanceFactor(state)));
    const advancement = this.rng() < pSingle ? 1 : 2;
    const newIndex = Math.min(currentIndex + advancement, zones.length - 1);
    return {
      zone: zones[newIndex],
      side: this.rng() < 0.5 ? currentPosition.side :
        (currentPosition.side === 'left' ? 'center' :
          currentPosition.side === 'right' ? 'center' :
            this.rng() < 0.5 ? 'left' : 'right'),
    };
  }
}

// ── ShotGenerator ─────────────────────────────────────────────────────────────

export class ShotGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    return (state.ballPosition.zone === 'away_box' || state.ballPosition.zone === 'away_third') &&
           (state.phase === 'first_half' || state.phase === 'second_half');
  }

  calculateProbability(player: Player, state: MatchState): number {
    // How often a shot is worked when in the final third. Parity-centred on the
    // attacker (finisher) vs the defence: even matches shoot at the baseline rate
    // (tier-flat), but a defence that outclasses the attack denies clean looks, so
    // a poor attacker is shut down rather than merely missing the chances it gets.
    const zoneModifier = state.ballPosition.zone === 'away_box' ? 1.2 : 0.8;
    const diff = SkillCalculator.finishing(player) - defLineStrength(state);
    const take = clamp(0.12, 0.6, SHOT_TAKE_PARITY + diff / SHOT_TAKE_SPREAD);
    return Math.min(take * zoneModifier, 0.9);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const gk = getGK(state);
    const gkSkill = gk ? SkillCalculator.gkSaving(gk) : 50;
    const zoneMultiplier = state.ballPosition.zone === 'away_box' ? 1.0 : 0.4;

    // Conversion is the finisher vs the keeper, parity-centred (so even matches at
    // any tier convert similarly) then scaled by zone and the tactical chance
    // quality (attacker) vs defensive compactness (defender).
    const conv = clamp(0.02, 0.6, CONV_PARITY + (SkillCalculator.finishing(player) - gkSkill) / CONV_SPREAD);
    const goalProb = Math.max(0.01, Math.min(0.6, conv * zoneMultiplier * momentumQuality(state)));
    const isGoal = this.rng() < goalProb;

    const resetState: MatchState = {
      ...state,
      possession: state.possession === 'home' ? 'away' : 'home',
      ballPosition: { zone: 'middle_third', side: 'center' },
    };

    // A saved shot is sometimes deflected behind for a corner (another aerial chance).
    const outcomeEvent: MatchEvent = isGoal
      ? this.createGoalEvent(player, state, resetState)
      : (this.rng() < CORNER_ON_SAVE
        ? cornerEvent(state, this.rng)
        : this.createSaveEvent(state, resetState, gk));

    return {
      id: makeId(),
      type: 'shot',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: `${player.name} shoots`,
      resultingState: state,
      chainedEvent: outcomeEvent,
    };
  }

  private createGoalEvent(player: Player, state: MatchState, resetState: MatchState): MatchEvent {
    const newState: MatchState = {
      ...resetState,
      homeScore: state.possession === 'home' ? state.homeScore + 1 : state.homeScore,
      awayScore: state.possession === 'away' ? state.awayScore + 1 : state.awayScore,
    };
    return {
      id: makeId(),
      type: 'goal',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: `GOAL! ${player.name} scores!`,
      resultingState: newState,
    };
  }

  private createSaveEvent(state: MatchState, resetState: MatchState, gk: Player | null): MatchEvent {
    return {
      id: makeId(),
      type: 'save',
      minute: state.minute,
      team: defTeamSide(state),
      playerId: gk?.id,
      description: gk ? `${gk.name} makes the save` : 'Shot saved',
      resultingState: resetState,
    };
  }
}

// ── shared zone/outcome helpers (used by the richer pass/cross actions) ─────────

const ZONES: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];

function zoneIndex(zone: BallPosition['zone']): number { return ZONES.indexOf(zone); }

function possPlayers(state: MatchState): Player[] { return state.currentPlayers[state.possession]; }

/** Average aerial ability of a group (for header duels). */
function avgHeadingOf(players: Player[]): number {
  if (players.length === 0) { return 50; }
  return players.reduce((s, p) => s + SkillCalculator.heading(p), 0) / players.length;
}

/** State after a shot/header: ball back to the keeper's side, possession turned over. */
function resetAfterShot(state: MatchState): MatchState {
  return { ...state, possession: defTeamSide(state), ballPosition: { zone: 'middle_third', side: 'center' } };
}

function goalEvent(state: MatchState, scorer: Player, verb: string): MatchEvent {
  const reset = resetAfterShot(state);
  return {
    id: makeId(), type: 'goal', minute: state.minute, team: state.possession, playerId: scorer.id,
    description: `GOAL! ${scorer.name} ${verb}!`,
    resultingState: {
      ...reset,
      homeScore: state.possession === 'home' ? state.homeScore + 1 : state.homeScore,
      awayScore: state.possession === 'away' ? state.awayScore + 1 : state.awayScore,
    },
  };
}

function saveEvent(state: MatchState, gk: Player | null, desc: string): MatchEvent {
  return {
    id: makeId(), type: 'save', minute: state.minute, team: defTeamSide(state), playerId: gk?.id,
    description: gk ? `${gk.name} ${desc}` : 'Saved', resultingState: resetAfterShot(state),
  };
}

// ── LongPassGenerator ───────────────────────────────────────────────────────
// Direct ball that skips a zone (or two) — the spine of Long Ball / fast breaks.

export class LongPassGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    return (state.phase === 'first_half' || state.phase === 'second_half') &&
           zoneIndex(state.ballPosition.zone) < zoneIndex('away_box');
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Selection weight (propensity) — being cut out is resolved by the contest.
    const atk = player.attributes.passing * 0.7 + player.attributes.strength * 0.3;
    const diff = atk - defLineStrength(state);
    return clamp(0.3, 0.85, 0.58 + diff / PASS_RETAIN_SPREAD);
  }

  // Success-only: runs when the contest did not cut the ball out.
  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const idx = zoneIndex(state.ballPosition.zone);
    const jump = this.rng() < Math.min(0.9, 0.5 * advanceFactor(state)) ? 2 : 1;
    return {
      id: makeId(), type: 'long_pass', minute: state.minute, team: state.possession, playerId: player.id,
      description: `${player.name} hits a long ball forward`,
      resultingState: {
        ...state,
        ballPosition: {
          zone: ZONES[Math.min(idx + jump, ZONES.length - 1)],
          side: pickAdvanceSide(state.ballPosition.side, atkParams(state).buildUpWidth, this.rng),
        },
      },
    };
  }
}

// ── ThroughBallGenerator ────────────────────────────────────────────────────
// The killer pass: either splits the defence (jump toward the box) or is intercepted.

export class ThroughBallGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    if (player.position === 'GK') { return false; }
    if (state.phase !== 'first_half' && state.phase !== 'second_half') { return false; }
    const z = state.ballPosition.zone;
    return z === 'middle_third' || z === 'away_third';
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Selection weight (propensity) — being intercepted is resolved by the contest.
    const diff = SkillCalculator.throughBall(player) - defLineStrength(state);
    return clamp(0.18, 0.7, 0.45 + diff / 280);
  }

  // Success-only: runs when the contest did not intercept. Splits the line — jumps 2 zones.
  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const idx = zoneIndex(state.ballPosition.zone);
    return {
      id: makeId(), type: 'through_ball', minute: state.minute, team: state.possession, playerId: player.id,
      description: `${player.name} threads a defence-splitting pass`,
      resultingState: {
        ...state,
        ballPosition: { zone: ZONES[Math.min(idx + 2, ZONES.length - 1)], side: state.ballPosition.side },
      },
    };
  }
}

// ── CrossGenerator ──────────────────────────────────────────────────────────
// Wide delivery → contested header in the box. The engine of Attack the Wings.

export class CrossGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    if (player.position === 'GK') { return false; }
    if (state.phase !== 'first_half' && state.phase !== 'second_half') { return false; }
    const wide = state.ballPosition.side === 'left' || state.ballPosition.side === 'right';
    const advanced = state.ballPosition.zone === 'away_third' || state.ballPosition.zone === 'away_box';
    return wide && advanced;
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Selection weight (propensity) — a cleared cross is resolved by the contest
    // (which also handles the cross-cleared-behind-for-a-corner outcome).
    const diff = SkillCalculator.crossing(player) - defLineStrength(state);
    return clamp(0.2, 0.8, 0.5 + diff / 300);
  }

  // Success-only: the cross beats the first defender → contested header in the box.
  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    return {
      id: makeId(), type: 'cross', minute: state.minute, team: state.possession, playerId: player.id,
      description: `${player.name} swings in a cross`,
      resultingState: { ...state, ballPosition: { zone: 'away_box', side: 'center' } },
      chainedEvent: headerAttempt(state, this.rng),
    };
  }
}

/** A target attacker meets a cross/corner, contested by the defenders' aerial ability and the keeper. */
function headerAttempt(state: MatchState, rng: () => number): MatchEvent {
  const boxState: MatchState = { ...state, ballPosition: { zone: 'away_box', side: 'center' } };
  const targets = possPlayers(state).filter(p => ['ST', 'CF', 'CB'].includes(p.position));
  const target = pickRandom(targets.length ? targets : possPlayers(state).filter(p => p.position !== 'GK'), rng)
    ?? possPlayers(state)[0];

  const gk = getGK(state);
  const gkSkill = gk ? SkillCalculator.gkSaving(gk) : 50;
  const defAerial = avgHeadingOf(getDefenders(state));
  const attackerHead = SkillCalculator.heading(target);

  // Win the aerial duel, then beat the keeper. Parity-centred on both contests.
  const conv = clamp(0.03, 0.5,
    0.12 + (attackerHead - gkSkill) / CONV_SPREAD + (attackerHead - defAerial) / 360);
  const goalProb = clamp(0.01, 0.55, conv * momentumQuality(state));
  const isGoal = rng() < goalProb;

  return {
    id: makeId(), type: 'shot', minute: state.minute, team: state.possession, playerId: target.id,
    description: `${target.name} meets it with a header`,
    resultingState: boxState,
    chainedEvent: isGoal ? goalEvent(boxState, target, 'heads it home') : saveEvent(boxState, gk, 'heads it but the keeper saves'),
  };
}

// ── fouls, cards & set pieces ────────────────────────────────────────────────

/** The attacking team's chance-quality factor incl. momentum (1.0 at neutral, no momentum). */
function momentumQuality(state: MatchState): number {
  const qFactor = 0.7 + 0.6 * (atkParams(state).chanceQuality / 100);
  const cFactor = 0.5 + 1.0 * (defParams(state).defensiveCompactness / 100);
  const mom = (state.momentum?.[state.possession] ?? 0) / 100;
  return (qFactor / cFactor) * (1 + 0.3 * mom);
}

/**
 * A defender's discipline: clean, composed defenders foul a little less. Kept *gently*
 * tier-sensitive (centred ~1.0, narrow band) so whole lower divisions aren't foul-fests.
 */
function foulProneness(player: Player): number {
  const d = (player.attributes.composure + player.attributes.defending) / 2;
  return clamp(0.7, 1.3, 1 + (50 - d) / 200);
}

/** Fouls are rarer in the box (defenders are careful) — keeps penalties realistic. */
function zoneFoulFactor(state: MatchState): number {
  return state.ballPosition.zone === 'away_box' ? BOX_FOUL_FACTOR : 1;
}

function bestBy(players: Player[], skill: (p: Player) => number): Player | null {
  if (players.length === 0) { return null; }
  return players.reduce((best, p) => (skill(p) > skill(best) ? p : best), players[0]);
}

/** A foul by the defending side: card (maybe), then a set piece for the attackers. */
function resolveFoul(state: MatchState, fouler: Player, rng: () => number): MatchEvent {
  const defSide = defTeamSide(state);
  const zone = state.ballPosition.zone;

  const priorYellow = state.bookings.yellow.some(b => b.playerId === fouler.id);
  let card: 'yellow' | 'red' | null = null;
  if (rng() < STRAIGHT_RED_ON_FOUL) { card = 'red'; }
  else if (rng() < YELLOW_ON_FOUL) { card = priorYellow ? 'red' : 'yellow'; }

  const bookings = {
    yellow: [...state.bookings.yellow],
    red: [...state.bookings.red],
  };
  let currentPlayers = state.currentPlayers;
  if (card === 'yellow') {
    bookings.yellow.push({ playerId: fouler.id, team: defSide, minute: state.minute });
  } else if (card === 'red') {
    bookings.red.push({ playerId: fouler.id, team: defSide, minute: state.minute });
    currentPlayers = {
      ...state.currentPlayers,
      [defSide]: state.currentPlayers[defSide].filter(p => p.id !== fouler.id),
    };
  }

  const baseState: MatchState = { ...state, bookings, currentPlayers };
  const setPiece = buildSetPiece(baseState, zone, rng);
  const tail = card ? cardEvent(baseState, fouler, defSide, card, setPiece) : setPiece;

  return {
    id: makeId(), type: 'foul', minute: state.minute, team: defSide, playerId: fouler.id,
    description: `${fouler.name} gives away a foul`,
    resultingState: baseState,
    chainedEvent: tail,
  };
}

function cardEvent(state: MatchState, player: Player, side: 'home' | 'away', card: 'yellow' | 'red', next: MatchEvent): MatchEvent {
  return {
    id: makeId(), type: card === 'red' ? 'red_card' : 'yellow_card', minute: state.minute, team: side, playerId: player.id,
    description: `${player.name} is shown a ${card} card`,
    resultingState: state,
    chainedEvent: next,
  };
}

/** Penalty in the box, direct free kick in range, otherwise a restart that keeps possession. */
function buildSetPiece(state: MatchState, zone: BallPosition['zone'], rng: () => number): MatchEvent {
  if (zone === 'away_box') { return penaltyEvent(state, rng); }
  if (zone === 'away_third') { return freeKickShot(state, rng); }
  return {
    id: makeId(), type: 'free_kick', minute: state.minute, team: state.possession,
    description: 'Free kick — play restarts',
    resultingState: state,
  };
}

function penaltyEvent(state: MatchState, rng: () => number): MatchEvent {
  const taker = bestBy(possPlayers(state).filter(p => p.position !== 'GK'), p => SkillCalculator.penalties(p))
    ?? possPlayers(state)[0];
  const gk = getGK(state);
  const gkSkill = gk ? SkillCalculator.gkSaving(gk) : 50;
  const conv = clamp(0.55, 0.92, 0.78 + (SkillCalculator.penalties(taker) - gkSkill) / 400);
  const isGoal = rng() < conv;
  return {
    id: makeId(), type: 'penalty', minute: state.minute, team: state.possession, playerId: taker.id,
    description: `${taker.name} steps up to the penalty`,
    resultingState: state,
    chainedEvent: isGoal ? goalEvent(state, taker, 'scores from the spot') : saveEvent(state, gk, 'saves the penalty'),
  };
}

function freeKickShot(state: MatchState, rng: () => number): MatchEvent {
  const taker = bestBy(possPlayers(state).filter(p => p.position !== 'GK'), p => SkillCalculator.longShot(p))
    ?? possPlayers(state)[0];
  const gk = getGK(state);
  const gkSkill = gk ? SkillCalculator.gkSaving(gk) : 50;
  const conv = clamp(0.02, 0.3, 0.06 + (SkillCalculator.longShot(taker) - gkSkill) / 500);
  const goalProb = clamp(0.01, 0.3, conv * momentumQuality(state));
  const isGoal = rng() < goalProb;
  return {
    id: makeId(), type: 'free_kick', minute: state.minute, team: state.possession, playerId: taker.id,
    description: `${taker.name} lines up a free kick`,
    resultingState: state,
    chainedEvent: isGoal ? goalEvent(state, taker, 'curls in the free kick') : saveEvent(state, gk, 'tips the free kick over'),
  };
}

/** A corner: an aerial chance for the attacking side. */
function cornerEvent(state: MatchState, rng: () => number): MatchEvent {
  return {
    id: makeId(), type: 'corner', minute: state.minute, team: state.possession,
    description: 'Corner kick',
    resultingState: { ...state, ballPosition: { zone: 'away_box', side: 'center' } },
    chainedEvent: headerAttempt({ ...state, ballPosition: { zone: 'away_box', side: 'center' } }, rng),
  };
}

// ── the contest ───────────────────────────────────────────────────────────────
// A selected defender contests the possessor's chosen action. This is the single
// turnover source (the old standalone tackle/interception/clearance actions and the
// generators' embedded success rolls are gone): the offensive generator's success path
// only runs when the defender fails to win it here. `shot` is NOT routed through this —
// it is resolved by the keeper in ShotGenerator.

/** The attacker's relevant skill for the action being contested. */
function attackerSkillForAction(actionType: string, player: Player): number {
  switch (actionType) {
  case 'dribble':      return SkillCalculator.dribbling(player);
  case 'through_ball': return SkillCalculator.throughBall(player);
  case 'cross':        return SkillCalculator.crossing(player);
  case 'long_pass':    return player.attributes.passing * 0.7 + player.attributes.strength * 0.3;
  default:             return player.attributes.passing * 0.6 + player.attributes.technique * 0.4; // short_pass
  }
}

/** The defender's relevant skill: tackling against a carry, reading against a pass. */
function defenderSkillForAction(actionType: string, defender: Player): number {
  return actionType === 'dribble'
    ? SkillCalculator.tackling(defender)
    : SkillCalculator.interception(defender);
}

/** Chance the defender wins the ball (= the turnover chance) — parity-centred, press-scaled. */
export function contestWinChance(actionType: string, attacker: Player, defender: Player, state: MatchState): number {
  const parity = CONTEST_PARITY[actionType] ?? CONTEST_PARITY.short_pass;
  const diff = defenderSkillForAction(actionType, defender) - attackerSkillForAction(actionType, attacker);
  const pressFactor = 0.8 + defParams(state).pressIntensity / 250; // neutral 1.0
  const base = clamp(CONTEST_LO, CONTEST_HI, parity + diff / CONTEST_SPREAD);
  return Math.min(base * pressFactor, 0.9);
}

/** Chance the challenge is a foul rather than a clean win/loss (carry-heavy, press-scaled). */
function contestFoulChance(actionType: string, state: MatchState, defender: Player): number {
  const exposure = FOUL_EXPOSURE[actionType] ?? FOUL_EXPOSURE.short_pass;
  const pressFactor = 0.8 + defParams(state).pressIntensity / 250; // neutral 1.0
  return clamp(0, 0.4, FOUL_ON_CHALLENGE * exposure * pressFactor * foulProneness(defender) * zoneFoulFactor(state));
}

/** The turnover event when the defender wins: clearance deep, else tackle (carry) / interception (pass). */
function buildWinEvent(actionType: string, defender: Player, state: MatchState, rng: () => number): MatchEvent {
  const defSide = defTeamSide(state);

  // A cleared cross sometimes only goes as far as a corner (keeps that texture).
  if (actionType === 'cross' && rng() < CORNER_ON_CLEARED_CROSS) {
    return {
      id: makeId(), type: 'cross', minute: state.minute, team: state.possession, playerId: defender.id,
      description: `${defender.name}'s clearance only reaches a corner`,
      resultingState: { ...state, ballPosition: { zone: 'away_box', side: 'center' } },
      chainedEvent: cornerEvent(state, rng),
    };
  }

  // Won deep in the box → hoof it clear (relieve pressure to midfield) rather than mirror.
  if (state.ballPosition.zone === 'away_box') {
    return {
      id: makeId(), type: 'clearance', minute: state.minute, team: defSide, playerId: defender.id,
      description: `${defender.name} clears the danger`,
      resultingState: { ...state, possession: defSide, ballPosition: { zone: 'middle_third', side: 'center' } },
    };
  }

  const type = actionType === 'dribble' ? 'tackle' : 'interception';
  const description = type === 'tackle'
    ? `${defender.name} wins the ball with a clean tackle`
    : `${defender.name} intercepts`;
  return {
    id: makeId(), type, minute: state.minute, team: defSide, playerId: defender.id,
    description,
    resultingState: { ...state, possession: defSide, ballPosition: mirrorBall(state.ballPosition) },
  };
}

/**
 * Resolve the contesting defender's challenge of the possessor's action.
 * Returns a defensive event (foul/set-piece, or a turnover) if the defender intervenes,
 * or `null` to let the offensive generator's success path run.
 */
export function resolveContest(
  actionType: string,
  attacker: Player,
  defender: Player,
  state: MatchState,
  rng: () => number,
): MatchEvent | null {
  if (rng() < contestFoulChance(actionType, state, defender)) {
    return resolveFoul(state, defender, rng);
  }
  if (rng() < contestWinChance(actionType, attacker, defender, state)) {
    return buildWinEvent(actionType, defender, state, rng);
  }
  return null;
}
