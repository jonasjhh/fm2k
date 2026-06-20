import type { Player } from '@fm2k/match';
import { valuePlayer, type LineupRole } from '@fm2k/valuation';

/**
 * Whether an AI club accepts a direct bid for one of its players. Pure and rng-injected. An offer is
 * accepted when it clears the club's asking price (`valuePlayer`, which already factors in the
 * player's lineup role, age, potential and skill), with a small band of randomness so a fee a touch
 * below is occasionally taken and one a touch above is occasionally held out for.
 */
export function acceptBid(player: Player, role: LineupRole, offer: number, rng: () => number): boolean {
  const price = valuePlayer(player, { role });
  // Threshold wobbles ±5% around the asking price.
  const threshold = price * (0.95 + rng() * 0.1);
  return offer >= threshold;
}
