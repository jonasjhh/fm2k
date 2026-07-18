import { playerValue, valuePlayer } from './valuation.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';

function attrs(value: number): PlayerAttributes {
  return {
    speed: value, strength: value, passing: value, finishing: value,
    technique: value, defending: value, stamina: value, goalkeeping: 10,
  };
}

function makePlayer(id: string, value: number): Player {
  return { id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70, attributes: attrs(value) };
}

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

  it('fades further still for a player in their mid-thirties than their early thirties', () => {
    expect(playerValue(p({ age: 33 }))).toBeLessThan(playerValue(p({ age: 31 })));
  });

  it('pays a premium for young players with unrealised potential', () => {
    const wonderkid = playerValue(p({ age: 18, potential: 95, attributes: attrs(60) }));
    const journeyman = playerValue(p({ age: 28, potential: 60, attributes: attrs(60) }));
    expect(wonderkid).toBeGreaterThan(journeyman);
  });

  it('never goes below 1000', () => {
    expect(playerValue(p({ age: 38, potential: 40, attributes: attrs(1) }))).toBe(1_000);
  });

  describe('age value factor (boundaries, isolated from potential by goalkeeping potential <= overall):', () => {
    // Same age tier → identical value; crossing a tier boundary → a strictly *lower* value
    // for the older age (not just "different" — a mutant that swaps which side of a boundary
    // wins would still produce two different numbers and slip past a plain inequality check).
    // Player with potential == overall has gap == 0, so potentialValueFactor is pinned at 1
    // for every age below, isolating ageValueFactor's tiers cleanly.
    const valueAt = (age: number) => playerValue(p({ age, potential: 70, attributes: attrs(70) }));

    it('20 is worth less than 21 (crosses the <=20 boundary into the full-value prime tier)', () => {
      expect(valueAt(20)).toBeLessThan(valueAt(21));
    });
    it('21 and 27 are equal (same <=27 tier)', () => {
      expect(valueAt(21)).toBe(valueAt(27));
    });
    it('27 is worth more than 28 (crosses the <=27 boundary)', () => {
      expect(valueAt(27)).toBeGreaterThan(valueAt(28));
    });
    it('28 and 30 are equal (same <=30 tier)', () => {
      expect(valueAt(28)).toBe(valueAt(30));
    });
    it('30 is worth more than 31 (crosses the <=30 boundary)', () => {
      expect(valueAt(30)).toBeGreaterThan(valueAt(31));
    });
    it('31 and 32 are equal (same <=32 tier)', () => {
      expect(valueAt(31)).toBe(valueAt(32));
    });
    it('32 is worth more than 33 (crosses the <=32 boundary)', () => {
      expect(valueAt(32)).toBeGreaterThan(valueAt(33));
    });
    it('33 and 34 are equal (same <=34 tier)', () => {
      expect(valueAt(33)).toBe(valueAt(34));
    });
    it('34 is worth more than 35 (crosses the <=34 boundary)', () => {
      expect(valueAt(34)).toBeGreaterThan(valueAt(35));
    });
  });

  describe('potential value factor (isolated from age tiers by holding age/overall fixed):', () => {
    it('a potential at or below overall gives the same baseline value, however far below', () => {
      // gap = max(0, potential - overall); both of these clamp to gap 0 — guards against the
      // floor flipping to Math.min, and against the subtraction flipping to addition (which
      // would NOT cancel out at potential == overall: it would yield 2 * overall instead of 0).
      const atOverall = playerValue(p({ age: 21, potential: 50, attributes: attrs(50) })); // overall 50
      const wellBelow = playerValue(p({ age: 21, potential: 30, attributes: attrs(50) }));
      expect(atOverall).toBe(wellBelow);
    });

    it('the same potential gap is worth strictly less as the player ages past 23, then past 26', () => {
      const valueAt = (age: number) => playerValue(p({ age, potential: 65, attributes: attrs(50) })); // overall 50, gap 15
      const young = valueAt(21);   // weight 0.03 (age <= 23)
      const mid = valueAt(25);     // weight 0.015 (23 < age <= 26)
      const old = valueAt(27);     // weight 0 (age > 26)
      expect(young).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(old);
    });

    it('weight tier boundaries land exactly at 23 and 26, not one age either side', () => {
      const valueAt = (age: number) => playerValue(p({ age, potential: 65, attributes: attrs(50) })); // overall 50, gap 15
      // 22 and 23 are both in the <=23 tier (weight 0.03) — equal.
      expect(valueAt(22)).toBe(valueAt(23));
      // 23 → 24 crosses into the <=26 tier (weight 0.015) — strictly lower.
      expect(valueAt(23)).toBeGreaterThan(valueAt(24));
      // 24 and 26 are both in the <=26 tier (weight 0.015) — equal.
      expect(valueAt(24)).toBe(valueAt(26));
      // 26 → 27 crosses into the >26 tier (weight 0) — strictly lower.
      expect(valueAt(26)).toBeGreaterThan(valueAt(27));
    });
  });
});

describe('valuePlayer:', () => {
  it('with no context, equals the open-market playerValue', () => {
    const player = p();
    expect(valuePlayer(player)).toBe(playerValue(player));
  });

  it('charges a premium over market value, highest for starters', () => {
    const player = p();
    const value = playerValue(player);
    expect(valuePlayer(player, { role: 'starter' })).toBeGreaterThan(valuePlayer(player, { role: 'bench' }));
    expect(valuePlayer(player, { role: 'bench' })).toBeGreaterThan(valuePlayer(player, { role: 'reserve' }));
    expect(valuePlayer(player, { role: 'reserve' })).toBeGreaterThan(value);
  });

  it('adds a reluctance premium for young high-potential prospects', () => {
    const prospect = p({ age: 19, potential: 90, attributes: attrs(65) });
    const plain = p({ age: 27, potential: 70, attributes: attrs(65) });
    expect(valuePlayer(prospect, { role: 'starter' }) / playerValue(prospect))
      .toBeGreaterThan(valuePlayer(plain, { role: 'starter' }) / playerValue(plain));
  });

  describe('prospect premium boundaries (exact, via the valuePlayer/playerValue ratio):', () => {
    // attrs(80) → overall ~88, so potential 85 has gap 0 (potential < overall) — this pins
    // potentialValueFactor at exactly 1 for every age below, regardless of which age-weight
    // tier applies, isolating the age<=23 && potential>=85 condition on its own. Dividing by
    // playerValue(player) cancels the skill/age/potential base entirely, leaving exactly
    // ROLE_PREMIUM['starter'] * prospectPremium — 1.3x higher when the premium applies than
    // when it doesn't, whatever ROLE_PREMIUM['starter'] itself is.
    const ratio = (age: number, potential: number) => {
      const player = p({ age, potential, attributes: attrs(80) });
      return valuePlayer(player, { role: 'starter' }) / playerValue(player);
    };

    it('age just past the boundary (24): no premium, vs. age <= 23 with the same potential', () => {
      expect(ratio(23, 85) / ratio(24, 85)).toBeCloseTo(1.3, 6);
    });
    it('potential just short of the boundary (84): no premium, vs. potential >= 85 at the same age', () => {
      expect(ratio(23, 85) / ratio(23, 84)).toBeCloseTo(1.3, 6);
    });
    it('neither condition holds: same ratio as either condition alone failing', () => {
      expect(ratio(24, 84)).toBeCloseTo(ratio(24, 85), 6);
      expect(ratio(24, 84)).toBeCloseTo(ratio(23, 84), 6);
    });
  });
});
