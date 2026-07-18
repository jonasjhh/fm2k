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
/** Residual per-attribute noise on top of the trait model — keeps two players with the
 *  same traits from being clones without drowning the traits themselves. */
const RESIDUAL_NOISE = 6;
/** Widest possible default potential margin above overall, for the youngest players. */
const MAX_POTENTIAL_MARGIN = 20;
/** Age at which the default potential margin has tapered to 0 — no upside left. */
const POTENTIAL_MARGIN_ZERO_AGE = 35;
/** Point budget every player's POSITION distributes across attributes in proportion to
 *  `positionAttributeImportance` (what the simulation itself rewards for that position) —
 *  the positional baseline the trait model then shapes. */
const ARCHETYPE_BUDGET = 40;

function positionBudget(position: PlayerPosition): Partial<Record<keyof PlayerAttributes, number>> {
  const importance = positionAttributeImportance(position);
  const result: Partial<Record<keyof PlayerAttributes, number>> = {};
  for (const key of Object.keys(importance) as (keyof PlayerAttributes)[]) {
    result[key] = Math.round((importance[key] ?? 0) * ARCHETYPE_BUDGET);
  }
  return result;
}

// ── the trait model ──────────────────────────────────────────────────────────────
// A player's build is a point in a small continuous trait space, not a class. The
// tradeoff AXES trade attribute against attribute (a sprinter buys speed with
// strength), the shared FACTORS move related attributes together (good touch means
// technique AND passing — the plausibility "dependencies"), and SPECIALIZATION
// scales the axes: 0 = complete player, 1 = extreme specialist. Free sampling is
// mildly U-shaped on the axes so archetype-like clusters are visible in the player
// mass while every intermediate shade still occurs. Nothing is stored on the player
// — a build only ever shows up through how the attributes play out in duels.

export interface TraitProfile {
  /** Sprinter (+1) ↔ tank (−1): trades speed against strength; the tank end drags technique a little. */
  physique: number;
  /** Creator (+1) ↔ destroyer (−1): trades passing/technique against defending. */
  craft: number;
  /** Finisher (+1) ↔ provider (−1): trades finishing against passing. */
  focus: number;
  /** GK only — shot-stopper (+1) ↔ commanding sweeper (−1): trades goalkeeping against defending/passing. */
  gk: number;
  /** 0 = complete player, 1 = extreme specialist; multiplies all axis displacements. */
  specialization: number;
}

/** Axis magnitudes at full displacement and specialization 1. */
const PHYSIQUE_MAG = 16;
const TANK_TECHNIQUE_DRAG = 6;
const CRAFT_PASSING = 14;
const CRAFT_TECHNIQUE = 10;
const CRAFT_DEFENDING = 14;
const FOCUS_FINISHING = 14;
const FOCUS_PASSING = 8;
const GK_KEEPING = 12;
const GK_DEFENDING = 7;
const GK_PASSING = 5;
/** Shared-factor magnitudes (NOT scaled by specialization — they are quality texture, not tradeoffs). */
const TOUCH_MAG = 6;
const ATHLETICISM_MAG = 5;

/** Attribute deltas a trait profile produces (before rescaling to the target overall).
 *  `touch`/`athleticism` are the shared factors, sampled by the caller. */
export function traitDeltas(
  traits: TraitProfile, position: PlayerPosition, touch: number, athleticism: number,
): Partial<Record<keyof PlayerAttributes, number>> {
  const s = traits.specialization;
  const d: Partial<Record<keyof PlayerAttributes, number>> = {
    speed: traits.physique * PHYSIQUE_MAG * s + athleticism * ATHLETICISM_MAG,
    strength: -traits.physique * PHYSIQUE_MAG * s + athleticism * ATHLETICISM_MAG,
    stamina: athleticism * ATHLETICISM_MAG,
    passing: traits.craft * CRAFT_PASSING * s - traits.focus * FOCUS_PASSING * s + touch * TOUCH_MAG,
    technique: traits.craft * CRAFT_TECHNIQUE * s
      + Math.min(0, traits.physique) * TANK_TECHNIQUE_DRAG * s + touch * TOUCH_MAG,
    finishing: traits.focus * FOCUS_FINISHING * s,
    defending: -traits.craft * CRAFT_DEFENDING * s,
  };
  if (position === 'GK') {
    d.goalkeeping = traits.gk * GK_KEEPING * s;
    d.defending = (d.defending ?? 0) - traits.gk * GK_DEFENDING * s;
    d.passing = (d.passing ?? 0) - traits.gk * GK_PASSING * s;
  }
  return d;
}

const NO_TRAITS: TraitProfile = { physique: 0, craft: 0, focus: 0, gk: 0, specialization: 0 };

/**
 * Named archetypes survive as PRESETS — fixed points in trait space — so callers and
 * tests can ask for a recognizable identity (a targetman is a specialized tank with a
 * finisher's focus). They are conveniences, not classes: free sampling (no archetype
 * given) covers the same space continuously.
 */
export const POSITION_ARCHETYPES: Record<PlayerPosition, Record<string, Partial<TraitProfile>>> = {
  GK: {
    balanced: { specialization: 0.3 },
    shot_stopper: { gk: 0.9, specialization: 0.85 },
    commanding: { gk: -0.9, specialization: 0.85 },
  },
  CB: {
    balanced: { specialization: 0.3 },
    stopper: { physique: -0.9, craft: -0.6, specialization: 0.85 },
    sweeper: { physique: 0.6, craft: -0.3, specialization: 0.7 },
    libero: { craft: 0.7, physique: -0.2, specialization: 0.8 },
  },
  LB: {
    balanced: { specialization: 0.3 },
    wingback: { physique: 0.8, craft: 0.4, specialization: 0.8 },
    fullback: { physique: -0.5, craft: -0.7, specialization: 0.8 },
  },
  RB: {
    balanced: { specialization: 0.3 },
    wingback: { physique: 0.8, craft: 0.4, specialization: 0.8 },
    fullback: { physique: -0.5, craft: -0.7, specialization: 0.8 },
  },
  CM: {
    balanced: { specialization: 0.3 },
    playmaker: { craft: 0.9, focus: -0.4, specialization: 0.85 },
    terrier: { craft: -0.8, physique: -0.4, specialization: 0.8 },
    long_shooter: { focus: 0.8, craft: 0.3, specialization: 0.8 },
  },
  LM: {
    balanced: { specialization: 0.3 },
    offensive: { physique: 0.7, craft: 0.4, specialization: 0.75 },
    defensive: { craft: -0.8, physique: -0.3, specialization: 0.8 },
  },
  RM: {
    balanced: { specialization: 0.3 },
    offensive: { physique: 0.7, craft: 0.4, specialization: 0.75 },
    defensive: { craft: -0.8, physique: -0.3, specialization: 0.8 },
  },
  LW: {
    balanced: { specialization: 0.3 },
    inverted: { focus: 0.8, craft: 0.2, specialization: 0.8 },
    touchline: { physique: 0.9, focus: -0.5, specialization: 0.8 },
  },
  RW: {
    balanced: { specialization: 0.3 },
    inverted: { focus: 0.8, craft: 0.2, specialization: 0.8 },
    touchline: { physique: 0.9, focus: -0.5, specialization: 0.8 },
  },
  ST: {
    balanced: { specialization: 0.3 },
    targetman: { physique: -0.9, focus: 0.4, specialization: 0.9 },
    poacher: { physique: 0.8, focus: 0.6, specialization: 0.85 },
    technical: { craft: 0.7, focus: -0.2, specialization: 0.8 },
    finisher: { focus: 0.9, specialization: 0.85 },
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

  /** Mildly U-shaped sample on [−1, 1]: ends slightly more common than a pure bell,
   *  so archetype-like clusters are visible without emptying the middle. */
  private sampleAxis(): number {
    const u = 2 * this.rng() - 1;
    return Math.sign(u) * Math.abs(u) ** 0.7;
  }

  /** Rough bell on [−1, 1] for the shared factors. */
  private sampleFactor(): number {
    return ((this.rng() + this.rng() + this.rng()) * 2) / 3 - 1;
  }

  /** Free-sampled build: axes U-shaped, specialization centred on 0.6 (a rare low
   *  roll is the complete player — the wonderkid when young with high potential). */
  private sampleTraits(): TraitProfile {
    return {
      physique: this.sampleAxis(),
      craft: this.sampleAxis(),
      focus: this.sampleAxis(),
      gk: this.sampleAxis(),
      specialization: clamp(0, 1, 0.6 + (this.rng() - 0.5) * 0.9),
    };
  }

  private generateAttributes(
    position: PlayerPosition,
    target: number,
    categoryBias: Partial<Record<AttributeCategory, number>>,
    archetype?: string,
  ): PlayerAttributes {
    const raw = {} as PlayerAttributes;
    const budget = positionBudget(position);
    const preset = archetype
      ? (POSITION_ARCHETYPES[position][archetype] ?? POSITION_ARCHETYPES[position].balanced)
      : undefined;
    const traits: TraitProfile = preset ? { ...NO_TRAITS, ...preset } : this.sampleTraits();
    const deltas = traitDeltas(traits, position, this.sampleFactor(), this.sampleFactor());
    const biasFor = (key: keyof PlayerAttributes): number => {
      const category = (Object.keys(ATTRIBUTE_CATEGORIES) as AttributeCategory[])
        .find(c => ATTRIBUTE_CATEGORIES[c].includes(key));
      return category ? (categoryBias[category] ?? 0) : 0;
    };
    for (const key of ATTR_KEYS) {
      const noise = (this.rng() - 0.5) * 2 * RESIDUAL_NOISE;
      // Deliberately unclamped here — clamping before the rescale below would pre-clip the very
      // attribute a position boost or category bias is meant to emphasize (most visible at high
      // targets, where e.g. a striker's finishing would saturate at 99 regardless of how far past
      // it the true target sits). The only clamp is on the final, rescaled result.
      raw[key] = target + noise + (budget[key] ?? 0) + (deltas[key] ?? 0) + biasFor(key);
    }
    // Rescale so the weighted overall lands on `target`, preserving the positional/category shape.
    const current = calculateOverall(raw);
    const scale = current > 0 ? target / current : 1;
    const result = {} as PlayerAttributes;
    for (const key of ATTR_KEYS) {
      result[key] = clamp(1, 99, Math.round(raw[key] * scale));
    }
    // Keeping is a specialist attribute: outfielders get a low value regardless of target
    // (it carries no overall weight, so this doesn't disturb the rescale above). The rare
    // outfield-keeper outlier is a Step 5.5 generator-rework concern (REWORK_01.md §10).
    if (position !== 'GK') {
      result.goalkeeping = clamp(1, 99, Math.round(5 + this.rng() * 15));
    }
    return result;
  }
}
