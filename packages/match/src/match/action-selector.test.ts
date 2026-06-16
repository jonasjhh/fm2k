import { activePlayerWeight, selectActivePlayer } from './action-selector.ts';
import { BallPosition } from './types.ts';
import { Player, Position } from '../shared/types.ts';

function createTestPlayer(id: string, position: Position): Player {
  return {
    id,
    name: id,
    nationality: 'norwegian',
    age: 25,
    position,
    potential: 70,
    attributes: {
      speed: 70,
      strength: 70,
      agility: position === 'GK' ? 85 : 70,
      passing: 70,
      finishing: position === 'GK' ? 30 : 70,
      technique: 70,
      defending: ['CB', 'LB', 'RB', 'CDM'].includes(position) ? 85 : 50,
      stamina: 75,
      awareness: 70,
      composure: 70,
    },
  };
}

// A full XI mirroring the match-simulator test team (4-4-2).
function createTestXI(): Player[] {
  const spec: [string, Position][] = [
    ['gk1', 'GK'],
    ['cb1', 'CB'], ['cb2', 'CB'], ['lb1', 'LB'], ['rb1', 'RB'],
    ['cm1', 'CM'], ['cm2', 'CM'], ['lm1', 'LM'], ['rm1', 'RM'],
    ['st1', 'ST'], ['st2', 'ST'],
  ];
  return spec.map(([id, pos]) => createTestPlayer(id, pos));
}

const ALL_ZONES: BallPosition['zone'][] = [
  'home_box', 'home_third', 'middle_third', 'away_third', 'away_box',
];

describe('activePlayerWeight:', () => {
  const st = createTestPlayer('st', 'ST');
  const cb = createTestPlayer('cb', 'CB');
  const gk = createTestPlayer('gk', 'GK');

  it('favours attackers in the attacking box', () => {
    const ball: BallPosition = { zone: 'away_box', side: 'center' };
    expect(activePlayerWeight(st, ball)).toBeGreaterThan(activePlayerWeight(cb, ball));
  });

  it('favours defenders in the own box', () => {
    const ball: BallPosition = { zone: 'home_box', side: 'center' };
    expect(activePlayerWeight(cb, ball)).toBeGreaterThan(activePlayerWeight(st, ball));
  });

  it('gives the GK weight only in the own box', () => {
    expect(activePlayerWeight(gk, { zone: 'home_box', side: 'center' })).toBeGreaterThan(0);
    for (const zone of ALL_ZONES.filter(z => z !== 'home_box')) {
      expect(activePlayerWeight(gk, { zone, side: 'center' })).toBe(0);
    }
  });

  it('favours the matching flank over centre over the opposite flank', () => {
    const lm = createTestPlayer('lm', 'LM');
    const cm = createTestPlayer('cm', 'CM');
    const rm = createTestPlayer('rm', 'RM');
    const ball: BallPosition = { zone: 'middle_third', side: 'left' };
    expect(activePlayerWeight(lm, ball)).toBeGreaterThan(activePlayerWeight(cm, ball));
    expect(activePlayerWeight(cm, ball)).toBeGreaterThan(activePlayerWeight(rm, ball));
  });
});

describe('selectActivePlayer:', () => {
  function sample(ball: BallPosition, n = 4000): Record<string, number> {
    const xi = createTestXI();
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const p = selectActivePlayer(xi, ball);
      if (p) { counts[p.position] = (counts[p.position] ?? 0) + 1; }
    }
    return counts;
  }

  it('selects attackers far more than defenders in the attacking box', () => {
    const counts = sample({ zone: 'away_box', side: 'center' });
    const att = (counts.ST ?? 0);
    const def = (counts.CB ?? 0) + (counts.LB ?? 0) + (counts.RB ?? 0);
    expect(att).toBeGreaterThan(def);
    expect(counts.GK ?? 0).toBe(0);
  });

  it('selects defenders most often in the own box and occasionally the GK', () => {
    const counts = sample({ zone: 'home_box', side: 'center' });
    const def = (counts.CB ?? 0) + (counts.LB ?? 0) + (counts.RB ?? 0);
    const att = (counts.ST ?? 0);
    expect(def).toBeGreaterThan(att);
    expect(counts.GK ?? 0).toBeGreaterThan(0);
  });

  it('favours the matching flank in midfield', () => {
    const counts = sample({ zone: 'middle_third', side: 'left' });
    expect(counts.LM ?? 0).toBeGreaterThan(counts.RM ?? 0);
  });

  it('never selects the GK outside the own box', () => {
    for (const zone of ALL_ZONES.filter(z => z !== 'home_box')) {
      const counts = sample({ zone, side: 'center' }, 1000);
      expect(counts.GK ?? 0).toBe(0);
    }
  });

  it('returns players deterministically with an injected rng', () => {
    const xi = createTestXI();
    const ball: BallPosition = { zone: 'middle_third', side: 'center' };
    // rng=0 always picks the first weighted candidate in iteration order.
    const first = selectActivePlayer(xi, ball, () => 0);
    expect(first).toBe(selectActivePlayer(xi, ball, () => 0));
  });
});

// ── ActionSelector class (decision + dispatch) ─────────────────────────────────

import { ActionSelector, ActionGenerator } from './action-selector.ts';
import { MatchState, MatchEvent, EventType } from './types.ts';

/** A generator that always offers `prob` and emits an event tagged with its type. */
function stubGen(type: EventType, prob: number, canPerform = true): ActionGenerator {
  return {
    canPerform: () => canPerform,
    calculateProbability: () => prob,
    generateEvent: (player, state): MatchEvent => ({
      id: type, type, minute: state.minute, team: state.possession,
      description: type, resultingState: state,
    }),
  };
}

function stateWith(active: Player): MatchState {
  return {
    minute: 10, homeScore: 0, awayScore: 0, possession: 'home',
    ballPosition: { zone: 'middle_third', side: 'center' }, phase: 'first_half',
    homeTeam: {} as any, awayTeam: {} as any,
    currentPlayers: { home: [active], away: [] },
    bookings: { yellow: [], red: [] },
  };
}

describe('ActionSelector class:', () => {
  // awareness 40 → decisionQuality 0.4; thresholds: best < 0.4, second < 0.7, else random.
  const cm = createTestPlayer('cm', 'CM');
  cm.attributes.awareness = 40;

  function selectorWith(rng: () => number): ActionSelector {
    const sel = new ActionSelector(rng);
    sel.registerAction('shot', stubGen('shot', 0.9));      // highest weight
    sel.registerAction('dribble', stubGen('dribble', 0.5)); // middle
    sel.registerAction('tackle', stubGen('tackle', 0.1));   // lowest
    return sel;
  }

  it('picks the highest-weighted action on a confident decision (rng below quality)', () => {
    expect(selectorWith(() => 0).selectPlayerAction(stateWith(cm))!.type).toBe('shot');
  });

  it('picks the second-best action in the mid band', () => {
    // rng 0.5: not < 0.4, but < 0.7 → second-best
    expect(selectorWith(() => 0.5).selectPlayerAction(stateWith(cm))!.type).toBe('dribble');
  });

  it('falls back to a weighted-index random pick on a poor decision', () => {
    // rng 0.99: ≥ 0.7 → random → floor(0.99 * 3) = index 2 (lowest weight)
    expect(selectorWith(() => 0.99).selectPlayerAction(stateWith(cm))!.type).toBe('tackle');
  });

  it('returns null when there is no active player', () => {
    const sel = selectorWith(() => 0);
    const empty: MatchState = { ...stateWith(cm), currentPlayers: { home: [], away: [] } };
    expect(sel.selectPlayerAction(empty)).toBeNull();
  });

  it('returns null when no registered action can be performed', () => {
    const sel = new ActionSelector(() => 0);
    sel.registerAction('shot', stubGen('shot', 0.9, false)); // canPerform false
    expect(sel.selectPlayerAction(stateWith(cm))).toBeNull();
  });

  it('generates sequential event ids', () => {
    const sel = new ActionSelector();
    expect(sel.generateId()).toBe('event-1');
    expect(sel.generateId()).toBe('event-2');
  });

  // A scripted rng: yields each value once, then repeats the last.
  function seq(values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  }

  it('picks the best option by weight regardless of registration order (sort matters)', () => {
    // Register lowest-weight first; a confident decision must still pick the highest.
    const sel = new ActionSelector(() => 0);
    sel.registerAction('tackle', stubGen('tackle', 0.1));
    sel.registerAction('dribble', stubGen('dribble', 0.5));
    sel.registerAction('shot', stubGen('shot', 0.9));
    expect(sel.selectPlayerAction(stateWith(cm))!.type).toBe('shot');
  });

  it('uses awareness for decision quality, falling back to 50 only when falsy', () => {
    // awareness 0 → fallback 50 → dq 0.5; rng 0.4 < 0.5 → best ('shot').
    // If the fallback were `&& 50`, dq would be 0 and 0.4 would miss the best band.
    const zero = createTestPlayer('z', 'CM');
    zero.attributes.awareness = 0;
    expect(selectorWith(() => 0.4).selectPlayerAction(stateWith(zero))!.type).toBe('shot');
  });

  it('treats rng exactly equal to quality as NOT confident (strict <)', () => {
    // awareness 40 → dq 0.4; rng exactly 0.4 → not best, falls to second ('dribble').
    expect(selectorWith(() => 0.4).selectPlayerAction(stateWith(cm))!.type).toBe('dribble');
  });

  it('uses the dq+0.3 mid band, not dq-0.3', () => {
    // seq[0] feeds selectActivePlayer; randomFactor=0.5: 0.4 ≤ 0.5 < 0.7 → second ('dribble').
    // With dq-0.3 (=0.1) it would fall to random.
    expect(selectorWith(seq([0, 0.5, 0.99])).selectPlayerAction(stateWith(cm))!.type).toBe('dribble');
  });

  it('treats rng exactly at the mid-band edge as random (strict <)', () => {
    // seq[0] feeds selectActivePlayer; randomFactor=0.7 == dq+0.3 → not second;
    // random uses next rng 0.99 → floor(0.99*3)=2 ('tackle').
    expect(selectorWith(seq([0, 0.7, 0.99])).selectPlayerAction(stateWith(cm))!.type).toBe('tackle');
  });

  it('falls back to the single available action on a poor decision (length guard)', () => {
    // Only one action; poor decision (rng high) must still return it, not undefined/null.
    const sel = new ActionSelector(() => 0.99);
    sel.registerAction('shot', stubGen('shot', 0.9));
    expect(sel.selectPlayerAction(stateWith(cm))!.type).toBe('shot');
  });
});

// ── pure weighting helpers ─────────────────────────────────────────────────────

import {
  getPositionPreference, getSkillRequired, getRiskLevel,
  getSituationalModifier, getRiskTolerance, calculateActionWeight, PlayerAction,
} from './action-selector.ts';

function action(type: string, probability = 0.5, riskLevel: PlayerAction['riskLevel'] = 'medium'): PlayerAction {
  return { type, player: createTestPlayer('p', 'CM'), probability, skillRequired: 0, riskLevel };
}

function stateAt(zone: BallPosition['zone'], over: Partial<MatchState> = {}): MatchState {
  return { ...stateWith(createTestPlayer('p', 'CM')), ballPosition: { zone, side: 'center' }, ...over };
}

describe('getPositionPreference:', () => {
  it('returns the table value for a known action+position', () => {
    expect(getPositionPreference('short_pass', 'CDM')).toBe(1.4);
    expect(getPositionPreference('long_pass', 'CM')).toBe(1.2);
    expect(getPositionPreference('through_ball', 'CAM')).toBe(1.5);
    expect(getPositionPreference('dribble', 'LW')).toBe(1.4);
    expect(getPositionPreference('shot', 'ST')).toBe(1.5);
    expect(getPositionPreference('cross', 'LW')).toBe(1.5);
    expect(getPositionPreference('tackle', 'CB')).toBe(1.3);
    expect(getPositionPreference('clearance', 'GK')).toBe(1.2);
  });
  it('falls back to 1.0 for unknown action or position', () => {
    expect(getPositionPreference('shot', 'GK')).toBe(1.0);
    expect(getPositionPreference('teleport', 'ST')).toBe(1.0);
  });
});

describe('getSkillRequired:', () => {
  it('returns the table requirement', () => {
    expect(getSkillRequired('through_ball')).toBe(80);
    expect(getSkillRequired('clearance')).toBe(50);
    expect(getSkillRequired('shot')).toBe(65);
  });
  it('falls back to 60 for an unknown action', () => {
    expect(getSkillRequired('teleport')).toBe(60);
  });
});

describe('getRiskLevel:', () => {
  it('returns the table risk level', () => {
    expect(getRiskLevel('through_ball')).toBe('high');
    expect(getRiskLevel('tackle')).toBe('high');
    expect(getRiskLevel('short_pass')).toBe('low');
    expect(getRiskLevel('clearance')).toBe('low');
    expect(getRiskLevel('dribble')).toBe('medium');
  });
  it('falls back to medium for an unknown action', () => {
    expect(getRiskLevel('teleport')).toBe('medium');
  });
});

describe('getSituationalModifier:', () => {
  it('boosts shots in the attacking third/box', () => {
    expect(getSituationalModifier(action('shot'), stateAt('away_box'))).toBe(1.3);
    expect(getSituationalModifier(action('shot'), stateAt('away_third'))).toBe(1.3);
  });
  it('does not boost shots elsewhere', () => {
    expect(getSituationalModifier(action('shot'), stateAt('middle_third'))).toBe(1.0);
  });
  it('boosts clearances in the own third/box', () => {
    expect(getSituationalModifier(action('clearance'), stateAt('home_box'))).toBe(1.4);
    expect(getSituationalModifier(action('clearance'), stateAt('home_third'))).toBe(1.4);
  });
  it('does not boost a clearance away from the own end', () => {
    // distinguishes the && (type AND zone) from || — a non-home clearance stays 1.0
    expect(getSituationalModifier(action('clearance'), stateAt('middle_third'))).toBe(1.0);
  });
  it('does not boost a non-clearance in the own end', () => {
    // distinguishes && from ||, and the always-true zone mutant
    expect(getSituationalModifier(action('dribble'), stateAt('home_box'))).toBe(1.0);
  });
  it('boosts crosses only in the attacking third', () => {
    expect(getSituationalModifier(action('cross'), stateAt('away_third'))).toBe(1.2);
    expect(getSituationalModifier(action('cross'), stateAt('away_box'))).toBe(1.0);
    expect(getSituationalModifier(action('cross'), stateAt('middle_third'))).toBe(1.0);
  });
  it('returns 1.0 for unmatched action/zone', () => {
    expect(getSituationalModifier(action('dribble'), stateAt('away_box'))).toBe(1.0);
  });
});

describe('getRiskTolerance:', () => {
  // home in possession, trailing 0-1 → losing.
  const losing = stateAt('middle_third', { possession: 'home', homeScore: 0, awayScore: 1 });
  // home in possession, leading 1-0 → not losing.
  const winning = stateAt('middle_third', { possession: 'home', homeScore: 1, awayScore: 0 });

  it('rewards high risk when losing and penalises it when not', () => {
    expect(getRiskTolerance('high', losing)).toBe(1.3);
    expect(getRiskTolerance('high', winning)).toBe(0.8);
  });
  it('penalises low risk when losing and rewards it when not', () => {
    expect(getRiskTolerance('low', losing)).toBe(0.8);
    expect(getRiskTolerance('low', winning)).toBe(1.2);
  });
  it('is neutral for medium risk', () => {
    expect(getRiskTolerance('medium', losing)).toBe(1.0);
    expect(getRiskTolerance('medium', winning)).toBe(1.0);
  });
  it('treats the away possessor as losing when behind', () => {
    // away in possession, away trailing (home leads) → scoreDiff>0 → losing.
    const awayLosing = stateAt('middle_third', { possession: 'away', homeScore: 1, awayScore: 0 });
    expect(getRiskTolerance('high', awayLosing)).toBe(1.3);
  });
  it('does not treat a level score as losing (strict comparison, home)', () => {
    // scoreDiff === 0 → NOT losing; kills `< 0` → `<= 0`.
    const drawHome = stateAt('middle_third', { possession: 'home', homeScore: 1, awayScore: 1 });
    expect(getRiskTolerance('high', drawHome)).toBe(0.8);
  });
  it('does not treat a level score as losing (strict comparison, away)', () => {
    // scoreDiff === 0 → NOT losing; kills `> 0` → `>= 0`.
    const drawAway = stateAt('middle_third', { possession: 'away', homeScore: 1, awayScore: 1 });
    expect(getRiskTolerance('high', drawAway)).toBe(0.8);
  });
});

describe('calculateActionWeight:', () => {
  it('multiplies probability by every weighting factor', () => {
    const st = createTestPlayer('st', 'ST');
    // shot · ST(1.5) · away_box situational(1.3) · low-risk not-losing(1.2) · dq-factor(0.7)
    const a: PlayerAction = { type: 'shot', player: st, probability: 0.5, skillRequired: 0, riskLevel: 'low' };
    const state = stateAt('away_box', { possession: 'home', homeScore: 1, awayScore: 0 });
    const w = calculateActionWeight(a, st, state, 0.4);
    expect(w).toBeCloseTo(0.5 * 1.5 * 1.3 * 1.2 * (0.5 + 0.4 * 0.5), 10);
  });
});
