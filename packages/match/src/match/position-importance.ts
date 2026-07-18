import type { PlayerAttributes, FormationPosition } from '../shared/types.ts';
import { BAND_OF_ROLE, type Band } from '../lineup/bands.ts';
import {
  SPEED_DUEL, STRENGTH_DUEL, DRIBBLE_DUEL, PASS_DUEL, SHOT_DUEL, type DuelSpec,
} from './duel/duels.ts';

/**
 * "What attributes actually matter for this position", derived from the duel engine's
 * own specs — each band's typical exposure to the five duels (as the acting side and as
 * the resisting side) pulls in exactly the attributes those duels read, so the table
 * can't drift from the real mechanics the way a hand-authored one could. Delivery
 * checks (crosses/long balls/set pieces) are Passing-gated solo checks, counted via
 * the `delivery` exposure; Stamina matters through fatigue scaling and Speed through
 * the movement model, counted as flat per-band exposures.
 */

interface DuelExposure {
  /** Weight as the acting side (uses the spec's attackerAttr). */
  atk: number;
  /** Weight as the resisting side (uses the spec's defenderAttr). */
  def: number;
}

interface BandExposure {
  speed: DuelExposure;
  strength: DuelExposure;
  dribble: DuelExposure;
  pass: DuelExposure;
  shot: DuelExposure;
  /** Solo Passing checks: crosses, long balls, set-piece delivery. */
  delivery: number;
  /** Fatigue exposure (drain + attribute scaling under fatigue). */
  stamina: number;
  /** Movement exposure beyond speed duels (travel to anchors, recovery runs). */
  movement: number;
}

const BAND_EXPOSURE: Record<Band, BandExposure> = {
  GK: {
    speed: { atk: 0, def: 0.1 }, strength: { atk: 0.1, def: 0.1 },
    dribble: { atk: 0, def: 0 }, pass: { atk: 0.5, def: 0 },
    shot: { atk: 0, def: 3 }, delivery: 0.4, stamina: 0.1, movement: 0.1,
  },
  DEF: {
    speed: { atk: 0.4, def: 0.7 }, strength: { atk: 0.5, def: 0.6 },
    dribble: { atk: 0.1, def: 1.2 }, pass: { atk: 0.6, def: 1 },
    shot: { atk: 0.05, def: 0 }, delivery: 0.2, stamina: 0.6, movement: 0.5,
  },
  DM: {
    speed: { atk: 0.3, def: 0.4 }, strength: { atk: 0.4, def: 0.4 },
    dribble: { atk: 0.3, def: 0.9 }, pass: { atk: 1, def: 0.9 },
    shot: { atk: 0.1, def: 0 }, delivery: 0.3, stamina: 0.9, movement: 0.6,
  },
  MID: {
    speed: { atk: 0.4, def: 0.4 }, strength: { atk: 0.3, def: 0.3 },
    dribble: { atk: 0.6, def: 0.5 }, pass: { atk: 1.2, def: 0.5 },
    shot: { atk: 0.3, def: 0 }, delivery: 0.5, stamina: 1, movement: 0.7,
  },
  AM: {
    speed: { atk: 0.5, def: 0.2 }, strength: { atk: 0.2, def: 0.2 },
    dribble: { atk: 1, def: 0.2 }, pass: { atk: 1, def: 0.2 },
    shot: { atk: 0.7, def: 0 }, delivery: 0.5, stamina: 0.8, movement: 0.7,
  },
  ATT: {
    speed: { atk: 0.8, def: 0.1 }, strength: { atk: 0.7, def: 0.1 },
    dribble: { atk: 0.9, def: 0.1 }, pass: { atk: 0.4, def: 0.1 },
    shot: { atk: 1.4, def: 0 }, delivery: 0.2, stamina: 0.7, movement: 0.6,
  },
};

/** Wide roles live off pace and delivery into the box more than their central bandmates. */
const WIDE_ROLES = new Set<FormationPosition>(['LB', 'RB', 'LM', 'RM', 'LW', 'RW']);
const WIDE_SPEED_BONUS = 0.3;
const WIDE_DELIVERY_BONUS = 0.3;

const DUEL_OF: Record<Exclude<keyof BandExposure, 'delivery' | 'stamina' | 'movement'>, DuelSpec> = {
  speed: SPEED_DUEL, strength: STRENGTH_DUEL, dribble: DRIBBLE_DUEL, pass: PASS_DUEL, shot: SHOT_DUEL,
};

function add(
  totals: Partial<Record<keyof PlayerAttributes, number>>,
  attr: keyof PlayerAttributes,
  weight: number,
): void {
  if (weight <= 0) { return; }
  totals[attr] = (totals[attr] ?? 0) + weight;
}

export function positionAttributeImportance(position: FormationPosition): Partial<Record<keyof PlayerAttributes, number>> {
  const exposure = BAND_EXPOSURE[BAND_OF_ROLE[position]];
  const totals: Partial<Record<keyof PlayerAttributes, number>> = {};

  for (const key of Object.keys(DUEL_OF) as (keyof typeof DUEL_OF)[]) {
    const spec = DUEL_OF[key];
    add(totals, spec.attackerAttr, exposure[key].atk);
    add(totals, spec.defenderAttr, exposure[key].def);
  }

  const wide = WIDE_ROLES.has(position);
  add(totals, 'passing', exposure.delivery + (wide ? WIDE_DELIVERY_BONUS : 0));
  add(totals, 'stamina', exposure.stamina);
  add(totals, 'speed', exposure.movement + (wide ? WIDE_SPEED_BONUS : 0));

  const total = Object.values(totals).reduce((sum: number, v) => sum + (v ?? 0), 0);
  if (total <= 0) { return totals; }
  const normalized: Partial<Record<keyof PlayerAttributes, number>> = {};
  for (const key of Object.keys(totals) as (keyof PlayerAttributes)[]) {
    normalized[key] = (totals[key] ?? 0) / total;
  }
  return normalized;
}
