import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player } from '../shared/types.ts';

export interface PlayerAction {
  type: string;
  player: Player;
  probability: number;
  skillRequired: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ActionGenerator {
  canPerform(player: Player, state: MatchState): boolean;
  calculateProbability(player: Player, state: MatchState): number;
  generateEvent(player: Player, state: MatchState): MatchEvent | null;
}

export class ActionSelector {
  private actionGenerators: Map<string, ActionGenerator> = new Map();
  private eventIdCounter = 0;

  registerAction(actionType: string, generator: ActionGenerator): void {
    this.actionGenerators.set(actionType, generator);
  }

  selectPlayerAction(state: MatchState): MatchEvent | null {
    // Get the active player (who currently has the ball)
    const activePlayer = this.getActivePlayer(state);
    if (!activePlayer) {return null;}

    // Get all possible actions for this player
    const possibleActions = this.getPossibleActions(activePlayer, state);
    if (possibleActions.length === 0) {return null;}

    // Player makes decision based on awareness
    const chosenAction = this.makeDecision(activePlayer, possibleActions, state);
    if (!chosenAction) {return null;}

    // Generate the event
    const generator = this.actionGenerators.get(chosenAction.type);
    return generator?.generateEvent(activePlayer, state) || null;
  }

  private getActivePlayer(state: MatchState): Player | null {
    const team = state.possession === 'home' ? state.currentPlayers.home : state.currentPlayers.away;

    // For now, select a random player from the possessing team
    // TODO: This should be based on ball position and player positions
    const fieldPlayers = team.filter(p => p.position !== 'GK');
    return fieldPlayers[Math.floor(Math.random() * fieldPlayers.length)] || null;
  }

  private getPossibleActions(player: Player, state: MatchState): PlayerAction[] {
    const actions: PlayerAction[] = [];

    for (const [actionType, generator] of this.actionGenerators.entries()) {
      if (generator.canPerform(player, state)) {
        const probability = generator.calculateProbability(player, state);
        actions.push({
          type: actionType,
          player,
          probability,
          skillRequired: this.calculateSkillRequired(actionType, player, state),
          riskLevel: this.getRiskLevel(actionType, state),
        });
      }
    }

    return actions;
  }

  private makeDecision(player: Player, actions: PlayerAction[], state: MatchState): PlayerAction | null {
    if (actions.length === 0) {return null;}

    // Decision quality based on awareness
    const awareness = player.attributes.awareness || 50;
    const decisionQuality = awareness / 100;

    // Weight actions by position preferences and situation
    const weightedActions = actions.map(action => ({
      ...action,
      weight: this.calculateActionWeight(action, player, state, decisionQuality),
    }));

    // Sort by weight and add some randomness
    weightedActions.sort((a, b) => b.weight - a.weight);

    // High awareness players almost always pick the best option
    // Low awareness players might pick suboptimal actions
    const randomFactor = Math.random();
    if (randomFactor < decisionQuality) {
      return weightedActions[0]; // Best option
    } else if (weightedActions.length > 1 && randomFactor < decisionQuality + 0.3) {
      return weightedActions[1]; // Second best
    } else {
      // Random choice (poor decision)
      return weightedActions[Math.floor(Math.random() * weightedActions.length)];
    }
  }

  private calculateActionWeight(action: PlayerAction, player: Player, state: MatchState, decisionQuality: number): number {
    let weight = action.probability;

    // Position-based preferences
    weight *= this.getPositionPreference(action.type, player.position);

    // Situational modifiers
    weight *= this.getSituationalModifier(action, state);

    // Risk tolerance based on game state
    weight *= this.getRiskTolerance(action.riskLevel, state);

    // Decision quality affects weight calculation
    weight *= (0.5 + decisionQuality * 0.5);

    return weight;
  }

  private getPositionPreference(actionType: string, position: string): number {
    const preferences: Record<string, Record<string, number>> = {
      'short_pass': { 'CB': 1.2, 'CM': 1.3, 'CDM': 1.4 },
      'long_pass': { 'CB': 1.1, 'CM': 1.2 },
      'through_ball': { 'CAM': 1.5, 'CM': 1.2 },
      'cross': { 'LW': 1.5, 'RW': 1.5, 'LB': 1.2, 'RB': 1.2 },
      'dribble': { 'LW': 1.4, 'RW': 1.4, 'CAM': 1.2 },
      'shot': { 'ST': 1.5, 'CF': 1.4, 'CAM': 1.2 },
      'tackle': { 'CB': 1.3, 'CDM': 1.2, 'LB': 1.1, 'RB': 1.1 },
      'clearance': { 'CB': 1.4, 'GK': 1.2 },
    };

    return preferences[actionType]?.[position] || 1.0;
  }

  private getSituationalModifier(action: PlayerAction, state: MatchState): number {
    // Zone-based modifiers
    const zone = state.ballPosition.zone;

    if (action.type === 'shot' && (zone === 'away_box' || zone === 'away_third')) {
      return 1.3;
    }

    if (action.type === 'clearance' && (zone === 'home_box' || zone === 'home_third')) {
      return 1.4;
    }

    if (action.type === 'cross' && zone === 'away_third') {
      return 1.2;
    }

    return 1.0;
  }

  private getRiskTolerance(riskLevel: string, state: MatchState): number {
    // Losing teams take more risks, winning teams play safer
    const scoreDiff = state.homeScore - state.awayScore;
    const isLosing = (state.possession === 'home' && scoreDiff < 0) ||
                     (state.possession === 'away' && scoreDiff > 0);

    if (riskLevel === 'high') {
      return isLosing ? 1.3 : 0.8;
    } else if (riskLevel === 'low') {
      return isLosing ? 0.8 : 1.2;
    }

    return 1.0;
  }

  private calculateSkillRequired(actionType: string, player: Player, state: MatchState): number {
    // Base skill requirement for different actions
    const baseRequirements: Record<string, number> = {
      'short_pass': 60,
      'long_pass': 75,
      'through_ball': 80,
      'cross': 70,
      'dribble': 75,
      'shot': 65,
      'tackle': 70,
      'clearance': 50,
    };

    return baseRequirements[actionType] || 60;
  }

  private getRiskLevel(actionType: string, state: MatchState): 'low' | 'medium' | 'high' {
    const riskLevels: Record<string, 'low' | 'medium' | 'high'> = {
      'short_pass': 'low',
      'long_pass': 'medium',
      'through_ball': 'high',
      'cross': 'medium',
      'dribble': 'medium',
      'shot': 'medium',
      'tackle': 'high',
      'clearance': 'low',
    };

    return riskLevels[actionType] || 'medium';
  }

  generateId(): string {
    return `event-${++this.eventIdCounter}`;
  }
}
