import {
  getSectorCapacity,
  calculateTotalCapacity,
  calculateSectorChangeCost,
  calculateTotalChangeCost,
  hasSectorChanged,
  DEFAULT_STADIUM_SECTORS,
} from './stadium.ts';
import type { StadiumSectorConfig } from './stadium.ts';

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

  it('given missing sectors then they default to empty (zero capacity)', () => {
    expect(calculateTotalCapacity({})).toBe(0);                       // every key missing
    expect(calculateTotalCapacity({ N: open(36) })).toBe(2040);       // only N present
  });
});

describe('calculateSectorChangeCost:', () => {
  it('given no change then the cost is zero', () => {
    expect(calculateSectorChangeCost('N', none(), none())).toBe(0);
  });

  it('given a corner upgrade then it charges build cost plus per-seat at the corner multiplier', () => {
    // NE loc 0.8: demolish(none)=0 + build(open)=2_000_000, total=2_000_000*0.8=1_600_000
    //   + 2040 seats * 20 * 0.8 = 32_640 => 1_632_640
    expect(calculateSectorChangeCost('NE', none(36), open(36))).toBe(1_632_640);
  });

  it('given a downgrade to empty then it only charges demolition plus per-seat removal', () => {
    // NE loc 0.8: demolish(open)=500_000 + build(none)=0, total=500_000*0.8=400_000
    //   + 2040 seats * 5 * 0.8 = 8_160 => 408_160
    expect(calculateSectorChangeCost('NE', open(36), none(36))).toBe(408_160);
  });

  it('given a tier upgrade then it charges full demolition of old plus full build of new', () => {
    // open-bleacher → double-tier at sector N (loc 1.8):
    //   demolish(open)=500_000 + build(double)=15_000_000 = 15_500_000 * 1.8 = 27_900_000
    //   seats: 2040 → 4488 (Δ2448) * 20 * 1.8 = 88_128 => 27_988_128
    expect(calculateSectorChangeCost('N', open(36), { type: 'double-tier', densityValue: 36 })).toBe(27_988_128);
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

  it('given missing sectors on either side then they default to empty', () => {
    expect(calculateTotalChangeCost({}, {})).toBe(0); // all default to none → no change
    // committed empty, planned builds one open side stand at N (loc 1.8)
    expect(calculateTotalChangeCost({}, { N: open(36) }))
      .toBe(calculateSectorChangeCost('N', none(30), open(36)));
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
