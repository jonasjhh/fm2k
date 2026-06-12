import { NameGenerator, type Gender, type Country } from '@fm2k/names';
import { type Player, type PlayerAttributes, type Position } from '../shared/types.ts';
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

export class PlayerGenerator {
  private nameGenerator: NameGenerator;
  private readonly nationality: string;

  constructor(gender: Gender = 'female', country: Country = 'all') {
    this.nameGenerator = new NameGenerator(gender, country);
    this.nationality = country === 'all' ? 'unknown' : COUNTRY_NATIONALITY[country];
  }

  generatePlayer(position: Position, minAttribute = 1, maxAttribute = 20): Player {
    const attrs = this.generateAttributes(position, minAttribute, maxAttribute);
    const avgAttr = Math.round(Object.values(attrs).reduce((a, b) => a + b, 0) / Object.values(attrs).length);
    const potential = Math.min(99, avgAttr + Math.floor(Math.random() * 20));
    return {
      id: uuidv4(),
      name: this.nameGenerator.generateName(),
      nationality: this.nationality,
      age: 17 + Math.floor(Math.random() * 19),
      position,
      potential,
      attributes: attrs,
    };
  }

  private generateAttributes(position: Position, minAttr = 1, maxAttr = 20): PlayerAttributes {
    const baseAttributes = this.generateRandomAttributes(minAttr, maxAttr);
    return this.adjustAttributesForPosition(baseAttributes, position);
  }

  private generateRandomAttributes(min: number, max: number): PlayerAttributes {
    const random = () => Math.floor(Math.random() * (max - min + 1)) + min;

    return {
      speed: random(),
      strength: random(),
      agility: random(),
      passing: random(),
      finishing: random(),
      technique: random(),
      defending: random(),
      stamina: random(),
      awareness: random(),
      composure: random(),
    };
  }

  private adjustAttributesForPosition(attributes: PlayerAttributes, position: Position): PlayerAttributes {
    const positionBoosts: Partial<Record<Position, Partial<PlayerAttributes>>> = {
      GK: {
        agility: Math.min(20, attributes.agility + 3),
        composure: Math.min(20, attributes.composure + 2),
        awareness: Math.min(20, attributes.awareness + 2),
      },
      CB: {
        defending: Math.min(20, attributes.defending + 4),
        strength: Math.min(20, attributes.strength + 2),
        awareness: Math.min(20, attributes.awareness + 2),
      },
      LB: {
        defending: Math.min(20, attributes.defending + 2),
        speed: Math.min(20, attributes.speed + 2),
        stamina: Math.min(20, attributes.stamina + 2),
      },
      RB: {
        defending: Math.min(20, attributes.defending + 2),
        speed: Math.min(20, attributes.speed + 2),
        stamina: Math.min(20, attributes.stamina + 2),
      },
      CDM: {
        defending: Math.min(20, attributes.defending + 3),
        passing: Math.min(20, attributes.passing + 2),
        awareness: Math.min(20, attributes.awareness + 2),
      },
      CM: {
        passing: Math.min(20, attributes.passing + 3),
        stamina: Math.min(20, attributes.stamina + 3),
        technique: Math.min(20, attributes.technique + 2),
      },
      CAM: {
        passing: Math.min(20, attributes.passing + 3),
        technique: Math.min(20, attributes.technique + 3),
        composure: Math.min(20, attributes.composure + 2),
      },
      LM: {
        speed: Math.min(20, attributes.speed + 3),
        passing: Math.min(20, attributes.passing + 2),
        stamina: Math.min(20, attributes.stamina + 3),
      },
      RM: {
        speed: Math.min(20, attributes.speed + 3),
        passing: Math.min(20, attributes.passing + 2),
        stamina: Math.min(20, attributes.stamina + 3),
      },
      LW: {
        speed: Math.min(20, attributes.speed + 4),
        technique: Math.min(20, attributes.technique + 2),
        agility: Math.min(20, attributes.agility + 2),
      },
      RW: {
        speed: Math.min(20, attributes.speed + 4),
        technique: Math.min(20, attributes.technique + 2),
        agility: Math.min(20, attributes.agility + 2),
      },
      ST: {
        finishing: Math.min(20, attributes.finishing + 4),
        speed: Math.min(20, attributes.speed + 2),
        composure: Math.min(20, attributes.composure + 2),
      },
      CF: {
        finishing: Math.min(20, attributes.finishing + 3),
        technique: Math.min(20, attributes.technique + 3),
        composure: Math.min(20, attributes.composure + 2),
      },
    };

    const boosts = positionBoosts[position];
    return boosts ? { ...attributes, ...boosts } : attributes;
  }
}
