import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player, type FormationPosition, type FieldedPositions } from '../shared/types.ts';
import { type MatchParameters, NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
import { resolveContest, mirrorBall, type Skill } from './action-generators.ts';

// ── active-player weighting ─────────────────────────────────────────────────────
// Picks who is "on the ball" based on where the ball is. Follows the engine
// convention that the possessing team always attacks toward away_box, so
// home_box = own/defensive end and away_box = attacking end regardless of which
// team is in possession (do NOT flip by state.possession).

export type FieldLine = 'GK' | 'DEF' | 'MID' | 'ATT';

export const FIELD_LINE: Record<FormationPosition, FieldLine> = {
  GK: 'GK',
  CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', ST: 'ATT',
};

const FLANK: Record<FormationPosition, 'left' | 'right' | 'center'> = {
  LB: 'left', LM: 'left', LW: 'left', LWB: 'left',
  RB: 'right', RM: 'right', RW: 'right', RWB: 'right',
  GK: 'center', CB: 'center', CDM: 'center',
  CM: 'center', CAM: 'center', ST: 'center',
};

// zone index 0..4 = home_box, home_third, middle_third, away_third, away_box
// (home_box = possessor's own/defensive end; away_box = attacking end)
const ZONE_INDEX: Record<BallPosition['zone'], number> = {
  home_box: 0, home_third: 1, middle_third: 2, away_third: 3, away_box: 4,
};

// per-line weight at each zone index
export const LINE_ZONE_WEIGHT: Record<FieldLine, [number, number, number, number, number]> = {
  GK:  [0.8, 0,   0,   0,   0],   // only own box
  DEF: [5,   4.5, 2,   0.8, 0.4],
  MID: [1.5, 2.5, 4,   2.5, 1.5],
  ATT: [0.4, 0.8, 2,   4.5, 5],
};

const SIDE_MATCH = 1.6;     // player on the same flank as the ball
const SIDE_OPPOSITE = 0.5;  // player on the opposite flank

export function activePlayerWeight(
  player: Player,
  ball: BallPosition,
  fieldedPosition: FormationPosition = player.position,
): number {
  let w = LINE_ZONE_WEIGHT[FIELD_LINE[fieldedPosition]][ZONE_INDEX[ball.zone]];
  if (w === 0) { return 0; }
  if (ball.side === 'left' || ball.side === 'right') {
    const flank = FLANK[fieldedPosition];
    if (flank === ball.side) { w *= SIDE_MATCH; }
    else if (flank !== 'center') { w *= SIDE_OPPOSITE; }
  }
  return w;
}

export function selectActivePlayer(
  players: Player[],
  ball: BallPosition,
  rng: () => number = Math.random,
  fieldedPositions?: FieldedPositions,
): Player | null {
  const weighted = players
    .map(p => ({ p, w: activePlayerWeight(p, ball, fieldedPositions?.[p.id]) }))
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

/** The 6 action types ever registered via `registerAction` (see `match-simulator.ts`) —
 *  the only kinds of action a player can actually choose to perform. */
export type ActionType = 'short_pass' | 'long_pass' | 'through_ball' | 'cross' | 'dribble' | 'shot';

export const POSITION_PREFERENCE: Record<ActionType, Partial<Record<FormationPosition, number>>> = {
  'short_pass': { 'CB': 1.2, 'CM': 1.3, 'CDM': 1.4 },
  'long_pass': { 'CB': 1.1, 'CM': 1.2 },
  'through_ball': { 'CAM': 1.5, 'CM': 1.2 },
  // Wing-backs (LWB/RWB) sit between a winger and a plain full-back: more advanced and more
  // involved in crossing/carrying than an LB/RB, since a back-5 frees them to push forward.
  'cross': { 'LW': 1.5, 'RW': 1.5, 'LWB': 1.4, 'RWB': 1.4, 'LB': 1.2, 'RB': 1.2 },
  'dribble': { 'LW': 1.4, 'RW': 1.4, 'LWB': 1.2, 'RWB': 1.2, 'CAM': 1.2 },
  'shot': { 'ST': 1.5, 'CAM': 1.2 },
};

const SKILL_REQUIREMENT: Record<ActionType, number> = {
  'short_pass': 60,
  'long_pass': 75,
  'through_ball': 80,
  'cross': 70,
  'dribble': 75,
  'shot': 65,
};

const RISK_LEVEL: Record<ActionType, 'low' | 'medium' | 'high'> = {
  'short_pass': 'low',
  'long_pass': 'medium',
  'through_ball': 'high',
  'cross': 'medium',
  'dribble': 'medium',
  'shot': 'medium',
};

/** Which `Skill` (from `action-generators.ts`) an attacker draws on for each selectable action. */
export const ACTION_TYPE_SKILL: Record<ActionType, Skill> = {
  'short_pass': 'shortPassing',
  'long_pass': 'longPassing',
  'through_ball': 'throughBall',
  'cross': 'crossing',
  'dribble': 'dribbling',
  'shot': 'finishing',
};

// `actionType`/`position` stay loosely typed here (callers pass `PlayerAction.type: string`,
// including deliberately-unknown values in tests) — the tables above are the strongly-typed
// source; this lookup just falls back to the neutral default for anything outside them.
export function getPositionPreference(actionType: string, position: string): number {
  return (POSITION_PREFERENCE as Record<string, Record<string, number>>)[actionType]?.[position] ?? 1.0;
}

export function getSkillRequired(actionType: string): number {
  return (SKILL_REQUIREMENT as Record<string, number>)[actionType] ?? 60;
}

export function getRiskLevel(actionType: string): 'low' | 'medium' | 'high' {
  return (RISK_LEVEL as Record<string, 'low' | 'medium' | 'high'>)[actionType] ?? 'medium';
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
  // Long balls are a deliberate, direct-play choice — a minority of passing by
  // default (≈0.7) and ramped up by passing risk + transition speed.
  case 'long_pass':    return 0.7 + (atk.passingRisk - 50) / 110 + (atk.transitionSpeed - 50) / 200;
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
  fieldedPosition: FormationPosition = player.position,
): number {
  let weight = action.probability;
  weight *= getPositionPreference(action.type, fieldedPosition);
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

  // Two-step model: the possessor's active player chooses an offensive action, then a
  // selected defender contests it. The defender resolving it (a turnover or a foul) ends
  // the move; otherwise the offensive action's success path runs. `shot` is the exception —
  // it is resolved by the keeper inside ShotGenerator, not by an outfield contest.
  selectPlayerAction(state: MatchState): MatchEvent | null {
    const activePlayer = this.getActivePlayer(state);
    if (!activePlayer) {return null;}

    const possibleActions = this.getPossibleActions(activePlayer, state);
    if (possibleActions.length === 0) {return null;}

    const chosenAction = this.makeDecision(activePlayer, possibleActions, state, state.possession);
    if (!chosenAction) {return null;}

    if (chosenAction.type !== 'shot') {
      const defender = this.selectContestingDefender(state);
      if (defender) {
        const defensiveEvent = resolveContest(chosenAction.type, activePlayer, defender, state, this.rng);
        if (defensiveEvent) {return defensiveEvent;}
      }
    }

    const generator = this.actionGenerators.get(chosenAction.type);
    return generator?.generateEvent(activePlayer, state) ?? null;
  }

  private getActivePlayer(state: MatchState): Player | null {
    const team = state.possession === 'home'
      ? state.currentPlayers.home
      : state.currentPlayers.away;
    return selectActivePlayer(team, state.ballPosition, this.rng, state.fieldedPositions?.[state.possession]);
  }

  // The defender who contests the action: nearest defending outfielder to the ball. The
  // ball is mirrored into the defending team's frame so DEF-line players are favoured when
  // the ball is in the attacking third (their defensive end).
  private selectContestingDefender(state: MatchState): Player | null {
    const defSide = state.possession === 'home' ? 'away' : 'home';
    const defRoster = state.currentPlayers[defSide].filter(p => p.position !== 'GK');
    return selectActivePlayer(defRoster, mirrorBall(state.ballPosition), this.rng, state.fieldedPositions?.[defSide]);
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

  private makeDecision(
    player: Player, actions: PlayerAction[], state: MatchState, side: 'home' | 'away',
  ): PlayerAction | null {
    if (actions.length === 0) {return null;}

    // Decision quality based on awareness
    const awareness = player.attributes.awareness || 50;
    const decisionQuality = awareness / 100;

    const fieldedPosition = state.fieldedPositions?.[side]?.[player.id] ?? player.position;

    // Weight actions by position preferences and situation
    const weightedActions = actions.map(action => ({
      ...action,
      weight: calculateActionWeight(action, player, state, decisionQuality, fieldedPosition),
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
