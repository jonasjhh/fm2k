import type { Player } from '../shared/types.ts';

/** An injury picked up in a match — duration is *pre-mitigation* (before medical facilities). */
export interface InjuryReport {
  playerId: string;
  type: string;
  /** Matches out, before any club medical-facility mitigation. */
  baseDuration: number;
}

export const INJURY_TYPES = ['muscle_strain', 'ankle_sprain', 'knee_injury', 'hamstring_pull'] as const;

const INJURY_BASE = 0.022; // per-player base chance over a full match (tuned in the rebalance pass)

function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Chance a player picks up an injury this match. Rises as their **stamina** is low
 * (more breakdown-prone) and as their **end-of-match energy** is low (ran into the
 * ground) — so workload/fatigue feeds injury risk.
 */
export function injuryChance(player: Player, endEnergy: number): number {
  // Gently tier-sensitive so lower divisions aren't injury-ravaged; workload (energy) is
  // the stronger driver.
  const staminaFactor = clamp(0.7, 1.5, 1 + (50 - player.attributes.stamina) / 160);
  const energyFactor = clamp(0.7, 2, 1 + (55 - endEnergy) / 70);
  return clamp(0.005, 0.2, INJURY_BASE * staminaFactor * energyFactor);
}

/** Injuries for one side's players given their end-of-match energy. Deterministic under `rng`. */
export function generateInjuries(
  players: Player[],
  energy: Record<string, number>,
  rng: () => number,
): InjuryReport[] {
  const out: InjuryReport[] = [];
  for (const p of players) {
    if (rng() < injuryChance(p, energy[p.id] ?? 100)) {
      out.push({
        playerId: p.id,
        type: INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length)],
        baseDuration: 1 + Math.floor(rng() * 3),
      });
    }
  }
  return out;
}
