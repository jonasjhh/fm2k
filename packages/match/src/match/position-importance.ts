import type { PlayerAttributes, FormationPosition } from '../shared/types.ts';
import { SKILL_WEIGHTS } from './action-generators.ts';
import {
  ACTION_TYPE_SKILL, FIELD_LINE, LINE_ZONE_WEIGHT, getPositionPreference, type ActionType,
} from './action-selector.ts';

/**
 * "What attributes actually matter for this position", derived from the same tables the match
 * simulator itself uses — never hand-picked, so it can't drift from the real formulas the way a
 * separately-authored table could. Combines three real exposure sources:
 *
 * 1. Offensive — how much a position is preferred for each selectable action (`POSITION_PREFERENCE`),
 *    scaled by how often that position is even on the ball *in the zones where that action is
 *    reachable at all* (`LINE_ZONE_WEIGHT`, restricted to each action's real `canPerform` zone
 *    gate — see `ACTION_ZONES` below), times that action's attacker skill (`SKILL_WEIGHTS`).
 *    Without the zone restriction, a CB's tiny real chance of ever crossing or shooting would be
 *    counted at the same rate as a winger's, just because `POSITION_PREFERENCE` defaults to 1.0
 *    for any action/position pair it doesn't explicitly list.
 * 2. Defensive reactions — how often a position ends up as the contesting defender, read from
 *    `FIELD_LINE`/`LINE_ZONE_WEIGHT` at the defending side's own-half zones (zone indices 0–1,
 *    `home_box`/`home_third` — `selectContestingDefender` mirrors the ball into the defender's
 *    frame, so these are the zones a defending player is actually active in).
 * 3. Aerial/goalkeeping — `heading` only for the `headerAttempt` target pool (`ST`/`CB`);
 *    `gkSaving` only for `GK`.
 */

// Zone indices (0=home_box .. 4=away_box) where each action's own `canPerform` actually allows
// it — read directly off each generator in `action-generators.ts`. `short_pass`/`dribble` have no
// zone gate; `long_pass` excludes `away_box`; `through_ball`/`cross`/`shot` require the ball
// already advanced into the final third or box.
const ACTION_ZONES: Record<ActionType, readonly number[]> = {
  short_pass: [0, 1, 2, 3, 4],
  long_pass: [0, 1, 2, 3],
  through_ball: [2, 3],
  cross: [3, 4],
  dribble: [0, 1, 2, 3, 4],
  shot: [3, 4],
};

// short_pass/long_pass have no position restriction in any generator's `canPerform`; the other
// 4 (dribble/cross/through_ball/shot) are either explicitly excluded for GK (dribble/cross/
// through_ball) or practically unreachable for GK (shot requires the ball in the attacking
// third/box, where GK is never the active player) — so GK's offensive exposure is the passing
// actions only, while every other position is exposed to all 6.
const ALL_ACTION_TYPES: ActionType[] = ['short_pass', 'long_pass', 'through_ball', 'cross', 'dribble', 'shot'];
const GK_ACTION_TYPES: ActionType[] = ['short_pass', 'long_pass'];

// Own-half zone indices (home_box, home_third) — where the defending side's contesting defender
// is actually drawn from.
const DEFENDING_ZONES = [0, 1] as const;

function addWeighted(
  totals: Partial<Record<keyof PlayerAttributes, number>>,
  weights: Partial<Record<keyof PlayerAttributes, number>>,
  scale: number,
): void {
  for (const key of Object.keys(weights) as (keyof PlayerAttributes)[]) {
    totals[key] = (totals[key] ?? 0) + (weights[key] ?? 0) * scale;
  }
}

function lineWeightSum(position: FormationPosition, zones: readonly number[]): number {
  const lineWeights = LINE_ZONE_WEIGHT[FIELD_LINE[position]];
  return zones.reduce((sum: number, zone) => sum + lineWeights[zone], 0);
}

/** Accepts any `FormationPosition` (not just the 10-value `PlayerPosition`) so it also covers
 *  CDM/CAM, which appear in some formations (`4-2-3-1`, `4-1-4-1`, ...) but aren't a player's
 *  card position — `FIELD_LINE`/`getPositionPreference` already key on the wider set. */
export function positionAttributeImportance(position: FormationPosition): Partial<Record<keyof PlayerAttributes, number>> {
  const totals: Partial<Record<keyof PlayerAttributes, number>> = {};

  const actionTypes = position === 'GK' ? GK_ACTION_TYPES : ALL_ACTION_TYPES;
  for (const actionType of actionTypes) {
    const onBallInZone = lineWeightSum(position, ACTION_ZONES[actionType]);
    addWeighted(totals, SKILL_WEIGHTS[ACTION_TYPE_SKILL[actionType]], getPositionPreference(actionType, position) * onBallInZone);
  }

  const reactionWeight = lineWeightSum(position, DEFENDING_ZONES);
  addWeighted(totals, SKILL_WEIGHTS.tackling, reactionWeight);
  addWeighted(totals, SKILL_WEIGHTS.interception, reactionWeight);

  if (position === 'ST' || position === 'CB') {
    addWeighted(totals, SKILL_WEIGHTS.heading, 1);
  }
  if (position === 'GK') {
    addWeighted(totals, SKILL_WEIGHTS.gkSaving, 1);
  }

  const total = Object.values(totals).reduce((sum: number, v) => sum + (v ?? 0), 0);
  if (total <= 0) { return totals; }
  const normalized: Partial<Record<keyof PlayerAttributes, number>> = {};
  for (const key of Object.keys(totals) as (keyof PlayerAttributes)[]) {
    normalized[key] = (totals[key] ?? 0) / total;
  }
  return normalized;
}
