import {
  SPEED_DUEL, STRENGTH_DUEL, DRIBBLE_DUEL, PASS_DUEL, SHOT_DUEL, PENALTY_DUEL,
  duelChance, resolveDuel, escalates, CLEAN_ESCAPE_MARGIN,
  saturateGap, GAP_SATURATION_KNEE, GAP_SATURATION_SOFTNESS,
  deliveryCheck, deliveryBonus, CROSS_DELIVERY,
  foulChance, FOUL_MARGIN_FLOOR, FOUL_CHANCE_CAP,
  lastManFoulChance, PRO_FOUL_REACH, PRO_FOUL_CHANCE,
} from './duels.ts';

const rngOf = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('duelChance:', () => {
  it('equal attributes give exactly the base chance', () => {
    expect(duelChance(60, 60, SPEED_DUEL)).toBe(0.5);
    expect(duelChance(60, 60, PASS_DUEL)).toBe(0.78);
    expect(duelChance(60, 60, SHOT_DUEL)).toBe(0.095);
  });

  it('the attribute difference shifts the chance by diff/spread (within the gap cap)', () => {
    // speed 70 vs 50: 0.5 + 20/700 (diff 20 < DUEL_GAP_CAP)
    expect(duelChance(70, 50, SPEED_DUEL)).toBeCloseTo(0.5 + 20 / SPEED_DUEL.spread, 10);
    // strength 65 vs 50: 0.5 + 15/700
    expect(duelChance(65, 50, STRENGTH_DUEL)).toBeCloseTo(0.5 + 15 / STRENGTH_DUEL.spread, 10);
    // dribble 70 vs 70: defender favoured at equal skill
    expect(duelChance(70, 70, DRIBBLE_DUEL)).toBeLessThan(0.5);
  });

  it('the skill difference passes through a soft knee (identity below, discounted above)', () => {
    const K = GAP_SATURATION_KNEE;
    // Below the knee: identity.
    expect(saturateGap(K - 2)).toBeCloseTo(K - 2, 10);
    expect(saturateGap(0)).toBe(0);
    // At the knee: continuous.
    expect(saturateGap(K)).toBeCloseTo(K, 10);
    // Above the knee: each extra raw point counts 1/SOFTNESS.
    expect(saturateGap(K + 30)).toBeCloseTo(K + 30 / GAP_SATURATION_SOFTNESS, 10);
    // Sign-preserving and symmetric.
    expect(saturateGap(-(K + 30))).toBeCloseTo(-(K + 30 / GAP_SATURATION_SOFTNESS), 10);
  });

  it('saturation makes a mismatch taper: a huge gap shifts the chance far less than linearly', () => {
    // A raw 70-point gap would be 0.5 + 70/spread unsaturated; the soft knee tapers it.
    const linear = 0.5 + 70 / SPEED_DUEL.spread;
    const saturated = duelChance(50 + 70, 50, SPEED_DUEL);
    expect(saturated).toBeLessThan(linear);
    expect(saturated).toBeCloseTo(0.5 + saturateGap(70) / SPEED_DUEL.spread, 10);
  });

  it('clamps to lo and hi', () => {
    expect(duelChance(1, 99, SPEED_DUEL, { bonus: -0.5 })).toBe(SPEED_DUEL.lo);
    expect(duelChance(99, 1, SHOT_DUEL, { bonus: 0.5 })).toBe(SHOT_DUEL.hi);
  });

  it('a flat bonus modifier shifts the chance directly', () => {
    expect(duelChance(60, 60, STRENGTH_DUEL, { bonus: 0.1 })).toBe(0.6);
    expect(duelChance(60, 60, STRENGTH_DUEL, { bonus: -0.1 })).toBe(0.4);
  });

  it('penalties are heavily attacker-favoured with a compressed spread', () => {
    expect(duelChance(50, 50, PENALTY_DUEL)).toBe(0.76);
    // even elite keeper vs poor taker stays above the floor
    expect(duelChance(30, 95, PENALTY_DUEL)).toBeGreaterThanOrEqual(PENALTY_DUEL.lo);
  });
});

describe('resolveDuel:', () => {
  it('roll below the chance = attacker wins, margin = chance − roll', () => {
    const out = resolveDuel(60, 60, SPEED_DUEL, rngOf(0.3));
    expect(out.attackerWins).toBe(true);
    expect(out.margin).toBeCloseTo(0.2, 10);
    expect(out.chance).toBe(0.5);
  });

  it('roll above the chance = defender wins with a negative margin', () => {
    const out = resolveDuel(60, 60, SPEED_DUEL, rngOf(0.9));
    expect(out.attackerWins).toBe(false);
    expect(out.margin).toBeCloseTo(-0.4, 10);
  });

  it('consumes exactly one rng draw', () => {
    let draws = 0;
    resolveDuel(60, 60, SPEED_DUEL, () => { draws++; return 0.5; });
    expect(draws).toBe(1);
  });
});

describe('escalation rule:', () => {
  it('a narrow speed-duel win escalates into a strength duel', () => {
    const narrow = resolveDuel(60, 60, SPEED_DUEL, rngOf(0.5 - CLEAN_ESCAPE_MARGIN / 2));
    expect(narrow.attackerWins).toBe(true);
    expect(escalates(narrow)).toBe(true);
  });

  it('a big speed-duel win is a clean escape', () => {
    const big = resolveDuel(90, 40, SPEED_DUEL, rngOf(0.05));
    expect(big.margin).toBeGreaterThanOrEqual(CLEAN_ESCAPE_MARGIN);
    expect(escalates(big)).toBe(false);
  });

  it('a lost duel never escalates', () => {
    const lost = resolveDuel(60, 60, SPEED_DUEL, rngOf(0.99));
    expect(escalates(lost)).toBe(false);
  });

  it('a win by exactly the clean-escape margin does not escalate (boundary)', () => {
    const exact = { spec: SPEED_DUEL, attackerWins: true, margin: CLEAN_ESCAPE_MARGIN, chance: 0.5 };
    expect(escalates(exact)).toBe(false);
  });
});

describe('delivery checks:', () => {
  it('average passer at the cross base chance; better passing lifts the chance', () => {
    const avg = deliveryCheck(50, CROSS_DELIVERY, rngOf(0.55));
    expect(avg.onTarget).toBe(false);
    expect(avg.margin).toBeCloseTo(0, 10);
    const good = deliveryCheck(70, CROSS_DELIVERY, rngOf(0.55)); // diff 20 < saturation knee
    expect(good.onTarget).toBe(true); // 0.55 + 20/250 = 0.63
    expect(good.margin).toBeCloseTo(20 / CROSS_DELIVERY.spread, 10);
  });

  it('deliveryBonus scales the margin and clamps at ±0.1', () => {
    expect(deliveryBonus({ onTarget: true, margin: 0.2 })).toBeCloseTo(0.04, 10);
    expect(deliveryBonus({ onTarget: true, margin: 0.9 })).toBe(0.1);
    expect(deliveryBonus({ onTarget: false, margin: -0.9 })).toBe(-0.1);
  });
});

describe('emergent fouls:', () => {
  it('only badly lost strength/dribble duels can foul; scaled past the floor, capped', () => {
    const bigLoss = resolveDuel(90, 30, STRENGTH_DUEL, rngOf(0.01));
    expect(foulChance(bigLoss)).toBeGreaterThan(0);
    expect(foulChance(bigLoss)).toBeLessThanOrEqual(FOUL_CHANCE_CAP);

    const narrowWin = resolveDuel(60, 60, DRIBBLE_DUEL, rngOf(0.43));
    expect(narrowWin.attackerWins).toBe(true);
    expect(narrowWin.margin).toBeLessThan(FOUL_MARGIN_FLOOR);
    expect(foulChance(narrowWin)).toBe(0);
  });

  it('speed and pass duels never produce fouls', () => {
    const speed = resolveDuel(90, 30, SPEED_DUEL, rngOf(0.01));
    expect(foulChance(speed)).toBe(0);
    const pass = resolveDuel(90, 30, PASS_DUEL, rngOf(0.01));
    expect(foulChance(pass)).toBe(0);
  });

  it('a defender-won duel never fouls', () => {
    const lost = resolveDuel(30, 90, DRIBBLE_DUEL, rngOf(0.99));
    expect(foulChance(lost)).toBe(0);
  });

  it('exact foul-chance value: margin 0.32 → (0.32 − floor) · scale', () => {
    const out = resolveDuel(60, 60, STRENGTH_DUEL, rngOf(0.5 - 0.32));
    expect(out.margin).toBeCloseTo(0.32, 10);
    expect(foulChance(out)).toBeCloseTo((0.32 - FOUL_MARGIN_FLOOR) * 0.55, 10);
  });
});

describe('last-man professional foul:', () => {
  it('a reachable speed-race win gives the flat choice probability', () => {
    const reachable = resolveDuel(60, 60, SPEED_DUEL, rngOf(0.5 - PRO_FOUL_REACH / 2));
    expect(reachable.attackerWins).toBe(true);
    expect(lastManFoulChance(reachable)).toBe(PRO_FOUL_CHANCE);
  });

  it('a runner clear by more than the reach margin cannot be fouled', () => {
    const clear = resolveDuel(90, 30, SPEED_DUEL, rngOf(0.01));
    expect(clear.margin).toBeGreaterThan(PRO_FOUL_REACH);
    expect(lastManFoulChance(clear)).toBe(0);
  });

  it('only won speed races qualify — losses and other duel types give 0', () => {
    const lost = resolveDuel(30, 90, SPEED_DUEL, rngOf(0.99));
    expect(lastManFoulChance(lost)).toBe(0);
    const dribble = resolveDuel(60, 60, DRIBBLE_DUEL, rngOf(0.3));
    expect(dribble.attackerWins).toBe(true);
    expect(lastManFoulChance(dribble)).toBe(0);
  });
});
