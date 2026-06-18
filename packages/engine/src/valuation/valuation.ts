import { calculateOverall, getTeamOVR } from '@fm2k/match';
import type { Player } from '@fm2k/match';

// getTeamOVR now lives in @fm2k/match; re-exported here for back-compat.
export { getTeamOVR };

export function sellPrice(attrs: Parameters<typeof calculateOverall>[0]): number {
  return Math.max(1_000, Math.round(calculateOverall(attrs)) * 5_000);
}

// ── market value ────────────────────────────────────────────────────────────────
// A player's transfer value rises steeply with skill, peaks in the mid-20s, fades with age, and
// carries a premium for young players with unrealised potential.

const VALUE_COEFF = 250; // overall² × this → a 70-rated prime player ≈ £1.2M

/** Age multiplier — full value in the prime, tapering for veterans, slight discount for raw teens. */
function ageValueFactor(age: number): number {
  if (age <= 20) { return 0.9; }
  if (age <= 27) { return 1.0; }
  if (age <= 30) { return 0.85; }
  if (age <= 32) { return 0.6; }
  if (age <= 34) { return 0.4; }
  return 0.25;
}

/** Unrealised potential adds value, most for the youngest players. */
function potentialValueFactor(overall: number, potential: number, age: number): number {
  const gap = Math.max(0, potential - overall);
  const weight = age <= 23 ? 0.03 : age <= 26 ? 0.015 : 0;
  return 1 + gap * weight;
}

/** The open-market value of a player (skill + age + potential). The figure surfaced to the manager. */
export function playerValue(player: Player): number {
  const overall = calculateOverall(player.attributes);
  const base = overall * overall * VALUE_COEFF;
  const value = base * ageValueFactor(player.age) * potentialValueFactor(overall, player.potential, player.age);
  return Math.max(1_000, Math.round(value));
}

// ── direct (club-to-club) transfer pricing ───────────────────────────────────────
// Prising a player out of another club costs more than open-market value: the buying club pays a
// premium reflecting how important the player is to that club (starters cost most), plus an extra
// reluctance to sell young, high-potential talent.

export type LineupRole = 'starter' | 'bench' | 'reserve';

const ROLE_PREMIUM: Record<LineupRole, number> = {
  starter: 1.6,
  bench: 1.25,
  reserve: 1.05,
};

/** The fee another club will demand to release `player`, given their role in that club's lineup. */
export function directTransferPrice(player: Player, role: LineupRole): number {
  const overall = calculateOverall(player.attributes);
  // Clubs especially resist selling young players who could still become stars.
  const prospectPremium = player.age <= 23 && player.potential >= 85 ? 1.3 : 1;
  return Math.max(1_000, Math.round(playerValue(player) * ROLE_PREMIUM[role] * prospectPremium));
}
