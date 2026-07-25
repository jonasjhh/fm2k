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
/** Residual per-attribute noise on top of the archetype model — keeps two players with the
 *  same archetype from being clones without drowning the archetype shape. */
const RESIDUAL_NOISE = 6;
/** Widest possible default potential margin above overall, for the youngest players. */
const MAX_POTENTIAL_MARGIN = 20;
/** Age at which the default potential margin has tapered to 0 — no upside left. */
const POTENTIAL_MARGIN_ZERO_AGE = 35;
/** Point budget every player's POSITION distributes across attributes in proportion to
 *  `positionAttributeImportance` (what the simulation itself rewards for that position) —
 *  the positional baseline the archetype then shapes. */
const ARCHETYPE_BUDGET = 40;

function positionBudget(position: PlayerPosition): Partial<Record<keyof PlayerAttributes, number>> {
  const importance = positionAttributeImportance(position);
  const result: Partial<Record<keyof PlayerAttributes, number>> = {};
  for (const key of Object.keys(importance) as (keyof PlayerAttributes)[]) {
    result[key] = Math.round((importance[key] ?? 0) * ARCHETYPE_BUDGET);
  }
  return result;
}

// ── archetype model ──────────────────────────────────────────────────────────────
// Each archetype defines direct attribute deltas at magnitude 1.0. When generating a player,
// a magnitude (0–1) is sampled and scales all deltas: 0 = nearly balanced, 1 = full expression.
// Since the generator rescales the result to the target overall, deltas shift the *distribution*
// of stats across attributes without changing the player's OVR level.

export interface ArchetypeDefinition {
  /** Probability weight as a percentage. All archetypes for a position must sum to 100. */
  weight: number;
  /** Attribute deltas applied at full magnitude (1.0). Must sum to zero. */
  deltas: Partial<Record<keyof PlayerAttributes, number>>;
}

export const POSITION_ARCHETYPES: Record<PlayerPosition, Record<string, ArchetypeDefinition>> = {
  GK: {
    balanced:     { weight: 60, deltas: {} },
    quick:        { weight: 25, deltas: { goalkeeping: +8, speed: +10, strength: -10, passing: -8 } },
    strong:       { weight: 15, deltas: { goalkeeping: +8, strength: +10, speed: -10, passing: -8 } },
  },
  CB: {
    balanced:     { weight: 60, deltas: {} },
    stopper:      { weight: 18, deltas: { strength: +10, defending: +8, speed: -10, passing: -8 } },
    ball_playing: { weight: 14, deltas: { speed: +8, passing: +10, strength: -10, defending: -8 } },
    libero:       { weight:  8, deltas: { passing: +12, technique: +6, defending: -10, strength: -8 } },
  },
  LB: {
    balanced:  { weight: 60, deltas: {} },
    wingback:  { weight: 20, deltas: { speed: +10, passing: +8, defending: -10, strength: -8 } },
    fullback:  { weight: 20, deltas: { defending: +10, strength: +8, speed: -10, passing: -8 } },
  },
  RB: {
    balanced:  { weight: 60, deltas: {} },
    wingback:  { weight: 20, deltas: { speed: +10, passing: +8, defending: -10, strength: -8 } },
    fullback:  { weight: 20, deltas: { defending: +10, strength: +8, speed: -10, passing: -8 } },
  },
  CM: {
    balanced:     { weight: 60, deltas: {} },
    playmaker:    { weight: 16, deltas: { passing: +10, technique: +8, defending: -10, finishing: -8 } },
    terrier:      { weight: 16, deltas: { defending: +10, stamina: +8, passing: -10, technique: -8 } },
    long_shooter: { weight:  8, deltas: { finishing: +10, technique: +8, defending: -10, stamina: -8 } },
  },
  LM: {
    balanced:   { weight: 60, deltas: {} },
    offensive:  { weight: 25, deltas: { speed: +10, finishing: +8, defending: -10, strength: -8 } },
    defensive:  { weight: 15, deltas: { defending: +10, stamina: +8, finishing: -10, speed: -8 } },
  },
  RM: {
    balanced:   { weight: 60, deltas: {} },
    offensive:  { weight: 25, deltas: { speed: +10, finishing: +8, defending: -10, strength: -8 } },
    defensive:  { weight: 15, deltas: { defending: +10, stamina: +8, finishing: -10, speed: -8 } },
  },
  LW: {
    balanced:   { weight: 60, deltas: {} },
    inverted:   { weight: 24, deltas: { finishing: +10, technique: +8, speed: -10, stamina: -8 } },
    touchline:  { weight: 16, deltas: { speed: +10, stamina: +8, finishing: -10, technique: -8 } },
  },
  RW: {
    balanced:   { weight: 60, deltas: {} },
    inverted:   { weight: 24, deltas: { finishing: +10, technique: +8, speed: -10, stamina: -8 } },
    touchline:  { weight: 16, deltas: { speed: +10, stamina: +8, finishing: -10, technique: -8 } },
  },
  ST: {
    balanced:  { weight: 60, deltas: {} },
    targetman: { weight: 12, deltas: { strength: +10, finishing: +8, speed: -10, passing: -8 } },
    poacher:   { weight: 12, deltas: { speed: +10, finishing: +8, strength: -10, technique: -8 } },
    technical: { weight:  8, deltas: { technique: +10, passing: +8, finishing: -10, strength: -8 } },
    finisher:  { weight:  8, deltas: { finishing: +12, technique: +6, passing: -10, strength: -8 } },
  },
};

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'stamina', 'passing', 'technique',
  'finishing', 'defending', 'goalkeeping',
];

/** Attribute groupings a caller can bias as a whole — e.g. "amateurs are technically rougher". */
export type AttributeCategory = 'physical' | 'technical';

export const ATTRIBUTE_CATEGORIES: Record<AttributeCategory, (keyof PlayerAttributes)[]> = {
  physical:  ['speed', 'strength', 'stamina'],
  technical: ['passing', 'finishing', 'technique', 'defending', 'goalkeeping'],
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
  /** Named archetype from `POSITION_ARCHETYPES[position]`; falls back to `'balanced'` if omitted or unrecognized.
   *  When given, the archetype is fixed but magnitude is still sampled — so two players of the same
   *  explicit archetype will differ in how strongly the archetype expresses. */
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

  private pickWeightedArchetype(archetypes: Record<string, ArchetypeDefinition>): string {
    const entries = Object.entries(archetypes);
    let r = this.rng() * 100;
    for (const [name, def] of entries) {
      r -= def.weight;
      if (r <= 0) { return name; }
    }
    return entries[entries.length - 1][0];
  }

  /** Sample an archetype magnitude. Mildly weighted toward higher values so distinct archetypes
   *  are visible in the player mass, while the low end (near-balanced) still occurs. */
  private sampleMagnitude(): number {
    return Math.sqrt(this.rng());
  }

  private generateAttributes(
    position: PlayerPosition,
    target: number,
    categoryBias: Partial<Record<AttributeCategory, number>>,
    archetype?: string,
  ): PlayerAttributes {
    const raw = {} as PlayerAttributes;
    const budget = positionBudget(position);

    const archetypes = POSITION_ARCHETYPES[position];
    const archetypeNames = Object.keys(archetypes);
    const selectedName = archetype
      ? (archetypeNames.includes(archetype) ? archetype : 'balanced')
      : this.pickWeightedArchetype(archetypes);
    const deltas = archetypes[selectedName].deltas;
    const magnitude = this.sampleMagnitude();

    const biasFor = (key: keyof PlayerAttributes): number => {
      const category = (Object.keys(ATTRIBUTE_CATEGORIES) as AttributeCategory[])
        .find(c => ATTRIBUTE_CATEGORIES[c].includes(key));
      return category ? (categoryBias[category] ?? 0) : 0;
    };

    for (const key of ATTR_KEYS) {
      const noise = (this.rng() - 0.5) * 2 * RESIDUAL_NOISE;
      // Deliberately unclamped here — clamping before the rescale below would pre-clip the very
      // attribute a position boost or archetype is meant to emphasize (most visible at high
      // targets, where e.g. a striker's finishing would saturate at 99 regardless of how far past
      // it the true target sits). The only clamp is on the final, rescaled result.
      raw[key] = target + noise + (budget[key] ?? 0) + (deltas[key] ?? 0) * magnitude + biasFor(key);
    }

    // Rescale so the weighted overall lands on `target`, preserving the positional/archetype shape.
    const current = calculateOverall(raw);
    const scale = current > 0 ? target / current : 1;
    const result = {} as PlayerAttributes;
    for (const key of ATTR_KEYS) {
      result[key] = clamp(1, 99, Math.round(raw[key] * scale));
    }
    // Keeping is a specialist attribute: outfielders get a low value regardless of target
    // (it carries no overall weight, so this doesn't disturb the rescale above).
    if (position !== 'GK') {
      result.goalkeeping = clamp(1, 99, Math.round(5 + this.rng() * 15));
    }
    return result;
  }
}
