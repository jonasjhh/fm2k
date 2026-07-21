import {
  mulberry32, drawMatchForm, NEUTRAL_MATCH_FORM, MATCH_FORM_CAP,
} from './rng.ts';

describe('drawMatchForm:', () => {
  it('given a seeded rng then the draw is deterministic', () => {
    const a = drawMatchForm(mulberry32(1));
    const b = drawMatchForm(mulberry32(1));
    expect(a).toEqual(b);
  });

  it('given two components then attack and defense are independent draws (not equal)', () => {
    const f = drawMatchForm(mulberry32(42));
    expect(f.attack).not.toEqual(f.defense);
  });

  it('given a zero mean then the draw averages near zero over many samples', () => {
    const rng = mulberry32(7);
    let sumA = 0, sumD = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const f = drawMatchForm(rng);
      sumA += f.attack; sumD += f.defense;
    }
    expect(Math.abs(sumA / N)).toBeLessThan(0.005);
    expect(Math.abs(sumD / N)).toBeLessThan(0.005);
  });

  it('given any draw then both components stay within ±CAP', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 20000; i++) {
      const f = drawMatchForm(rng);
      expect(f.attack).toBeGreaterThanOrEqual(-MATCH_FORM_CAP);
      expect(f.attack).toBeLessThanOrEqual(MATCH_FORM_CAP);
      expect(f.defense).toBeGreaterThanOrEqual(-MATCH_FORM_CAP);
      expect(f.defense).toBeLessThanOrEqual(MATCH_FORM_CAP);
    }
  });

  it('given a supplied mean then the draw is centred on it', () => {
    const rng = mulberry32(3);
    let sumA = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) { sumA += drawMatchForm(rng, { attack: 0.04 }).attack; }
    // centred on +0.04 (clamp at 0.10 barely bites at σ=0.05, so mean stays close)
    expect(sumA / N).toBeGreaterThan(0.03);
    expect(sumA / N).toBeLessThan(0.05);
  });

  it('NEUTRAL_MATCH_FORM is zero on both axes', () => {
    expect(NEUTRAL_MATCH_FORM).toEqual({ attack: 0, defense: 0 });
  });
});
