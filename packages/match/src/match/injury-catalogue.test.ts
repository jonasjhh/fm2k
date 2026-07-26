import {
  INJURY_DEFINITIONS, INJURY_SEVERITIES, INJURY_TABLE, INJURY_TRIGGERS, INJURY_TYPES,
  SEVERITY_DURATION_BOUNDS, TRIGGER_EXPOSURE,
} from './injury-catalogue.ts';

/**
 * The catalogue is the tuning surface for the whole injury system, so its invariants are worth
 * pinning hard: a slot whose weights drift off 100 silently reweights every injury in it, and a
 * situation with exposure but no candidates would drop injuries on the floor with no symptom.
 */
describe('injury catalogue invariants:', () => {
  test('every (trigger, severity) slot\'s weights sum to exactly 100', () => {
    for (const trigger of INJURY_TRIGGERS) {
      for (const severity of INJURY_SEVERITIES) {
        const candidates = INJURY_TABLE[trigger][severity];
        if (candidates.length === 0) { continue; }
        const total = candidates.reduce((s, c) => s + c.weight, 0);
        expect(`${trigger}/${severity} = ${total}`).toBe(`${trigger}/${severity} = 100`);
      }
    }
  });

  test('every injury\'s duration sits inside its severity band', () => {
    for (const def of INJURY_DEFINITIONS) {
      const [boundLo, boundHi] = SEVERITY_DURATION_BOUNDS[def.severity];
      const [lo, hi] = def.duration;
      expect(lo).toBeLessThanOrEqual(hi);
      expect(`${def.id}: ${lo}-${hi}`)
        .toBe(`${def.id}: ${Math.max(lo, boundLo)}-${Math.min(hi, boundHi)}`);
    }
  });

  test('a situation with exposure always has something it can produce', () => {
    for (const trigger of INJURY_TRIGGERS) {
      for (const severity of INJURY_SEVERITIES) {
        const hasExposure = TRIGGER_EXPOSURE[trigger][severity] > 0;
        const hasCandidates = INJURY_TABLE[trigger][severity].length > 0;
        expect(`${trigger}/${severity}: exposure=${hasExposure} candidates=${hasCandidates}`)
          .toBe(`${trigger}/${severity}: exposure=${hasExposure} candidates=${hasExposure}`);
      }
    }
  });

  test('every injury is reachable from at least one situation', () => {
    for (const def of INJURY_DEFINITIONS) {
      const triggers = Object.keys(def.triggers);
      expect(`${def.id}: ${triggers.length} triggers`).not.toBe(`${def.id}: 0 triggers`);
      for (const trigger of triggers) {
        expect(INJURY_TRIGGERS).toContain(trigger);
      }
    }
  });

  test('mitigation clamps are fractions', () => {
    for (const def of INJURY_DEFINITIONS) {
      expect(def.maxAvertChance).toBeGreaterThanOrEqual(0);
      expect(def.maxAvertChance).toBeLessThanOrEqual(1);
      expect(def.minDurationFraction).toBeGreaterThanOrEqual(0);
      expect(def.minDurationFraction).toBeLessThanOrEqual(1);
    }
  });

  test('serious injuries are near-unpreventable; knocks largely are preventable', () => {
    // The design intent, asserted rather than left to the reader: money cannot buy its way out
    // of a broken leg, but a good medical estate should make most dead legs a non-event.
    for (const def of INJURY_DEFINITIONS) {
      if (def.severity === 'serious') { expect(def.maxAvertChance).toBeLessThanOrEqual(0.1); }
      if (def.severity === 'knock') { expect(def.maxAvertChance).toBeGreaterThanOrEqual(0.4); }
    }
  });

  test('head injuries cannot be shortened by any amount of money', () => {
    // Return-to-play protocol is a fixed period, not a treatment outcome.
    for (const id of ['head_knock', 'concussion']) {
      const def = INJURY_DEFINITIONS.find(d => d.id === id);
      expect(def?.minDurationFraction).toBe(1);
    }
  });

  test('broken legs are reachable only through carded fouls', () => {
    const brokenLeg = INJURY_DEFINITIONS.find(d => d.id === 'broken_leg');
    expect(Object.keys(brokenLeg?.triggers ?? {}).sort()).toEqual(['red_foul', 'yellow_foul']);
  });

  test('ids are unique and INJURY_TYPES matches the definitions', () => {
    expect(new Set(INJURY_TYPES).size).toBe(INJURY_TYPES.length);
    expect([...INJURY_TYPES].sort()).toEqual(INJURY_DEFINITIONS.map(d => d.id).sort());
  });
});

describe('situational weighting:', () => {
  /** Share of a slot that one injury holds. */
  const share = (trigger: typeof INJURY_TRIGGERS[number], severity: 'knock' | 'moderate' | 'serious', id: string) => {
    const candidates = INJURY_TABLE[trigger][severity];
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    return (candidates.find(c => c.def.id === id)?.weight ?? 0) / total;
  };

  test('a flat-out through-run tears hamstrings where a dribble strains calves', () => {
    expect(share('through_run', 'moderate', 'hamstring_pull'))
      .toBeGreaterThan(share('sprint', 'moderate', 'hamstring_pull'));
    expect(share('sprint', 'moderate', 'calf_strain'))
      .toBeGreaterThan(share('through_run', 'moderate', 'calf_strain'));
  });

  test('a tackler twists an ankle where the player they hit takes it in the thigh', () => {
    expect(share('tackling', 'knock', 'ankle_twist'))
      .toBeGreaterThan(share('tackled', 'knock', 'ankle_twist'));
    expect(share('tackled', 'knock', 'dead_leg'))
      .toBeGreaterThan(share('tackling', 'knock', 'dead_leg'));
  });

  test('the worse the card, the likelier a break over a ligament tear', () => {
    expect(share('red_foul', 'serious', 'broken_leg'))
      .toBeGreaterThan(share('yellow_foul', 'serious', 'broken_leg'));
    expect(share('foul', 'serious', 'broken_leg')).toBe(0);
  });
});
