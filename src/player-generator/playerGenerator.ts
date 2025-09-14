import { NameGenerator, type Gender, type Country } from '../name-generator/name_generator.js';
import { type Player, type PlayerAttributes, type Position } from '../fm-types/types.js';
import { v4 as uuidv4 } from '../uuid/uuid.js';

export interface PlayerGenerationConfig {
  position: Position;
  gender?: Gender;
  country?: Country;
  minAttribute?: number;
  maxAttribute?: number;
}

export class PlayerGenerator {
  private nameGenerator: NameGenerator;

  constructor(
    private config: {
      gender?: Gender;
      country?: Country;
      minAttribute?: number;
      maxAttribute?: number;
    } = {},
  ) {
    this.nameGenerator = new NameGenerator(
      config.gender ?? 'all',
      config.country ?? 'all',
    );
  }

  generatePlayer(position: Position, overrides: Partial<PlayerGenerationConfig> = {}): Player {
    const config = { ...this.config, position, ...overrides };

    return {
      id: uuidv4(),
      name: this.nameGenerator.generateName(),
      position,
      attributes: this.generateAttributes(position, config.minAttribute, config.maxAttribute),
    };
  }

  generatePlayers(position: Position, count: number, overrides: Partial<PlayerGenerationConfig> = {}): Player[] {
    return Array.from({ length: count }, () => this.generatePlayer(position, overrides));
  }

  generateSquad(formation = '4-4-2'): Player[] {
    const positions = this.getPositionsForFormation(formation);
    return positions.map(position => this.generatePlayer(position));
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

  private getPositionsForFormation(formation: string): Position[] {
    const formations: Record<string, Position[]> = {
      '4-4-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
      '4-3-3': ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'ST', 'RW'],
      '3-5-2': ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST', 'ST'],
      '4-2-3-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LW', 'CAM', 'RW', 'ST'],
      '5-3-2': ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'ST', 'ST'],
      '4-5-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST'],
      '3-4-3': ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW'],
    };

    return formations[formation] || formations['4-4-2'];
  }
}
