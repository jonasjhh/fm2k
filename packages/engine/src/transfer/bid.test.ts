import { acceptBid } from './bid.ts';
import { directTransferPrice } from '../valuation/valuation.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, agility: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, awareness: v, composure: v };
}
const player: Player = { id: 'p', name: 'P', nationality: 'n', age: 26, position: 'CM', potential: 75, attributes: attrs(70) };

describe('acceptBid:', () => {
  const price = directTransferPrice(player, 'starter');

  it('rejects an offer well below the asking price', () => {
    expect(acceptBid(player, 'starter', price * 0.5, () => 0.5)).toBe(false);
  });

  it('accepts an offer well above the asking price', () => {
    expect(acceptBid(player, 'starter', price * 1.5, () => 0.5)).toBe(true);
  });

  it('the threshold wobbles within ±5% of the asking price', () => {
    // At the lowest wobble (rng 0 → 0.95×) a 0.95× offer is taken; at the highest (rng 1 → 1.05×) it is not.
    expect(acceptBid(player, 'starter', price * 0.95, () => 0)).toBe(true);
    expect(acceptBid(player, 'starter', price * 0.95, () => 1)).toBe(false);
  });

  it('a bench player is cheaper to sign than a starter', () => {
    const offer = directTransferPrice(player, 'bench');
    expect(acceptBid(player, 'bench', offer, () => 0.5)).toBe(true);
    expect(acceptBid(player, 'starter', offer, () => 0.5)).toBe(false);
  });
});
