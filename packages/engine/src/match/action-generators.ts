import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player, Position } from '../shared/types.ts';
import { ActionGenerator } from './action-selector.ts';
import { getEffectiveAttributes } from '../shared/position-rules.ts';

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

// ── helpers ───────────────────────────────────────────────────────────────────

function defTeamSide(state: MatchState): 'home' | 'away' {
  return state.possession === 'home' ? 'away' : 'home';
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

function pickRandom<T>(arr: T[]): T | null {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
}

function makeId(): string {
  return `event-${Date.now()}-${Math.random()}`;
}

// ── ShortPassGenerator ────────────────────────────────────────────────────────

export class ShortPassGenerator implements ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean {
    return state.phase === 'first_half' || state.phase === 'second_half';
  }

  calculateProbability(player: Player, state: MatchState): number {
    const passingSkill = (player.attributes.passing + player.attributes.technique * 0.5) / 150;
    const positionModifier = this.getPositionModifier(state.ballPosition);
    return Math.min(passingSkill * positionModifier, 0.95);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const success = Math.random() < this.calculateProbability(player, state);
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
      newState.ballPosition = this.getNewBallPosition(state.ballPosition);
    }
    return newState;
  }

  private getNewBallPosition(currentPosition: BallPosition): BallPosition {
    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(currentPosition.zone);
    const moveForward = Math.random() < 0.3;
    let newIndex = currentIndex;
    if (moveForward && currentIndex < zones.length - 1) {
      newIndex = currentIndex + 1;
    }
    return { zone: zones[newIndex], side: currentPosition.side };
  }
}

// ── DribbleGenerator ──────────────────────────────────────────────────────────

export class DribbleGenerator implements ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean {
    return player.position !== 'GK' &&
           (state.phase === 'first_half' || state.phase === 'second_half') &&
           SkillCalculator.dribbling(player) > 60;
  }

  calculateProbability(player: Player, state: MatchState): number {
    const dribblingSkill = SkillCalculator.dribbling(player) / 100;
    const zoneModifier = this.getZoneModifier(state.ballPosition);
    return Math.min(dribblingSkill * zoneModifier, 0.8);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const success = Math.random() < this.calculateProbability(player, state);
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
      newState.ballPosition = this.advanceBallPosition(state.ballPosition);
    }
    return newState;
  }

  private advanceBallPosition(currentPosition: BallPosition): BallPosition {
    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(currentPosition.zone);
    const advancement = Math.random() < 0.6 ? 1 : 2;
    const newIndex = Math.min(currentIndex + advancement, zones.length - 1);
    return {
      zone: zones[newIndex],
      side: Math.random() < 0.5 ? currentPosition.side :
        (currentPosition.side === 'left' ? 'center' :
          currentPosition.side === 'right' ? 'center' :
            Math.random() < 0.5 ? 'left' : 'right'),
    };
  }
}

// ── TackleGenerator ───────────────────────────────────────────────────────────
// Picks a random defender from the non-possessing team to contest the ball.

export class TackleGenerator implements ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean {
    if (state.phase !== 'first_half' && state.phase !== 'second_half') { return false; }
    return getDefenders(state).length > 0;
  }

  calculateProbability(player: Player, state: MatchState): number {
    const tacklingSkill = SkillCalculator.tackling(player) / 100;
    const zoneModifier = this.getZoneModifier(state.ballPosition, defTeamSide(state));
    return Math.min(tacklingSkill * zoneModifier, 0.8);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const tackler = pickRandom(getDefenders(state));
    if (!tackler) { return null; }

    const success = Math.random() < this.calculateProbability(tackler, state);
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
  canPerform(player: Player, state: MatchState): boolean {
    if (state.phase !== 'first_half' && state.phase !== 'second_half') { return false; }
    return defPlayers(state).filter(p => p.position !== 'GK').length > 0;
  }

  calculateProbability(player: Player, state: MatchState): number {
    const skill = SkillCalculator.interception(player) / 100;
    const positionModifier = this.getPositionModifier(player.position);
    return Math.min(skill * positionModifier * 0.6, 0.4);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const candidates = defPlayers(state).filter(p => p.position !== 'GK');
    const interceptor = pickRandom(candidates);
    if (!interceptor) { return null; }

    const success = Math.random() < this.calculateProbability(interceptor, state);
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
  canPerform(player: Player, state: MatchState): boolean {
    return (state.ballPosition.zone === 'away_box' || state.ballPosition.zone === 'away_third') &&
           (state.phase === 'first_half' || state.phase === 'second_half');
  }

  calculateProbability(player: Player, state: MatchState): number {
    const finishingSkill = SkillCalculator.finishing(player) / 100;
    const zoneModifier = state.ballPosition.zone === 'away_box' ? 1.2 : 0.8;
    return Math.min(finishingSkill * zoneModifier, 0.9);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const shotQuality = SkillCalculator.finishing(player) / 100;
    const gk = getGK(state);
    const gkSave = gk ? SkillCalculator.gkSaving(gk) / 100 : 0.5;
    const zoneMultiplier = state.ballPosition.zone === 'away_box' ? 1.0 : 0.4;

    // Goal probability: attacker finishing vs GK save quality, clamped to realistic range
    const goalProb = Math.max(0.03, Math.min(0.35, shotQuality * zoneMultiplier * (1 - gkSave)));
    const isGoal = Math.random() < goalProb;

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
