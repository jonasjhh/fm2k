import { MatchState, MatchEvent, BallPosition } from './types.ts';
import { Player, type FormationPosition, type FieldedPositions } from '../shared/types.ts';
import { type MatchParameters, NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
import { resolveContest, mirrorBall, type Skill } from './action-generators.ts';
import { visionCheck, engagementChance, SECOND_DEFENDER_FACTOR, VISION_SPECS } from './skill-checks.ts';

// ── active-player weighting ─────────────────────────────────────────────────────
// Picks who is "on the ball" based on where the ball is. Follows the engine
// convention that the possessing team always attacks toward away_box, so
// home_box = own/defensive end and away_box = attacking end regardless of which
// team is in possession (do NOT flip by state.possession).

export type FieldLine = 'GK' | 'DEF' | 'MID' | 'ATT';

/** Finer-grained band a role sits in before collapsing to the engine's 4 zone-weighting
 *  lines — kept distinct from FieldLine so a future free-positioning mode can place a
 *  player in, say, the DM/AM band independently of which FieldLine that band collapses to. */
export type Band = 'GK' | 'DEF' | 'DM' | 'MID' | 'AM' | 'ATT';

/** A band's roles split into left/center/right families — every band has exactly one
 *  center role; DM/AM have no left/right family at all (their one role is always center,
 *  regardless of rank or how many players share the band). The single authoritative
 *  source for which roles belong to which band: BAND_OF_ROLE and ROLE_OPTIONS_BY_BAND
 *  below are both derived from it, so there's nothing else to keep in sync. */
export interface RoleFamily {
  left: FormationPosition[];
  center: FormationPosition[];
  right: FormationPosition[];
}

export const ROLE_FAMILY_OF_BAND: Record<Exclude<Band, 'GK'>, RoleFamily> = {
  DEF: { left: ['LB', 'LWB'], center: ['CB'], right: ['RB', 'RWB'] },
  DM:  { left: [], center: ['DM'], right: [] },
  MID: { left: ['LM'], center: ['CM'], right: ['RM'] },
  AM:  { left: [], center: ['AM'], right: [] },
  ATT: { left: ['LW'], center: ['ST'], right: ['RW'] },
};

/** Every FormationPosition belonging to a band, grouped — flattened from
 *  ROLE_FAMILY_OF_BAND. The instruction-picker's candidate set for a player standing in
 *  that band (free-positioning: see TacticsPitch/setPlayerRole). */
export const ROLE_OPTIONS_BY_BAND: Record<Exclude<Band, 'GK'>, FormationPosition[]> = Object.fromEntries(
  (Object.keys(ROLE_FAMILY_OF_BAND) as Exclude<Band, 'GK'>[]).map(band => {
    const fam = ROLE_FAMILY_OF_BAND[band];
    return [band, [...fam.left, ...fam.center, ...fam.right]];
  }),
) as Record<Exclude<Band, 'GK'>, FormationPosition[]>;

export const BAND_OF_ROLE: Record<FormationPosition, Band> = {
  GK: 'GK',
  ...Object.fromEntries(
    (Object.keys(ROLE_OPTIONS_BY_BAND) as Exclude<Band, 'GK'>[])
      .flatMap(band => ROLE_OPTIONS_BY_BAND[band].map(role => [role, band])),
  ),
} as Record<FormationPosition, Band>;

// Defenders behave as defenders; every flavor of midfielder (holding, central, wide,
// attacking) behaves as a midfielder; strikers and wingers behave as attackers.
export const BAND_TO_FIELD_LINE: Record<Band, FieldLine> = {
  GK: 'GK', DEF: 'DEF', DM: 'MID', MID: 'MID', AM: 'MID', ATT: 'ATT',
};

export const FIELD_LINE: Record<FormationPosition, FieldLine> = Object.fromEntries(
  (Object.keys(BAND_OF_ROLE) as FormationPosition[]).map(
    role => [role, BAND_TO_FIELD_LINE[BAND_OF_ROLE[role]]],
  ),
) as Record<FormationPosition, FieldLine>;

/** Maximum number of players a single band may hold at once (free-positioning). */
export const MAX_BAND_SIZE = 5;

/** Bands in attack-to-defense order — the canonical "how advanced is this role" ranking,
 *  shared by every UI that needs to lay players out by band (the free-positioning pitch view,
 *  and the table/pill display order in effectiveDisplayOrder). */
export const BAND_ORDER: Exclude<Band, 'GK'>[] = ['ATT', 'AM', 'MID', 'DM', 'DEF'];

/** A player's position within their band, by lateral order — drives which role family
 *  they're allowed to pick from (see eligibleRoles). `'only'` covers a band with a single
 *  member, who is unconstrained (both ends and the middle at once). */
export type BandRank = 'leftmost' | 'rightmost' | 'inner' | 'only';

/** Rank a player by lateral order among their band-mates (ties broken by id, so it's
 *  deterministic regardless of object/array iteration order). `members` need not be
 *  pre-sorted, and may or may not include `playerId` itself (it's only used to find rank). */
export function rankInBand(playerId: string, members: { id: string; lateral: number }[]): BandRank {
  if (members.length <= 1) { return 'only'; }
  const sorted = [...members].sort((a, b) => a.lateral - b.lateral || a.id.localeCompare(b.id));
  if (sorted[0].id === playerId) { return 'leftmost'; }
  if (sorted[sorted.length - 1].id === playerId) { return 'rightmost'; }
  return 'inner';
}

/** The roles a player may be assigned, given which band they're in, their rank within it
 *  (rankInBand), and how many players share that band. A lone member gets the full set;
 *  an inner member (only possible when count >= 3) is always forced to the center role;
 *  the two ends get their side's family plus center, *except* once a band reaches 4+
 *  members, where the ends are forced to their side's family (no center) — this is what
 *  makes a 4-or-5-wide band always have an L-type role on the left end and an R-type on
 *  the right, matching how every predefined formation is already shaped. */
export function eligibleRoles(band: Exclude<Band, 'GK'>, rank: BandRank, count: number): FormationPosition[] {
  const fam = ROLE_FAMILY_OF_BAND[band];
  if (rank === 'only') { return [...fam.left, ...fam.center, ...fam.right]; }
  if (rank === 'inner') { return fam.center; }
  const side = rank === 'leftmost' ? fam.left : fam.right;
  if (count >= 4 && side.length > 0) { return side; }
  return [...side, ...fam.center];
}

/** The preferred role among a rank's eligible set — center if it's eligible (the common
 *  case for an inner slot or a band that isn't yet forced wide), else the first eligible
 *  family role (e.g. a forced-wide end with no center option). Used to default a player's
 *  role when their previous one no longer fits their new band/rank. */
export function preferredRole(band: Exclude<Band, 'GK'>, rank: BandRank, count: number): FormationPosition {
  const eligible = eligibleRoles(band, rank, count);
  const center = ROLE_FAMILY_OF_BAND[band].center[0];
  return center && eligible.includes(center) ? center : eligible[0];
}

const FLANK: Record<FormationPosition, 'left' | 'right' | 'center'> = {
  LB: 'left', LM: 'left', LW: 'left', LWB: 'left',
  RB: 'right', RM: 'right', RW: 'right', RWB: 'right',
  GK: 'center', CB: 'center', DM: 'center',
  CM: 'center', AM: 'center', ST: 'center',
};

/** A player's zone-weighting geometry, decoupled from their role label — lets a future
 *  free-positioning mode place a player anywhere regardless of which role/instruction
 *  (LB, LWB, ...) they're assigned. Absent for predefined formations, where geometry is
 *  still derived from the role via FIELD_LINE/FLANK above. */
export interface FieldGeometry {
  line: FieldLine;
  flank: 'left' | 'right' | 'center';
}

export type FieldedGeometry = Record<string, FieldGeometry>;

// Anything within this band of dead-center counts as "center" rather than a flank —
// matches the existing left/center/right granularity FLANK already uses per-role.
const LATERAL_CENTER_THRESHOLD = 0.34;

/** Bucket a continuous lateral position (-1 far left .. 1 far right) into the same
 *  left/center/right granularity FLANK uses for predefined formations. */
export function flankOfLateral(lateral: number): 'left' | 'right' | 'center' {
  if (lateral <= -LATERAL_CENTER_THRESHOLD) { return 'left'; }
  if (lateral >= LATERAL_CENTER_THRESHOLD) { return 'right'; }
  return 'center';
}

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
  geometry?: FieldGeometry,
): number {
  const line = geometry?.line ?? FIELD_LINE[fieldedPosition];
  const flank = geometry?.flank ?? FLANK[fieldedPosition];
  let w = LINE_ZONE_WEIGHT[line][ZONE_INDEX[ball.zone]];
  if (w === 0) { return 0; }
  if (ball.side === 'left' || ball.side === 'right') {
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
  fieldedGeometry?: FieldedGeometry,
): Player | null {
  const weighted = players
    .map(p => ({ p, w: activePlayerWeight(p, ball, fieldedPositions?.[p.id], fieldedGeometry?.[p.id]) }))
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
  'short_pass': { 'CB': 1.2, 'CM': 1.3, 'DM': 1.4 },
  'long_pass': { 'CB': 1.1, 'CM': 1.2 },
  'through_ball': { 'AM': 1.5, 'CM': 1.2 },
  // Wing-backs (LWB/RWB) sit between a winger and a plain full-back: more advanced and more
  // involved in crossing/carrying than an LB/RB, since a back-5 frees them to push forward.
  'cross': { 'LW': 1.5, 'RW': 1.5, 'LWB': 1.4, 'RWB': 1.4, 'LB': 1.2, 'RB': 1.2 },
  'dribble': { 'LW': 1.4, 'RW': 1.4, 'LWB': 1.2, 'RWB': 1.2, 'AM': 1.2 },
  'shot': { 'ST': 1.5, 'AM': 1.2 },
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

  // Skill-check pipeline (see MATCH-PIPELINE.md): the possessor's active player perceives
  // her options (vision checks gate the hard balls), chooses one, then the engaged
  // defender(s) contest it. A defender resolving it (a turnover or a foul) ends the move;
  // otherwise the offensive action's success path runs (which may chain its own receiver
  // checks). `shot` is the exception — it is resolved by the keeper inside ShotGenerator.
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
        if (defensiveEvent) {
          return this.tagContested(defensiveEvent, chosenAction.type, activePlayer, state);
        }
      }
      // Engagement stage: a carrier who beats the first defender may be met by a second —
      // pressing sides trap with two. The second man is committed, so he checks at a
      // reduced win chance; if he resolves it, the move ends on his challenge.
      if (chosenAction.type === 'dribble' && defender) {
        const press = state.params?.[state.possession === 'home' ? 'away' : 'home']?.pressIntensity ?? 50;
        if (this.rng() < engagementChance(press, state.ballPosition.zone)) {
          const second = this.selectContestingDefender(state, defender.id);
          if (second) {
            const secondEvent = resolveContest(chosenAction.type, activePlayer, second, state, this.rng, SECOND_DEFENDER_FACTOR);
            if (secondEvent) {
              const tagged = this.tagContested(secondEvent, chosenAction.type, activePlayer, state);
              tagged.metadata = { ...tagged.metadata, secondDefender: true };
              tagged.description = `${tagged.description} (second defender)`;
              return tagged;
            }
          }
        }
      }
    }

    const generator = this.actionGenerators.get(chosenAction.type);
    return generator?.generateEvent(activePlayer, state) ?? null;
  }

  /** Tag which action was being attempted (and by whom) — the event itself is credited
   *  to the resolving side, so without this the failed attempt would be invisible to
   *  the statistics accumulator. */
  private tagContested(event: MatchEvent, actionType: string, attacker: Player, state: MatchState): MatchEvent {
    return {
      ...event,
      metadata: {
        ...event.metadata,
        contestedAction: actionType,
        attackingTeam: state.possession,
        attackerId: attacker.id,
      },
    };
  }

  private getActivePlayer(state: MatchState): Player | null {
    const team = state.possession === 'home'
      ? state.currentPlayers.home
      : state.currentPlayers.away;
    return selectActivePlayer(
      team, state.ballPosition, this.rng,
      state.fieldedPositions?.[state.possession], state.fieldedGeometry?.[state.possession],
    );
  }

  // The defender who contests the action: nearest defending outfielder to the ball. The
  // ball is mirrored into the defending team's frame so DEF-line players are favoured when
  // the ball is in the attacking third (their defensive end). `excludeId` skips the primary
  // defender when picking the second man of a press.
  private selectContestingDefender(state: MatchState, excludeId?: string): Player | null {
    const defSide = state.possession === 'home' ? 'away' : 'home';
    const defRoster = state.currentPlayers[defSide].filter(p => p.position !== 'GK' && p.id !== excludeId);
    return selectActivePlayer(
      defRoster, mirrorBall(state.ballPosition), this.rng,
      state.fieldedPositions?.[defSide], state.fieldedGeometry?.[defSide],
    );
  }

  private getPossibleActions(player: Player, state: MatchState): PlayerAction[] {
    const actions: PlayerAction[] = [];
    const awareness = player.attributes.awareness || 50;

    for (const [actionType, generator] of this.actionGenerators.entries()) {
      if (!generator.canPerform(player, state)) { continue; }
      // Perception stage: the hard-to-see balls (killer pass, big switch) only enter the
      // option set when the player's vision check passes — she has to *see* the run.
      if (actionType in VISION_SPECS && !visionCheck(awareness, actionType as keyof typeof VISION_SPECS, this.rng)) {
        continue;
      }
      actions.push({
        type: actionType,
        player,
        probability: generator.calculateProbability(player, state),
        skillRequired: getSkillRequired(actionType),
        riskLevel: getRiskLevel(actionType),
      });
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
