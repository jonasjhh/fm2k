import { calculateOverall } from '@fm2k/engine';
import type { PlayerAttributes } from '@fm2k/engine';

/**
 * Scale a player's attributes so their overall rating lands near `targetOvr`
 * (clamped to a sane 40–99 per-attribute range).
 */
export function scaleAttributes(attrs: PlayerAttributes, targetOvr: number): PlayerAttributes {
  const currentOvr = calculateOverall(attrs);
  const scale = targetOvr / (currentOvr * 5);
  const result = {} as PlayerAttributes;
  for (const [k, v] of Object.entries(attrs)) {
    (result as unknown as Record<string, number>)[k] = Math.max(40, Math.min(99, Math.round(v * scale * 5)));
  }
  return result;
}
