import type { Player, PlayerAttributes, PlayerPosition, Formation } from '../shared/types.ts';
import {
  NEUTRAL_PARAMS, NEUTRAL_VALUE, PARAM_KEYS, clampParam, clampParams, applyDelta,
  type MatchParameters,
} from './match-parameters.ts';
import { TACTICAL_STYLE_IDS, defaultIntent, type TacticalStyleId } from './intent-types.ts';
import { FORMATION_TENDENCIES } from './formation-tendencies.ts';
import { STYLE_TENDENCIES } from './style-tendencies.ts';
import { combine } from './translate.ts';
import { squadSuitability, defensiveSuitability, attackEffectiveness, BASELINE_SUIT } from './suitability.ts';
import { resolveMatchParameters } from './resolve.ts';
import { formationToStyle, aiIntent } from './ai-style.ts';

function attrs(value: number, overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return {
    speed: value, strength: value, passing: value, finishing: value,
    technique: value, defending: value, stamina: value, keeping: 10,
    ...overrides,
  };
}

function makePlayer(id: string, position: PlayerPosition, value: number, ov: Partial<PlayerAttributes> = {}): Player {
  return { id, name: id, nationality: 'n', age: 25, position, potential: 70, attributes: attrs(value, ov) };
}

function squad(value: number, ov: Partial<PlayerAttributes> = {}): Player[] {
  return Array.from({ length: 11 }, (_, i) => makePlayer(`p${i}`, 'CM', value, ov));
}

const ALL_FORMATIONS: Formation[] = [
  '4-4-2', '4-3-3', '4-5-1', '4-2-3-1', '4-1-4-1', '4-4-1-1', '4-2-4',
  '3-5-2', '3-4-3', '3-4-2-1', '5-3-2', '5-4-1',
];

describe('match-parameters:', () => {
  it('given the neutral baseline then every parameter is 50', () => {
    for (const key of PARAM_KEYS) { expect(NEUTRAL_PARAMS[key]).toBe(NEUTRAL_VALUE); }
  });

  it('given out-of-range values then clampParam pins to 0..100', () => {
    expect(clampParam(-20)).toBe(0);
    expect(clampParam(140)).toBe(100);
    expect(clampParam(37)).toBe(37);
  });

  it('given a parameter set then clampParams clamps every field', () => {
    const raw = { ...NEUTRAL_PARAMS, pressIntensity: 220, tempo: -5 } as MatchParameters;
    const clamped = clampParams(raw);
    expect(clamped.pressIntensity).toBe(100);
    expect(clamped.tempo).toBe(0);
    expect(clamped.passingRisk).toBe(50);
  });

  it('given deltas then applyDelta adds them in place and ignores absent keys', () => {
    const p: MatchParameters = { ...NEUTRAL_PARAMS };
    applyDelta(p, { pressIntensity: +10, tempo: -5 });
    expect(p.pressIntensity).toBe(60);
    expect(p.tempo).toBe(45);
    expect(p.passingRisk).toBe(50);
  });
});

describe('style tendencies (design rule — no pure-upside style):', () => {
  it('given every non-balanced style then it has both an upside and an adverse modifier', () => {
    for (const id of TACTICAL_STYLE_IDS) {
      if (id === 'balanced') { continue; }
      const mods = Object.values(STYLE_TENDENCIES[id].modifiers);
      expect(mods.some(m => m > 0)).toBe(true);
      expect(mods.some(m => m < 0)).toBe(true);
    }
  });

  it('given the balanced style then it is the neutral baseline with no modifiers', () => {
    expect(Object.keys(STYLE_TENDENCIES.balanced.modifiers)).toHaveLength(0);
  });

  it('given every style then it carries a label, blurb and non-empty weakness', () => {
    for (const id of TACTICAL_STYLE_IDS) {
      const s = STYLE_TENDENCIES[id];
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      expect(s.weakness.length).toBeGreaterThan(0);
    }
  });
});

describe('combine (translation layer):', () => {
  it('given balanced style, any formation and neutral sliders then nothing escapes 0..100', () => {
    for (const f of ALL_FORMATIONS) {
      const p = combine(f, 'balanced', { tempo: 50, risk: 50, defensiveLine: 50 });
      for (const key of PARAM_KEYS) {
        expect(p[key]).toBeGreaterThanOrEqual(0);
        expect(p[key]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('given any style/formation with extreme sliders then results stay clamped', () => {
    for (const f of ALL_FORMATIONS) {
      for (const id of TACTICAL_STYLE_IDS) {
        const p = combine(f, id, { tempo: 100, risk: 100, defensiveLine: 100 });
        const q = combine(f, id, { tempo: 0, risk: 0, defensiveLine: 0 });
        for (const key of PARAM_KEYS) {
          expect(p[key]).toBeGreaterThanOrEqual(0);
          expect(p[key]).toBeLessThanOrEqual(100);
          expect(q[key]).toBeGreaterThanOrEqual(0);
          expect(q[key]).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('given press_high then pressing rises well above neutral', () => {
    const p = combine('4-4-2', 'press_high', { tempo: 50, risk: 50, defensiveLine: 50 });
    expect(p.pressIntensity).toBeGreaterThan(NEUTRAL_VALUE);
    expect(p.spaceLeftBehind).toBeGreaterThan(NEUTRAL_VALUE);
  });

  it('given defend_deep then attacking output drops below neutral', () => {
    const p = combine('4-4-2', 'defend_deep', { tempo: 50, risk: 50, defensiveLine: 50 });
    expect(p.shotFrequency).toBeLessThan(NEUTRAL_VALUE);
    expect(p.defensiveCompactness).toBeGreaterThan(NEUTRAL_VALUE);
  });

  it('given the tempo slider then it shifts tempo additively', () => {
    const base = combine('4-4-2', 'balanced', { tempo: 50, risk: 50, defensiveLine: 50 });
    const fast = combine('4-4-2', 'balanced', { tempo: 80, risk: 50, defensiveLine: 50 });
    expect(fast.tempo).toBe(base.tempo + 30);
  });

  it('given sliders that stack with the style then they partially cancel rather than override', () => {
    // hit_on_counter wants a deep line (low spaceLeftBehind); a high-line slider should push it back up.
    const deep = combine('4-4-2', 'hit_on_counter', { tempo: 50, risk: 50, defensiveLine: 20 });
    const high = combine('4-4-2', 'hit_on_counter', { tempo: 50, risk: 50, defensiveLine: 90 });
    expect(high.spaceLeftBehind).toBeGreaterThan(deep.spaceLeftBehind);
  });

  it('given every formation then its structural tendencies are defined', () => {
    for (const f of ALL_FORMATIONS) { expect(FORMATION_TENDENCIES[f]).toBeDefined(); }
  });
});

describe('suitability:', () => {
  it('given a technical passing squad then it suits keep_the_ball more than long_ball', () => {
    const technical = squad(40, { passing: 90, technique: 90 });
    const intentKeep = defaultIntent('4-3-3');
    const keep = squadSuitability({ ...intentKeep, style: 'keep_the_ball' }, technical);
    const long = squadSuitability({ ...intentKeep, style: 'long_ball' }, technical);
    expect(keep).toBeGreaterThan(long);
  });

  it('given suitability is fit-relative then a uniform squad scores the baseline at any tier', () => {
    const intent = { ...defaultIntent('4-4-2'), style: 'press_high' as TacticalStyleId };
    expect(squadSuitability(intent, squad(80))).toBeCloseTo(squadSuitability(intent, squad(20)), 10);
    expect(defensiveSuitability(squad(80))).toBeCloseTo(defensiveSuitability(squad(20)), 10);
    // A squad SHAPED for the style beats the uniform baseline regardless of tier.
    const runners = squad(50, { stamina: 90, speed: 90 });
    expect(squadSuitability(intent, runners)).toBeGreaterThan(squadSuitability(intent, squad(80)));
  });

  it('given suitability scores then they are bounded 0..1', () => {
    const intent = { ...defaultIntent('4-4-2'), style: 'balanced' as TacticalStyleId };
    expect(squadSuitability(intent, squad(99))).toBeLessThanOrEqual(1);
    expect(squadSuitability(intent, squad(1))).toBeGreaterThanOrEqual(0);
    expect(squadSuitability(intent, [])).toBe(BASELINE_SUIT);
  });
});

describe('attackEffectiveness (asymmetric squad-vs-opponent rule):', () => {
  it('given a perfectly-suited attacker then the opponent term has no effect', () => {
    expect(attackEffectiveness(1, 0.9)).toBeCloseTo(1);
    expect(attackEffectiveness(1, 0.1)).toBeCloseTo(1);
  });

  it('given a fixed attacker then a stronger defence reduces effectiveness', () => {
    expect(attackEffectiveness(0.4, 0.9)).toBeLessThan(attackEffectiveness(0.4, 0.2));
  });

  it('given the same defence then a poorly-suited attacker is punished harder than a well-suited one', () => {
    const oppDef = 0.9;
    const wellSuitedDrop = 0.9 - attackEffectiveness(0.9, oppDef);
    const poorlySuitedDrop = 0.3 - attackEffectiveness(0.3, oppDef);
    expect(poorlySuitedDrop).toBeGreaterThan(wellSuitedDrop);
  });
});

describe('resolveMatchParameters (full pipeline):', () => {
  it('given no opponent then it stays within 0..100', () => {
    const p = resolveMatchParameters(defaultIntent('4-3-3'), squad(60));
    for (const key of PARAM_KEYS) {
      expect(p[key]).toBeGreaterThanOrEqual(0);
      expect(p[key]).toBeLessThanOrEqual(100);
    }
  });

  it('given a well-suited attacker vs the same opponent then chance quality beats a poorly-suited one', () => {
    const opp = squad(60);
    const technical = squad(60, { passing: 95, technique: 95 });
    const physical = squad(60, { passing: 20, technique: 20 });
    const keepIntent = { ...defaultIntent('4-3-3'), style: 'keep_the_ball' as TacticalStyleId };
    const good = resolveMatchParameters(keepIntent, technical, opp);
    const bad = resolveMatchParameters(keepIntent, physical, opp);
    expect(good.chanceQuality).toBeGreaterThan(bad.chanceQuality);
  });
});

describe('AI style mapping:', () => {
  it('given every formation then it maps to a valid, deterministic style', () => {
    for (const f of ALL_FORMATIONS) {
      const style = formationToStyle(f);
      expect(TACTICAL_STYLE_IDS).toContain(style);
      expect(formationToStyle(f)).toBe(style);
    }
  });

  it('given defensive and attacking formations then their styles differ sensibly', () => {
    expect(formationToStyle('5-4-1')).toBe('defend_deep');
    expect(formationToStyle('4-3-3')).toBe('press_high');
  });

  it('given aiIntent then it carries the formation, its style and neutral sliders', () => {
    const intent = aiIntent('5-4-1');
    expect(intent.formation).toBe('5-4-1');
    expect(intent.style).toBe('defend_deep');
    expect(intent.sliders).toEqual({ tempo: 50, risk: 50, defensiveLine: 50 });
  });
});
