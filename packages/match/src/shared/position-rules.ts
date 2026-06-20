import type { PlayerPosition, FormationPosition, PlayerAttributes, Player } from './types.ts';

const SECONDARY_POSITIONS: Record<PlayerPosition, FormationPosition[]> = {
  GK:  [],
  CB:  ['CDM'],
  LB:  ['LM', 'LW'],
  RB:  ['RM', 'RW'],
  CM:  ['CAM', 'CDM'],
  LM:  ['LW', 'LB'],
  RM:  ['RW', 'RB'],
  LW:  ['LM', 'ST'],
  RW:  ['RM', 'ST'],
  ST:  ['LW', 'RW'],
};

const SECONDARY_MODIFIER = 0.90;
const OUT_OF_POSITION_MODIFIER = 0.75;

export function getPositionModifier(natural: PlayerPosition, fielded: FormationPosition): number {
  if (natural === fielded) { return 1.0; }
  if (SECONDARY_POSITIONS[natural].includes(fielded)) { return SECONDARY_MODIFIER; }
  return OUT_OF_POSITION_MODIFIER;
}

export function getEffectiveAttributes(player: Player, fieldedPosition: FormationPosition): PlayerAttributes {
  const modifier = getPositionModifier(player.position, fieldedPosition);
  if (modifier === 1.0) { return player.attributes; }
  const attrs = player.attributes;
  return {
    speed:     Math.round(attrs.speed     * modifier),
    strength:  Math.round(attrs.strength  * modifier),
    agility:   Math.round(attrs.agility   * modifier),
    passing:   Math.round(attrs.passing   * modifier),
    finishing: Math.round(attrs.finishing * modifier),
    technique: Math.round(attrs.technique * modifier),
    defending: Math.round(attrs.defending * modifier),
    stamina:   Math.round(attrs.stamina   * modifier),
    awareness: Math.round(attrs.awareness * modifier),
    composure: Math.round(attrs.composure * modifier),
  };
}
