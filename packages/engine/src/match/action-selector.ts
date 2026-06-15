import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player, Position } from '../shared/types.ts';
import { type MatchParameters, NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';

// ── active-player weighting ─────────────────────────────────────────────────────
// Picks who is "on the ball" based on where the ball is. Follows the engine
// convention that the possessing team always attacks toward away_box, so
// home_box = own/defensive end and away_box = attacking end regardless of which
// team is in possession (do NOT flip by state.possession).

type FieldLine = 'GK' | 'DEF' | 'MID' | 'ATT';

const FIELD_LINE: Record<Position, FieldLine> = {
  GK: 'GK',
  CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'DEF',
  CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', ST: 'ATT', CF: 'ATT',
};

const FLANK: Record<Position, 'left' | 'right' | 'center'> = {
  LB: 'left', LM: 'left', LW: 'left',
  RB: 'right', RM: 'right', RW: 'right',
  GK: 'center', CB: 'center', CDM: 'center',
  CM: 'center', CAM: 'center', ST: 'center', CF: 'center',
};

// zone index 0..4 = home_box, home_third, middle_third, away_third, away_box
// (home_box = possessor's own/defensive end; away_box = attacking end)
const ZONE_INDEX: Record<BallPosition['zone'], number> = {
  home_box: 0, home_third: 1, middle_third: 2, away_third: 3, away_box: 4,
};

// per-line weight at each zone index
const LINE_ZONE_WEIGHT: Record<FieldLine, [number, number, number, number, number]> = {
  GK:  [0.8, 0,   0,   0,   0],   // only own box
  DEF: [5,   4.5, 2,   0.8, 0.4],
  MID: [1.5, 2.5, 4,   2.5, 1.5],
  ATT: [0.4, 0.8, 2,   4.5, 5],
};

const SIDE_MATCH = 1.6;     // player on the same flank as the ball
const SIDE_OPPOSITE = 0.5;  // player on the opposite flank

export function activePlayerWeight(player: Player, ball: BallPosition): number {
  let w = LINE_ZONE_WEIGHT[FIELD_LINE[player.position]][ZONE_INDEX[ball.zone]];
  if (w === 0) { return 0; }
  if (ball.side === 'left' || ball.side === 'right') {
    const flank = FLANK[player.position];
    if (flank === ball.side) { w *= SIDE_MATCH; }
    else if (flank !== 'center') { w *= SIDE_OPPOSITE; }
  }
  return w;
}

export function selectActivePlayer(
  players: Player[],
  ball: BallPosition,
  rng: () => number = Math.random,
): Player | null {
  const weighted = players
    .map(p => ({ p, w: activePlayerWeight(p, ball) }))
    .filter(x => x.w > 0);
  if (weighted.length === 0) { return null; }
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const x of weighted) { r -= x.w; if (r <= 0) { return x.p; } }
  return weighted[weighted.length - 1].p;
}

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

// ── action weighting (pure) ─────────────────────────────────────────────────────
// Pure decision-weighting helpers, exported like activePlayerWeight above so each
// table/branch is directly testable (decoupled from the argmax in makeDecision).

const POSITION_PREFERENCE: Record<string, Record<string, number>> = {
  'short_pass': { 'CB': 1.2, 'CM': 1.3, 'CDM': 1.4 },
  'long_pass': { 'CB': 1.1, 'CM': 1.2 },
  'through_ball': { 'CAM': 1.5, 'CM': 1.2 },
  'cross': { 'LW': 1.5, 'RW': 1.5, 'LB': 1.2, 'RB': 1.2 },
  'dribble': { 'LW': 1.4, 'RW': 1.4, 'CAM': 1.2 },
  'shot': { 'ST': 1.5, 'CF': 1.4, 'CAM': 1.2 },
  'tackle': { 'CB': 1.3, 'CDM': 1.2, 'LB': 1.1, 'RB': 1.1 },
  'clearance': { 'CB': 1.4, 'GK': 1.2 },
};

const SKILL_REQUIREMENT: Record<string, number> = {
  'short_pass': 60,
  'long_pass': 75,
  'through_ball': 80,
  'cross': 70,
  'dribble': 75,
  'shot': 65,
  'tackle': 70,
  'clearance': 50,
};

const RISK_LEVEL: Record<string, 'low' | 'medium' | 'high'> = {
  'short_pass': 'low',
  'long_pass': 'medium',
  'through_ball': 'high',
  'cross': 'medium',
  'dribble': 'medium',
  'shot': 'medium',
  'tackle': 'high',
  'clearance': 'low',
};

export function getPositionPreference(actionType: string, position: string): number {
  return POSITION_PREFERENCE[actionType]?.[position] ?? 1.0;
}

export function getSkillRequired(actionType: string): number {
  return SKILL_REQUIREMENT[actionType] ?? 60;
}

export function getRiskLevel(actionType: string): 'low' | 'medium' | 'high' {
  return RISK_LEVEL[actionType] ?? 'medium';
}

export function getSituationalModifier(action: PlayerAction, state: MatchState): number {
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

export function getRiskTolerance(riskLevel: string, state: MatchState): number {
  // Losing teams take more risks, winning teams play safer.
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

function attackingParams(state: MatchState): MatchParameters {
  return state.params?.[state.possession] ?? NEUTRAL_PARAMS;
}

function defendingParams(state: MatchState): MatchParameters {
  const def = state.possession === 'home' ? 'away' : 'home';
  return state.params?.[def] ?? NEUTRAL_PARAMS;
}

/**
 * Tactical multiplier on an action's selection weight. Returns exactly 1 when
 * every parameter is at the neutral value (50), so a tactics-agnostic match is
 * unchanged. Offensive actions read the possessing team's params; turnover
 * actions (tackle/interception) read the defending team's pressing.
 */
export function getParamWeight(actionType: string, atk: MatchParameters, def: MatchParameters): number {
  switch (actionType) {
  case 'short_pass':   return 1 + (50 - atk.passingRisk) / 100;
  case 'dribble':      return 1 + (atk.passingRisk - 50) / 120;
  case 'through_ball': return 1 + (atk.passingRisk - 50) / 60;
  case 'cross':        return 1 + (atk.buildUpWidth - 50) / 100;
  case 'shot':         return 1 + (atk.shotFrequency - 50) / 80;
  case 'tackle':       return 1 + (def.pressIntensity - 50) / 60;
  case 'interception': return 1 + (def.pressIntensity - 50) / 80;
  default:             return 1;
  }
}

export function calculateActionWeight(
  action: PlayerAction,
  player: Player,
  state: MatchState,
  decisionQuality: number,
): number {
  let weight = action.probability;
  weight *= getPositionPreference(action.type, player.position);
  weight *= getSituationalModifier(action, state);
  weight *= getRiskTolerance(action.riskLevel, state);
  weight *= getParamWeight(action.type, attackingParams(state), defendingParams(state));
  weight *= (0.5 + decisionQuality * 0.5);
  return weight;
}

export class ActionSelector {
  private actionGenerators: Map<string, ActionGenerator> = new Map();
  private eventIdCounter = 0;

  constructor(private readonly rng: () => number = Math.random) {}

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
    const team = state.possession === 'home'
      ? state.currentPlayers.home
      : state.currentPlayers.away;
    return selectActivePlayer(team, state.ballPosition, this.rng);
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
          skillRequired: getSkillRequired(actionType),
          riskLevel: getRiskLevel(actionType),
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
      weight: calculateActionWeight(action, player, state, decisionQuality),
    }));

    // Sort by weight and add some randomness
    weightedActions.sort((a, b) => b.weight - a.weight);

    // High awareness players almost always pick the best option
    // Low awareness players might pick suboptimal actions
    const randomFactor = this.rng();
    if (randomFactor < decisionQuality) {
      return weightedActions[0]; // Best option
    } else if (weightedActions.length > 1 && randomFactor < decisionQuality + 0.3) {
      return weightedActions[1]; // Second best
    } else {
      // Random choice (poor decision)
      return weightedActions[Math.floor(this.rng() * weightedActions.length)];
    }
  }

  generateId(): string {
    return `event-${++this.eventIdCounter}`;
  }
}
