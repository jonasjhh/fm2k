import { NameGenerator, type Gender, type Country } from '../name-generator/name_generator.js';
import { type Player, type PlayerAttributes, type Position } from '../fm-types/types.js';
import { v4 as uuidv4 } from '../uuid/uuid.js';

export class PlayerGenerator {
  private nameGenerator: NameGenerator;

  constructor(gender: Gender = 'all', country: Country = 'all') {
    this.nameGenerator = new NameGenerator(gender, country);
  }

  generatePlayer(position: Position, minAttribute = 1, maxAttribute = 20): Player {
    return {
      id: uuidv4(),
      name: this.nameGenerator.generateName(),
      position,
      attributes: this.generateAttributes(position, minAttribute, maxAttribute),
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
