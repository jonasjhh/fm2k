import { prizeMoneyFor, CUP_PRIZE } from './prize-money.ts';

describe('prizeMoneyFor:', () => {
  it('pays strictly more for a higher division at the same position', () => {
    expect(prizeMoneyFor(1, 1)).toBeGreaterThan(prizeMoneyFor(2, 1));
    expect(prizeMoneyFor(2, 1)).toBeGreaterThan(prizeMoneyFor(3, 1));
  });

  it('pays strictly more for a better position within the top 6', () => {
    const amounts = [1, 2, 3, 4, 5, 6].map(pos => prizeMoneyFor(1, pos));
    for (let i = 0; i < amounts.length - 1; i++) {
      expect(amounts[i]).toBeGreaterThan(amounts[i + 1]);
    }
  });

  it('pays the same flat amount for every position from 7th down', () => {
    expect(prizeMoneyFor(1, 7)).toBe(prizeMoneyFor(1, 16));
  });

  it('pays less for 7th-or-below than for any top-6 finish', () => {
    expect(prizeMoneyFor(1, 6)).toBeGreaterThan(prizeMoneyFor(1, 7));
  });

  it('falls back to the lowest division base prize for an unknown division level', () => {
    expect(prizeMoneyFor(4, 1)).toBe(prizeMoneyFor(3, 1));
  });
});

describe('CUP_PRIZE:', () => {
  it('orders winner > runner-up > semifinalist', () => {
    expect(CUP_PRIZE.winner).toBeGreaterThan(CUP_PRIZE.runnerUp);
    expect(CUP_PRIZE.runnerUp).toBeGreaterThan(CUP_PRIZE.semifinalist);
  });

  it('is meaningfully smaller than any league prize tier', () => {
    expect(CUP_PRIZE.winner).toBeLessThan(prizeMoneyFor(3, 1));
  });
});
