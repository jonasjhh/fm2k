import { NameGenerator, type Gender, type Country } from '@fm2k/names';
import { type Player, type PlayerAttributes, type PlayerPosition, calculateOverall } from '@fm2k/match';
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
/** Position emphasis on the 1–99 scale (a striker finishes better than they defend, etc.). */
const POSITION_BOOSTS: Partial<Record<PlayerPosition, Partial<Record<keyof PlayerAttributes, number>>>> = {
  GK:  { agility: 14, composure: 10, awareness: 10 },
  CB:  { defending: 18, strength: 10, awareness: 10 },
  LB:  { defending: 10, speed: 10, stamina: 10 },
  RB:  { defending: 10, speed: 10, stamina: 10 },
  CM:  { passing: 14, stamina: 14, technique: 10 },
  LM:  { speed: 14, passing: 10, stamina: 14 },
  RM:  { speed: 14, passing: 10, stamina: 14 },
  LW:  { speed: 18, technique: 10, agility: 10 },
  RW:  { speed: 18, technique: 10, agility: 10 },
  ST:  { finishing: 18, speed: 10, composure: 10 },
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
    const attributes = this.generateAttributes(position, target, instruction.categoryBias ?? {});
    const overall = Math.round(calculateOverall(attributes));
    const age = instruction.age ?? 17 + Math.floor(this.rng() * 19);
    const potential = instruction.potential ?? Math.min(99, overall + Math.floor(this.rng() * 20));
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

  private generateAttributes(
    position: PlayerPosition,
    target: number,
    categoryBias: Partial<Record<AttributeCategory, number>>,
  ): PlayerAttributes {
    const raw = {} as PlayerAttributes;
    const boosts = POSITION_BOOSTS[position] ?? {};
    const biasFor = (key: keyof PlayerAttributes): number => {
      const category = (Object.keys(ATTRIBUTE_CATEGORIES) as AttributeCategory[])
        .find(c => ATTRIBUTE_CATEGORIES[c].includes(key));
      return category ? (categoryBias[category] ?? 0) : 0;
    };
    for (const key of ATTR_KEYS) {
      const spread = (this.rng() - 0.5) * 2 * ATTR_SPREAD;
      raw[key] = clamp(1, 99, target + spread + (boosts[key] ?? 0) + biasFor(key));
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
