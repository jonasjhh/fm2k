import { NameGenerator, type Gender, type Country } from '@fm2k/names';
import { type Player, type PlayerAttributes, type Position, calculateOverall } from '@fm2k/match';
import { v4 as uuidv4 } from '@fm2k/state';
import type { CountryId } from '../data/teams-data.ts';

const COUNTRY_NATIONALITY: Record<CountryId, string> = {
  norway:  'norwegian',
  england: 'english',
  germany: 'german',
  france:  'french',
  spain:   'spanish',
  italy:   'italian',
  sweden:  'swedish',
  denmark: 'danish',
};

/** Default target overall when none is supplied. */
const DEFAULT_OVERALL = 60;
/** Per-attribute spread around the target overall (before position shaping). */
const ATTR_SPREAD = 16;
/** Position emphasis on the 1–99 scale (a striker finishes better than they defend, etc.). */
const POSITION_BOOSTS: Partial<Record<Position, Partial<Record<keyof PlayerAttributes, number>>>> = {
  GK:  { agility: 14, composure: 10, awareness: 10 },
  CB:  { defending: 18, strength: 10, awareness: 10 },
  LB:  { defending: 10, speed: 10, stamina: 10 },
  RB:  { defending: 10, speed: 10, stamina: 10 },
  CDM: { defending: 14, passing: 10, awareness: 10 },
  CM:  { passing: 14, stamina: 14, technique: 10 },
  CAM: { passing: 14, technique: 14, composure: 10 },
  LM:  { speed: 14, passing: 10, stamina: 14 },
  RM:  { speed: 14, passing: 10, stamina: 14 },
  LW:  { speed: 18, technique: 10, agility: 10 },
  RW:  { speed: 18, technique: 10, agility: 10 },
  ST:  { finishing: 18, speed: 10, composure: 10 },
  CF:  { finishing: 14, technique: 14, composure: 10 },
};

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'agility', 'passing', 'finishing',
  'technique', 'defending', 'stamina', 'awareness', 'composure',
];

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface GeneratePlayerOptions {
  /** Target overall rating on the 1–99 scale (default 60). Attributes are shaped to land near it. */
  overall?: number;
  /** Explicit age; otherwise random 17–35. */
  age?: number;
  /** Explicit potential on the 1–99 scale; otherwise overall + a random margin. */
  potential?: number;
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
    this.nationality = country === 'all' ? 'unknown' : COUNTRY_NATIONALITY[country];
  }

  /**
   * Generate a player whose attributes are shaped for `position` and scaled so their overall
   * rating lands near `options.overall` on the **1–99 scale**. (Scaling lives here rather than in
   * callers — there is a single canonical place attributes are produced.)
   */
  generatePlayer(position: Position, options: GeneratePlayerOptions = {}): Player {
    const target = clamp(1, 99, options.overall ?? DEFAULT_OVERALL);
    const attributes = this.generateAttributes(position, target);
    const overall = Math.round(calculateOverall(attributes));
    const age = options.age ?? 17 + Math.floor(this.rng() * 19);
    const potential = options.potential ?? Math.min(99, overall + Math.floor(this.rng() * 20));
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

  private generateAttributes(position: Position, target: number): PlayerAttributes {
    const raw = {} as PlayerAttributes;
    const boosts = POSITION_BOOSTS[position] ?? {};
    for (const key of ATTR_KEYS) {
      const spread = (this.rng() - 0.5) * 2 * ATTR_SPREAD;
      raw[key] = clamp(1, 99, target + spread + (boosts[key] ?? 0));
    }
    // Rescale so the weighted overall lands on `target`, preserving the positional shape.
    const current = calculateOverall(raw);
    const scale = current > 0 ? target / current : 1;
    const result = {} as PlayerAttributes;
    for (const key of ATTR_KEYS) {
      result[key] = clamp(1, 99, Math.round(raw[key] * scale));
    }
    return result;
  }
}
