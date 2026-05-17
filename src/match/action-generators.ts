import { MatchState, MatchEvent, BallPosition } from './types.js';
import { Player } from '../shared/types.js';
import { ActionGenerator } from './action-selector.js';

// Utility class for composite skill calculations
export class SkillCalculator {
  static dribbling(player: Player): number {
    return (player.attributes.speed * 0.3 +
            player.attributes.technique * 0.4 +
            player.attributes.agility * 0.3);
  }

  static finishing(player: Player): number {
    return (player.attributes.finishing * 0.7 +
            player.attributes.composure * 0.2 +
            player.attributes.technique * 0.1);
  }

  static heading(player: Player): number {
    return (player.attributes.finishing * 0.4 +
            player.attributes.agility * 0.3 +
            player.attributes.strength * 0.3);
  }

  static penalties(player: Player): number {
    return (player.attributes.finishing * 0.6 +
            player.attributes.composure * 0.3 +
            player.attributes.technique * 0.1);
  }

  static throughBall(player: Player): number {
    return (player.attributes.awareness * 0.4 +
            player.attributes.passing * 0.5 +
            player.attributes.technique * 0.1);
  }

  static longShot(player: Player): number {
    return (player.attributes.finishing * 0.5 +
            player.attributes.technique * 0.3 +
            player.attributes.composure * 0.2);
  }

  static crossing(player: Player): number {
    return (player.attributes.passing * 0.6 +
            player.attributes.technique * 0.3 +
            player.attributes.awareness * 0.1);
  }

  static tackling(player: Player): number {
    return (player.attributes.defending * 0.6 +
            player.attributes.awareness * 0.2 +
            player.attributes.strength * 0.2);
  }

  static interception(player: Player): number {
    return (player.attributes.awareness * 0.5 +
            player.attributes.defending * 0.3 +
            player.attributes.agility * 0.2);
  }
}

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
      id: `event-${Date.now()}-${Math.random()}`,
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
    // Short passes are easier in own half, harder under pressure
    return ballPosition.zone === 'home_box' || ballPosition.zone === 'home_third' ? 1.1 : 0.9;
  }

  private createNewState(state: MatchState, success: boolean): MatchState {
    const newState = { ...state };

    if (!success) {
      newState.possession = state.possession === 'home' ? 'away' : 'home';
    } else {
      // Ball might move slightly forward
      newState.ballPosition = this.getNewBallPosition(state.ballPosition);
    }

    return newState;
  }

  private getNewBallPosition(currentPosition: BallPosition): BallPosition {
    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(currentPosition.zone);

    // Short passes usually stay in same zone or move forward slightly
    const moveForward = Math.random() < 0.3;
    let newIndex = currentIndex;

    if (moveForward && currentIndex < zones.length - 1) {
      newIndex = currentIndex + 1;
    }

    return {
      zone: zones[newIndex],
      side: currentPosition.side, // Keep same side for short passes
    };
  }
}

export class DribbleGenerator implements ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean {
    return (state.phase === 'first_half' || state.phase === 'second_half') &&
           SkillCalculator.dribbling(player) > 60; // Only skilled dribblers attempt
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
      id: `event-${Date.now()}-${Math.random()}`,
      type: 'dribble',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description: success ?
        `${player.name} beats his defender with skillful dribbling` :
        `${player.name} loses the ball while dribbling`,
      resultingState: newState,
    };
  }

  private getZoneModifier(ballPosition: BallPosition): number {
    // Dribbling is riskier in own half, more rewarding in attacking areas
    switch (ballPosition.zone) {
      case 'home_box': return 0.6;
      case 'home_third': return 0.8;
      case 'middle_third': return 1.0;
      case 'away_third': return 1.2;
      case 'away_box': return 1.1;
      default: return 1.0;
    }
  }

  private createNewState(state: MatchState, success: boolean): MatchState {
    const newState = { ...state };

    if (!success) {
      newState.possession = state.possession === 'home' ? 'away' : 'home';
    } else {
      // Successful dribble advances the ball significantly
      newState.ballPosition = this.advanceBallPosition(state.ballPosition);
    }

    return newState;
  }

  private advanceBallPosition(currentPosition: BallPosition): BallPosition {
    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(currentPosition.zone);

    // Dribbling can advance 1-2 zones
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

export class TackleGenerator implements ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean {
    // Defenders can attempt tackles when opponent has possession
    const isDefender = ['CB', 'LB', 'RB', 'CDM'].includes(player.position);
    const opponentHasBall = state.possession !== (player.id.includes('home') ? 'home' : 'away');
    return isDefender && opponentHasBall &&
           (state.phase === 'first_half' || state.phase === 'second_half');
  }

  calculateProbability(player: Player, state: MatchState): number {
    const tacklingSkill = SkillCalculator.tackling(player) / 100;
    const zoneModifier = this.getZoneModifier(state.ballPosition, player);
    return Math.min(tacklingSkill * zoneModifier, 0.8);
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const success = Math.random() < this.calculateProbability(player, state);
    const newState = this.createNewState(state, success, player);

    return {
      id: `event-${Date.now()}-${Math.random()}`,
      type: 'tackle',
      minute: state.minute,
      team: player.id.includes('home') ? 'home' : 'away',
      playerId: player.id,
      description: success ?
        `${player.name} wins the ball with a clean tackle` :
        `${player.name} attempts a tackle but the opponent keeps possession`,
      resultingState: newState,
    };
  }

  private getZoneModifier(ballPosition: BallPosition, player: Player): number {
    const playerTeam = player.id.includes('home') ? 'home' : 'away';

    // Defenders are more effective in their own half
    if (playerTeam === 'home') {
      switch (ballPosition.zone) {
        case 'home_box': return 1.4;
        case 'home_third': return 1.2;
        case 'middle_third': return 1.0;
        case 'away_third': return 0.8;
        case 'away_box': return 0.6;
      }
    } else {
      switch (ballPosition.zone) {
        case 'away_box': return 1.4;
        case 'away_third': return 1.2;
        case 'middle_third': return 1.0;
        case 'home_third': return 0.8;
        case 'home_box': return 0.6;
      }
    }

    return 1.0;
  }

  private createNewState(state: MatchState, success: boolean, tackler: Player): MatchState {
    const newState = { ...state };

    if (success) {
      // Successful tackle wins possession
      newState.possession = tackler.id.includes('home') ? 'home' : 'away';
      // Ball stays roughly in same area after tackle
    }
    // Failed tackle doesn't change possession

    return newState;
  }
}

export class InterceptionGenerator implements ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean {
    // Any player can attempt interception when opponent has possession
    const opponentHasBall = state.possession !== (player.id.includes('home') ? 'home' : 'away');
    return opponentHasBall && (state.phase === 'first_half' || state.phase === 'second_half');
  }

  calculateProbability(player: Player, state: MatchState): number {
    const interceptionSkill = SkillCalculator.interception(player) / 100;
    const positionModifier = this.getPositionModifier(player.position);
    return Math.min(interceptionSkill * positionModifier * 0.6, 0.4); // Lower base probability
  }

  generateEvent(player: Player, state: MatchState): MatchEvent | null {
    const success = Math.random() < this.calculateProbability(player, state);
    const newState = this.createNewState(state, success, player);

    return {
      id: `event-${Date.now()}-${Math.random()}`,
      type: 'interception',
      minute: state.minute,
      team: player.id.includes('home') ? 'home' : 'away',
      playerId: player.id,
      description: success ?
        `${player.name} intercepts the pass` :
        `${player.name} fails to intercept the ball`,
      resultingState: newState,
    };
  }

  private getPositionModifier(position: string): number {
    // Defensive players are better at interceptions
    const modifiers: Record<string, number> = {
      'CB': 1.3,
      'CDM': 1.2,
      'LB': 1.1,
      'RB': 1.1,
      'CM': 1.0,
      'CAM': 0.8,
      'LW': 0.7,
      'RW': 0.7,
      'ST': 0.6,
    };

    return modifiers[position] || 1.0;
  }

  private createNewState(state: MatchState, success: boolean, interceptor: Player): MatchState {
    const newState = { ...state };

    if (success) {
      // Successful interception wins possession
      newState.possession = interceptor.id.includes('home') ? 'home' : 'away';
    }

    return newState;
  }
}

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
    const shotQuality = this.calculateProbability(player, state);
    const newState = this.createNewState(state);

    let description = `${player.name} takes a shot`;
    if (shotQuality > 0.8) {
      description = `${player.name} takes a powerful shot`;
    } else if (shotQuality < 0.4) {
      description = `${player.name} takes a weak shot`;
    }

    return {
      id: `event-${Date.now()}-${Math.random()}`,
      type: 'shot',
      minute: state.minute,
      team: state.possession,
      playerId: player.id,
      description,
      resultingState: newState,
      metadata: { shotQuality }
    };
  }

  private createNewState(state: MatchState): MatchState {
    const newState = { ...state };
    // After shot, possession typically switches
    newState.possession = state.possession === 'home' ? 'away' : 'home';
    newState.ballPosition = { zone: 'middle_third', side: 'center' };
    return newState;
  }
}