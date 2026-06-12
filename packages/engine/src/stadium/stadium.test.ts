import {
  getSectorCapacity,
  calculateTotalCapacity,
  calculateSectorChangeCost,
  calculateTotalChangeCost,
  hasSectorChanged,
  DEFAULT_STADIUM_SECTORS,
} from './stadium.ts';
import type { StadiumSectorConfig } from '../club/club-types.ts';

const none = (density = 36): StadiumSectorConfig => ({ type: 'none', densityValue: density });
const open = (density = 36): StadiumSectorConfig => ({ type: 'open-bleacher', densityValue: density });

describe('getSectorCapacity:', () => {
  it('given an empty slot then capacity is zero', () => {
    expect(getSectorCapacity('N', none())).toBe(0);
  });

  it('given an open bleacher then capacity follows (60 - density) * 85 * multiplier', () => {
    // (60 - 36) * 85 = 2040, multiplier 1
    expect(getSectorCapacity('N', open(36))).toBe(2040);
  });

  it('given a higher-tier stand then the capacity multiplier increases the count', () => {
    // 2040 * 1.2 = 2448
    expect(getSectorCapacity('N', { type: 'covered-grandstand', densityValue: 36 })).toBe(2448);
  });

  it('given a denser configuration then capacity grows', () => {
    expect(getSectorCapacity('N', open(20))).toBeGreaterThan(getSectorCapacity('N', open(40)));
  });
});

describe('calculateTotalCapacity:', () => {
  it('given the default stadium then it sums the four open side stands', () => {
    // 4 open stands at density 36 (2040 each) + 4 empty corners
    expect(calculateTotalCapacity(DEFAULT_STADIUM_SECTORS)).toBe(8160);
  });
});

describe('calculateSectorChangeCost:', () => {
  it('given no change then the cost is zero', () => {
    expect(calculateSectorChangeCost('N', none(), none())).toBe(0);
  });

  it('given a corner upgrade then it charges construction plus per-seat at the corner multiplier', () => {
    // NE loc 0.8: build 25000*0.8 = 20000; +2040 seats * 80 * 0.8 = 130560 => 150560
    expect(calculateSectorChangeCost('NE', none(36), open(36))).toBe(150560);
  });

  it('given a downgrade then it charges a demolition fee plus per-seat removal', () => {
    // NE loc 0.8: demolition 25000*0.15*0.8 = 3000; +2040 seats * 10 * 0.8 = 16320 => 19320
    expect(calculateSectorChangeCost('NE', open(36), none(36))).toBe(19320);
  });
});

describe('calculateTotalChangeCost:', () => {
  it('given identical plans then total cost is zero', () => {
    expect(calculateTotalChangeCost(DEFAULT_STADIUM_SECTORS, DEFAULT_STADIUM_SECTORS)).toBe(0);
  });

  it('given one changed sector then total equals that sector cost', () => {
    const planned = { ...DEFAULT_STADIUM_SECTORS, NE: open(36) };
    expect(calculateTotalChangeCost(DEFAULT_STADIUM_SECTORS, planned))
      .toBe(calculateSectorChangeCost('NE', none(36), open(36)));
  });
});

describe('hasSectorChanged:', () => {
  it('given a different stand type then it reports a change', () => {
    expect(hasSectorChanged(none(36), open(36))).toBe(true);
  });

  it('given a different density then it reports a change', () => {
    expect(hasSectorChanged(open(36), open(40))).toBe(true);
  });

  it('given an identical config then it reports no change', () => {
    expect(hasSectorChanged(open(36), open(36))).toBe(false);
  });
});
