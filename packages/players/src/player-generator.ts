import { NameGenerator, type Gender, type Country } from '@fm2k/names';
import {
  type Player, type PlayerAttributes, type PlayerPosition, calculateOverall, positionAttributeImportance,
} from '@fm2k/match';
import { v4 as uuidv4 } from '@fm2k/state';
import type { CountryKey } from '@fm2k/names';

const COUNTRY_NATIONALITY: Record<CountryKey, string> = {
  norway:  'Norwegian',
  england: 'English',
  germany: 'German',
  france:  'French',
  spain:   'Spanish',
  italy:   'Italian',
  sweden:  'Swedish',
  denmark: 'Danish',
};

/** Default target overall when none is supplied. */
const DEFAULT_OVERALL = 60;
/** Per-attribute spread around the target overall (before position/category shaping). */
const ATTR_SPREAD = 16;
/** Widest possible default potential margin above overall, for the youngest players. */
const MAX_POTENTIAL_MARGIN = 20;
/** Age at which the default potential margin has tapered to 0 — no upside left. */
const POTENTIAL_MARGIN_ZERO_AGE = 35;
/** Point budget a position's `'balanced'` archetype distributes across attributes, in proportion
 *  to `positionAttributeImportance` — chosen close to the old `POSITION_BOOSTS`' typical total
 *  (its values clustered around 10–18) so `'balanced'` keeps roughly the same overall strength,
 *  just correctly distributed instead of hand-picked. */
const ARCHETYPE_BUDGET = 40;

function balancedArchetype(position: PlayerPosition): Partial<Record<keyof PlayerAttributes, number>> {
  const importance = positionAttributeImportance(position);
  const result: Partial<Record<keyof PlayerAttributes, number>> = {};
  for (const key of Object.keys(importance) as (keyof PlayerAttributes)[]) {
    result[key] = Math.round((importance[key] ?? 0) * ARCHETYPE_BUDGET);
  }
  return result;
}

/**
 * Named attribute modifier sets per position — values may be negative (modifiers, not just
 * boosts). `'balanced'` is generated from `positionAttributeImportance` (what the simulation
 * itself rewards most); the named alternates are deliberate departures from that baseline toward
 * a specific identity (a targetman trades speed for strength/aerial presence, etc.). An archetype
 * is never stored on the player — it only ever shows up through how the resulting attributes play
 * out in a real match (more aerial duels won, more chances created from the back, and so on).
 */
export const POSITION_ARCHETYPES: Record<PlayerPosition, Record<string, Partial<Record<keyof PlayerAttributes, number>>>> = {
  GK: {
    balanced: balancedArchetype('GK'),
    shot_stopper: { agility: 18, composure: -4, awareness: -2 },
    commanding: { awareness: 14, composure: 10, agility: -6 },
  },
  CB: {
    balanced: balancedArchetype('CB'),
    stopper: { strength: 16, defending: 14, agility: -6 },
    sweeper: { awareness: 14, agility: 12, strength: -4 },
    libero: { passing: 14, technique: 12, defending: -6 },
  },
  LB: {
    balanced: balancedArchetype('LB'),
    wingback: { speed: 14, technique: 8, passing: 8, defending: -6 },
    fullback: { defending: 14, strength: 8, awareness: 8, speed: -6 },
  },
  RB: {
    balanced: balancedArchetype('RB'),
    wingback: { speed: 14, technique: 8, passing: 8, defending: -6 },
    fullback: { defending: 14, strength: 8, awareness: 8, speed: -6 },
  },
  CM: {
    balanced: balancedArchetype('CM'),
    playmaker: { passing: 14, technique: 12, awareness: 8 },
    terrier: { defending: 14, strength: 10, stamina: 10, technique: -6 },
    long_shooter: { technique: 10, finishing: 12, composure: 10 },
  },
  LM: {
    balanced: balancedArchetype('LM'),
    offensive: { speed: 14, passing: 10, defending: -8 },
    defensive: { defending: 14, stamina: 10, awareness: 8, speed: -6, technique: -4 },
  },
  RM: {
    balanced: balancedArchetype('RM'),
    offensive: { speed: 14, passing: 10, defending: -8 },
    defensive: { defending: 14, stamina: 10, awareness: 8, speed: -6, technique: -4 },
  },
  LW: {
    balanced: balancedArchetype('LW'),
    inverted: { finishing: 14, composure: 10, technique: 8, passing: -6 },
    touchline: { speed: 14, passing: 10, finishing: -6 },
  },
  RW: {
    balanced: balancedArchetype('RW'),
    inverted: { finishing: 14, composure: 10, technique: 8, passing: -6 },
    touchline: { speed: 14, passing: 10, finishing: -6 },
  },
  ST: {
    balanced: balancedArchetype('ST'),
    targetman: { strength: 16, agility: 10, speed: -8 },
    poacher: { speed: 14, composure: 10, strength: -8 },
    technical: { technique: 14, agility: 8, passing: 6 },
    finisher: { finishing: 16, composure: 10 },
  },
};

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'agility', 'passing', 'finishing',
  'technique', 'defending', 'stamina', 'awareness', 'composure',
];

/** Attribute groupings a caller can bias as a whole — e.g. "amateurs have a worse mental game". */
export type AttributeCategory = 'physical' | 'technical' | 'mental';

export const ATTRIBUTE_CATEGORIES: Record<AttributeCategory, (keyof PlayerAttributes)[]> = {
  physical:  ['speed', 'strength', 'agility', 'stamina'],
  technical: ['passing', 'finishing', 'technique', 'defending'],
  mental:    ['awareness', 'composure'],
};

/** A normal distribution to sample a target overall from, instead of a fixed number. */
export interface OverallDistribution {
  mean: number;
  stdDev: number;
  /** Clamp bounds; default to the true 1–99 scale (no artificial floor/ceiling). */
  min?: number;
  max?: number;
}

/** Box-Muller sample from `dist`, clamped to its (or the 1–99 default) bounds. */
export function sampleNormal(dist: OverallDistribution, rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const sample = dist.mean + z * dist.stdDev;
  return clamp(dist.min ?? 1, dist.max ?? 99, sample);
}

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface PlayerInstruction {
  /** Target overall rating on the 1–99 scale. Wins outright over `overallDistribution` if given. */
  overall?: number;
  /** Sample the target overall from a normal distribution instead of a fixed number. */
  overallDistribution?: OverallDistribution;
  /** Explicit age; otherwise random 17–35. */
  age?: number;
  /** Explicit potential on the 1–99 scale; otherwise overall + a random margin. */
  potential?: number;
  /** Flat per-category offset applied alongside the position boost, before the rescale-to-target step. */
  categoryBias?: Partial<Record<AttributeCategory, number>>;
  /** Named modifier set from `POSITION_ARCHETYPES[position]`; falls back to `'balanced'` if omitted or unrecognized. */
  archetype?: string;
}

export class PlayerGenerator {
  private nameGenerator: NameGenerator;
  private readonly nationality: string;

  constructor(
    gender: Gender = 'female',
    country: Country = 'all',
    private readonly rng: () => number = Math.random,
  ) {
    this.nameGenerator = new NameGenerator(gender, country, rng);
    this.nationality = country === 'all' ? 'Unknown' : COUNTRY_NATIONALITY[country];
  }

  /**
   * Generate a player whose attributes are shaped for `position` (and any `categoryBias`) and
   * scaled so their overall rating lands near the resolved target on the **1–99 scale**. (Scaling
   * lives here rather than in callers — there is a single canonical place attributes are produced.)
   */
  generatePlayer(position: PlayerPosition, instruction: PlayerInstruction = {}): Player {
    const target = clamp(1, 99, this.resolveTarget(instruction));
    const attributes = this.generateAttributes(position, target, instruction.categoryBias ?? {}, instruction.archetype);
    const overall = Math.round(calculateOverall(attributes));
    const age = instruction.age ?? 17 + Math.floor(this.rng() * 19);
    const potential = instruction.potential ?? Math.min(99, overall + Math.floor(this.rng() * (this.maxPotentialMargin(age) + 1)));
    return {
      id: uuidv4(),
      name: this.nameGenerator.generateName(),
      nationality: this.nationality,
      age,
      position,
      potential,
      attributes,
    };
  }

  private resolveTarget(instruction: PlayerInstruction): number {
    if (instruction.overall !== undefined) { return instruction.overall; }
    if (instruction.overallDistribution) { return sampleNormal(instruction.overallDistribution, this.rng); }
    return DEFAULT_OVERALL;
  }

  /** Younger players have more room left to grow; the ceiling tapers to 0 by age 35. */
  private maxPotentialMargin(age: number): number {
    return Math.round(MAX_POTENTIAL_MARGIN * clamp(0, 1, (POTENTIAL_MARGIN_ZERO_AGE - age) / (POTENTIAL_MARGIN_ZERO_AGE - 17)));
  }

  private generateAttributes(
    position: PlayerPosition,
    target: number,
    categoryBias: Partial<Record<AttributeCategory, number>>,
    archetype?: string,
  ): PlayerAttributes {
    const raw = {} as PlayerAttributes;
    const archetypes = POSITION_ARCHETYPES[position];
    const boosts = (archetype ? archetypes[archetype] : undefined) ?? archetypes.balanced;
    const biasFor = (key: keyof PlayerAttributes): number => {
      const category = (Object.keys(ATTRIBUTE_CATEGORIES) as AttributeCategory[])
        .find(c => ATTRIBUTE_CATEGORIES[c].includes(key));
      return category ? (categoryBias[category] ?? 0) : 0;
    };
    for (const key of ATTR_KEYS) {
      const spread = (this.rng() - 0.5) * 2 * ATTR_SPREAD;
      // Deliberately unclamped here — clamping before the rescale below would pre-clip the very
      // attribute a position boost or category bias is meant to emphasize (most visible at high
      // targets, where e.g. a striker's finishing would saturate at 99 regardless of how far past
      // it the true target sits). The only clamp is on the final, rescaled result.
      raw[key] = target + spread + (boosts[key] ?? 0) + biasFor(key);
    }
    // Rescale so the weighted overall lands on `target`, preserving the positional/category shape.
    const current = calculateOverall(raw);
    const scale = current > 0 ? target / current : 1;
    const result = {} as PlayerAttributes;
    for (const key of ATTR_KEYS) {
      result[key] = clamp(1, 99, Math.round(raw[key] * scale));
    }
    return result;
  }
}
