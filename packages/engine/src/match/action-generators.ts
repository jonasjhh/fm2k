import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player, Position } from '../shared/types.ts';
import { ActionGenerator } from './action-selector.ts';
import { getEffectiveAttributes } from '../shared/position-rules.ts';
import { type MatchParameters, NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';

export class SkillCalculator {
  static dribbling(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.speed * 0.3 + a.technique * 0.4 + a.agility * 0.3);
  }

  static finishing(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.7 + a.composure * 0.2 + a.technique * 0.1);
  }

  static heading(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.4 + a.agility * 0.3 + a.strength * 0.3);
  }

  static penalties(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.6 + a.composure * 0.3 + a.technique * 0.1);
  }

  static throughBall(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.awareness * 0.4 + a.passing * 0.5 + a.technique * 0.1);
  }

  static longShot(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.finishing * 0.5 + a.technique * 0.3 + a.composure * 0.2);
  }

  static crossing(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.passing * 0.6 + a.technique * 0.3 + a.awareness * 0.1);
  }

  static tackling(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.defending * 0.6 + a.awareness * 0.2 + a.strength * 0.2);
  }

  static interception(player: Player, fieldedPosition: Position = player.position): number {
    const a = getEffectiveAttributes(player, fieldedPosition);
    return (a.awareness * 0.5 + a.defending * 0.3 + a.agility * 0.2);
  }

  static gkSaving(gk: Player): number {
    const a = gk.attributes;
    return (a.agility * 0.5 + a.composure * 0.3 + a.awareness * 0.2);
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
const PASS_RETAIN_PARITY = 0.74;   // pass-completion at parity
const PASS_RETAIN_SPREAD = 320;
const PASS_FORWARD_BASE = 0.24;    // base chance a completed pass advances a zone
const SHOT_TAKE_PARITY = 0.42;     // chance of shooting when in the final third (skill-light)
const TACKLE_PARITY = 0.30;        // tackle success at parity
const TACKLE_SPREAD = 300;
const INTERCEPT_PARITY = 0.16;     // interception success at parity
const INTERCEPT_SPREAD = 320;
const CONV_PARITY = 0.11;          // shot→goal conversion at parity (before zone/params)
const CONV_SPREAD = 220;

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
  // Attacker transition speed and the space the defender leaves behind help
  // progression; a compact defensive block resists it (keeps play out of the
  // box). Equals 1 at neutral params so the original constants are reproduced.
  return 0.4 + 0.7 * (atk.transitionSpeed / 100)
    + 0.5 * (def.spaceLeftBehind / 100)
    - 0.5 * ((def.defensiveCompactness - 50) / 100);
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
    // Retention depends on the passer vs the opposing defence, centred at parity,
    // so even matches at any tier retain similarly; a quality gap shifts it.
    const atk = player.attributes.passing * 0.6 + player.attributes.technique * 0.4;
    const diff = atk - defLineStrength(state);
    const success = clamp(0.4, 0.94, PASS_RETAIN_PARITY + diff / PASS_RETAIN_SPREAD);
    return Math.min(success * this.getPositionModifier(state.ballPosition), 0.95);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const success = this.rng() < this.calculateProbability(player, state);
    const newState = this.createNewState(state, success);

    return {
      id: makeId(),
      type: 'short_pass',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: success ?
        `${player.name} completes a short pass` :
        `${player.name}'s pass is intercepted`,
      resultingState: newState,
    };
  }

  private getPositionModifier(ballPosition: BallPosition): number {
    return ballPosition.zone === 'home_box' || ballPosition.zone === 'home_third' ? 1.1 : 0.9;
  }

  private createNewState(state: MatchState, success: boolean): MatchState {
    const newState = { ...state };
    if (!success) {
      newState.possession = state.possession === 'home' ? 'away' : 'home';
    } else {
      newState.ballPosition = this.getNewBallPosition(state);
    }
    return newState;
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
    // Differential (dribbler vs defence), centred at parity so even matches at
    // any tier dribble through at a similar rate.
    const diff = SkillCalculator.dribbling(player) - defLineStrength(state);
    const base = clamp(0.2, 0.85, 0.5 + diff / 300);
    return Math.min(base * this.getZoneModifier(state.ballPosition), 0.85);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const success = this.rng() < this.calculateProbability(player, state);
    const newState = this.createNewState(state, success);

    return {
      id: makeId(),
      type: 'dribble',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: success ?
        `${player.name} beats the defender with skillful dribbling` :
        `${player.name} loses the ball while dribbling`,
      resultingState: newState,
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

  private createNewState(state: MatchState, success: boolean): MatchState {
    const newState = { ...state };
    if (!success) {
      newState.possession = state.possession === 'home' ? 'away' : 'home';
    } else {
      newState.ballPosition = this.advanceBallPosition(state);
    }
    return newState;
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

// ── TackleGenerator ───────────────────────────────────────────────────────────
// Picks a random defender from the non-possessing team to contest the ball.

export class TackleGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    if (state.phase !== 'first_half' && state.phase !== 'second_half') { return false; }
    return getDefenders(state).length > 0;
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Tackler vs the carrier's ball control, parity-centred so turnover rates are
    // tier-flat in even matches.
    const diff = SkillCalculator.tackling(player) - atkBallControl(state);
    const base = clamp(0.08, 0.6, TACKLE_PARITY + diff / TACKLE_SPREAD);
    const zoneModifier = this.getZoneModifier(state.ballPosition, defTeamSide(state));
    const d = defParams(state);
    const pressFactor = 0.8 + d.pressIntensity / 250;        // neutral 1.0
    const compactFactor = 0.9 + d.defensiveCompactness / 500; // neutral 1.0
    return Math.min(base * zoneModifier * pressFactor * compactFactor, 0.8);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const tackler = pickRandom(getDefenders(state), this.rng);
    if (!tackler) { return null; }

    const success = this.rng() < this.calculateProbability(tackler, state);
    const newState = this.createNewState(state, success, tackler);
    const side = defTeamSide(state);

    return {
      id: makeId(),
      type: 'tackle',
      minute: state.minute,
      team: side,
      playerId: tackler.id,
      description: success ?
        `${tackler.name} wins the ball with a clean tackle` :
        `${tackler.name} attempts a tackle but ${player.name} keeps possession`,
      resultingState: newState,
    };
  }

  private getZoneModifier(ballPosition: BallPosition, defSide: 'home' | 'away'): number {
    if (defSide === 'home') {
      switch (ballPosition.zone) {
      case 'home_box':    return 1.4;
      case 'home_third':  return 1.2;
      case 'middle_third': return 1.0;
      case 'away_third':  return 0.8;
      case 'away_box':    return 0.6;
      }
    } else {
      switch (ballPosition.zone) {
      case 'away_box':    return 1.4;
      case 'away_third':  return 1.2;
      case 'middle_third': return 1.0;
      case 'home_third':  return 0.8;
      case 'home_box':    return 0.6;
      }
    }
    return 1.0;
  }

  private createNewState(state: MatchState, success: boolean, tackler: Player): MatchState {
    if (!success) { return state; }
    return {
      ...state,
      possession: defTeamSide(state),
    };
  }
}

// ── InterceptionGenerator ─────────────────────────────────────────────────────
// Picks a random mid/def player from the non-possessing team.

export class InterceptionGenerator implements ActionGenerator {
  constructor(private readonly rng: () => number = Math.random) {}

  canPerform(player: Player, state: MatchState): boolean {
    if (state.phase !== 'first_half' && state.phase !== 'second_half') { return false; }
    return defPlayers(state).filter(p => p.position !== 'GK').length > 0;
  }

  calculateProbability(player: Player, state: MatchState): number {
    // Interceptor's reading vs the carrier's control, parity-centred.
    const diff = SkillCalculator.interception(player) - atkBallControl(state);
    const base = clamp(0.04, 0.4, INTERCEPT_PARITY + diff / INTERCEPT_SPREAD);
    const positionModifier = this.getPositionModifier(player.position);
    const pressFactor = 0.8 + defParams(state).pressIntensity / 250; // neutral 1.0
    return Math.min(base * positionModifier * pressFactor, 0.4);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const candidates = defPlayers(state).filter(p => p.position !== 'GK');
    const interceptor = pickRandom(candidates, this.rng);
    if (!interceptor) { return null; }

    const success = this.rng() < this.calculateProbability(interceptor, state);
    const side = defTeamSide(state);

    return {
      id: makeId(),
      type: 'interception',
      minute: state.minute,
      team: side,
      playerId: interceptor.id,
      description: success ?
        `${interceptor.name} intercepts the pass` :
        `${interceptor.name} fails to intercept the ball`,
      resultingState: success
        ? { ...state, possession: side }
        : state,
    };
  }

  private getPositionModifier(position: string): number {
    const modifiers: Record<string, number> = {
      'CB':  1.3, 'CDM': 1.2,
      'LB':  1.1, 'RB':  1.1,
      'CM':  1.0, 'CAM': 0.8,
      'LW':  0.7, 'RW':  0.7,
      'ST':  0.6,
    };
    return modifiers[position] ?? 1.0;
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
    // How often a shot is taken when in the final third — kept skill-light so
    // shot *volume* is similar across tiers; quality shows up in conversion.
    const zoneModifier = state.ballPosition.zone === 'away_box' ? 1.2 : 0.8;
    const skillNudge = 0.15 * (SkillCalculator.finishing(player) / 100);
    return Math.min((SHOT_TAKE_PARITY + skillNudge) * zoneModifier, 0.9);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const gk = getGK(state);
    const gkSkill = gk ? SkillCalculator.gkSaving(gk) : 50;
    const zoneMultiplier = state.ballPosition.zone === 'away_box' ? 1.0 : 0.4;

    // Conversion is the finisher vs the keeper, parity-centred (so even matches at
    // any tier convert similarly) then scaled by zone and the tactical chance
    // quality (attacker) vs defensive compactness (defender).
    const conv = clamp(0.02, 0.6, CONV_PARITY + (SkillCalculator.finishing(player) - gkSkill) / CONV_SPREAD);
    const qFactor = 0.7 + 0.6 * (atkParams(state).chanceQuality / 100);
    const cFactor = 0.5 + 1.0 * (defParams(state).defensiveCompactness / 100);
    const goalProb = Math.max(0.01, Math.min(0.6, conv * zoneMultiplier * qFactor / cFactor));
    const isGoal = this.rng() < goalProb;

    const resetState: MatchState = {
      ...state,
      possession: state.possession === 'home' ? 'away' : 'home',
      ballPosition: { zone: 'middle_third', side: 'center' },
    };

    const outcomeEvent: MatchEvent = isGoal
      ? this.createGoalEvent(player, state, resetState)
      : this.createSaveEvent(state, resetState, gk);

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
