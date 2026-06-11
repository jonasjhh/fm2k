import { calculateOverall } from '@fm2k/engine';
import type { Player } from '@fm2k/engine';

export function getTeamOVR(starters: Player[]): number {
  if (starters.length === 0) {return 0;}
  return Math.round(starters.reduce((s, p) => s + calculateOverall(p.attributes), 0) / starters.length);
}

export function sellPrice(attrs: Parameters<typeof calculateOverall>[0]): number {
  return Math.max(1_000, Math.round(calculateOverall(attrs)) * 5_000);
}
