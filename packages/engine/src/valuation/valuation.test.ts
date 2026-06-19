import { getTeamOVR, playerValue, directTransferPrice } from './valuation.ts';
import { calculateOverall } from '../transfer/transfer-manager.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';

function attrs(value: number): PlayerAttributes {
  return {
    speed: value, strength: value, agility: value, passing: value, finishing: value,
    technique: value, defending: value, stamina: value, awareness: value, composure: value,
  };
}

function makePlayer(id: string, value: number): Player {
  return { id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70, attributes: attrs(value) };
}

describe('getTeamOVR:', () => {
  it('given no starters then returns zero', () => {
    expect(getTeamOVR([])).toBe(0);
  });

  it('given identical starters then the average equals that player\'s overall', () => {
    const team = [makePlayer('a', 70), makePlayer('b', 70), makePlayer('c', 70)];
    expect(getTeamOVR(team)).toBe(Math.round(calculateOverall(attrs(70))));
  });

  it('given mixed starters then the result lies between the lowest and highest overall', () => {
    const lo = Math.round(calculateOverall(attrs(40)));
    const hi = Math.round(calculateOverall(attrs(90)));
    const ovr = getTeamOVR([makePlayer('a', 40), makePlayer('b', 90)]);
    expect(ovr).toBeGreaterThanOrEqual(lo);
    expect(ovr).toBeLessThanOrEqual(hi);
  });
});


function p(over: Partial<Player> = {}): Player {
  return { ...makePlayer('v', 70), ...over };
}

describe('playerValue:', () => {
  it('rises steeply with skill', () => {
    expect(playerValue(p({ attributes: attrs(85) }))).toBeGreaterThan(playerValue(p({ attributes: attrs(60) })));
  });

  it('peaks in the prime and fades for veterans', () => {
    expect(playerValue(p({ age: 35 }))).toBeLessThan(playerValue(p({ age: 25 })));
  });

  it('pays a premium for young players with unrealised potential', () => {
    const wonderkid = playerValue(p({ age: 18, potential: 95, attributes: attrs(60) }));
    const journeyman = playerValue(p({ age: 28, potential: 60, attributes: attrs(60) }));
    expect(wonderkid).toBeGreaterThan(journeyman);
  });

  it('never goes below 1000', () => {
    expect(playerValue(p({ age: 38, potential: 40, attributes: attrs(1) }))).toBe(1_000);
  });
});

describe('directTransferPrice:', () => {
  it('charges a premium over market value, highest for starters', () => {
    const player = p();
    const value = playerValue(player);
    expect(directTransferPrice(player, 'starter')).toBeGreaterThan(directTransferPrice(player, 'bench'));
    expect(directTransferPrice(player, 'bench')).toBeGreaterThan(directTransferPrice(player, 'reserve'));
    expect(directTransferPrice(player, 'reserve')).toBeGreaterThan(value);
  });

  it('adds a reluctance premium for young high-potential prospects', () => {
    const prospect = p({ age: 19, potential: 90, attributes: attrs(65) });
    const plain = p({ age: 27, potential: 70, attributes: attrs(65) });
    expect(directTransferPrice(prospect, 'starter') / playerValue(prospect))
      .toBeGreaterThan(directTransferPrice(plain, 'starter') / playerValue(plain));
  });
});
