import { positionAttributeImportance } from './position-importance.ts';

describe('positionAttributeImportance:', () => {
  it('closes the CB gap: interception pulls agility into a CB\'s importance', () => {
    const cb = positionAttributeImportance('CB');
    expect(cb.agility).toBeGreaterThan(0);
  });

  it('closes the ST gap: heading pulls strength and agility into a striker\'s importance', () => {
    const st = positionAttributeImportance('ST');
    expect(st.strength).toBeGreaterThan(0);
    expect(st.agility).toBeGreaterThan(0);
  });

  it('a winger gets finishing exposure since they can take shots in-engine', () => {
    const lw = positionAttributeImportance('LW');
    expect(lw.finishing).toBeGreaterThan(0);
  });

  it('GK\'s composure is the smallest of gkSaving\'s three attributes (composure has no other source for GK)', () => {
    const gk = positionAttributeImportance('GK');
    expect(gk.composure).toBeGreaterThan(0);
    expect(gk.agility).toBeGreaterThan(gk.composure ?? 0);
    expect(gk.awareness).toBeGreaterThan(gk.composure ?? 0);
  });

  it('GK gets no exposure to GK-excluded/unreachable actions (dribble/cross/through ball/shot)', () => {
    const gk = positionAttributeImportance('GK');
    // speed only appears via the `dribbling` skill, and finishing only via `finishing`/`heading`
    // — none of which GK is exposed to (only short/long passing, tackling, interception, gkSaving).
    expect(gk.speed).toBeUndefined();
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

  it('CB\'s defending comfortably outweighs finishing/composure (tackling+interception vs. one-off heading)', () => {
    const cb = positionAttributeImportance('CB');
    expect(cb.defending).toBeGreaterThan(cb.finishing ?? 0);
    expect(cb.defending).toBeGreaterThan(cb.composure ?? 0);
  });

  it('a wing-back (LWB/RWB) carries a real identity distinct from a plain full-back: more speed/technique (higher cross+dribble preference), less defending', () => {
    const lb = positionAttributeImportance('LB');
    const lwb = positionAttributeImportance('LWB');
    expect(lwb.speed).toBeGreaterThan(lb.speed ?? 0);
    expect(lwb.technique).toBeGreaterThan(lb.technique ?? 0);
    expect(lwb.defending ?? 0).toBeLessThan(lb.defending ?? 0);

    const rb = positionAttributeImportance('RB');
    const rwb = positionAttributeImportance('RWB');
    expect(rwb.speed).toBeGreaterThan(rb.speed ?? 0);
    expect(rwb.technique).toBeGreaterThan(rb.technique ?? 0);
  });
});
