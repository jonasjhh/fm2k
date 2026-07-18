import { positionAttributeImportance } from './position-importance.ts';

describe('positionAttributeImportance:', () => {
  it('a CB gets speed exposure through speed duels and recovery movement', () => {
    const cb = positionAttributeImportance('CB');
    expect(cb.speed).toBeGreaterThan(0);
  });

  it('a striker gets strength exposure through strength duels', () => {
    const st = positionAttributeImportance('ST');
    expect(st.strength).toBeGreaterThan(0);
  });

  it('a winger gets finishing exposure through shot duels', () => {
    const lw = positionAttributeImportance('LW');
    expect(lw.finishing).toBeGreaterThan(0);
  });

  it('a GK\'s goalkeeping exposure comes from resisting shot duels and is dominant', () => {
    const gk = positionAttributeImportance('GK');
    expect(gk.goalkeeping).toBeGreaterThan(0);
  });

  it('a GK takes no shot duels as the attacker, so finishing never appears', () => {
    const gk = positionAttributeImportance('GK');
    expect(gk.finishing).toBeUndefined();
  });

  it('every position\'s importance normalizes to sum to 1', () => {
    const positions = ['GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'LW', 'RW', 'ST'] as const;
    for (const position of positions) {
      const importance = positionAttributeImportance(position);
      const sum = Object.values(importance).reduce((s, v) => s + (v ?? 0), 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('a CB\'s defending comfortably outweighs finishing', () => {
    const cb = positionAttributeImportance('CB');
    expect(cb.defending).toBeGreaterThan(cb.finishing ?? 0);
  });

  it('wide defenders live off pace and delivery more than central ones (roles are gone; width is the identity)', () => {
    // Behavioral roles were removed (REWORK_01 ruling #4): LWB and LB are the same
    // band + flank, so their importance is identical — the wide/central axis is
    // what distinguishes defenders now.
    const lb = positionAttributeImportance('LB');
    const lwb = positionAttributeImportance('LWB');
    expect(lwb).toEqual(lb);

    const cb = positionAttributeImportance('CB');
    expect(lb.speed).toBeGreaterThan(cb.speed ?? 0);
    expect(lb.passing).toBeGreaterThan(cb.passing ?? 0);
    expect(lb.defending ?? 0).toBeLessThan(cb.defending ?? 0);
  });
});
