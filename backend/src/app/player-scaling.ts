import { calculateOverall } from '@fm2k/engine';
import type { PlayerAttributes } from '@fm2k/engine';

/**
 * Scale a player's attributes so their overall rating lands near `targetOvr`,
 * clamped to the full 1–99 attribute range. Tier bands (per design): tier-3
 * ~10–40, tier-2 ~30–60, tier-1 ~40–70 with the odd 70+, world class 80+, the
 * very best 90+.
 */
export function scaleAttributes(attrs: PlayerAttributes, targetOvr: number): PlayerAttributes {
  const currentOvr = calculateOverall(attrs);
  const scale = targetOvr / (currentOvr * 5);
  const result = {} as PlayerAttributes;
  for (const [k, v] of Object.entries(attrs)) {
    (result as unknown as Record<string, number>)[k] = Math.max(1, Math.min(99, Math.round(v * scale * 5)));
  }
  return result;
}
