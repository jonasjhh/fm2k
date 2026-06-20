import {
  SkillCalculator,
  ShortPassGenerator,
  DribbleGenerator,
  LongPassGenerator,
  ThroughBallGenerator,
  CrossGenerator,
  ShotGenerator,
  resolveContest,
  contestWinChance,
} from './action-generators.ts';
import { MatchState, BallPosition } from './types.ts';
import { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import { NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
import { assertDefined } from '../test-assert.ts';

// ── fixtures ────────────────────────────────────────────────────────────────

function attrs(overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return {
    speed: 0, strength: 0, agility: 0, passing: 0, finishing: 0,
    technique: 0, defending: 0, stamina: 0, awareness: 0, composure: 0,
    ...overrides,
  };
}

function player(id: string, position: PlayerPosition, a: Partial<PlayerAttributes> = {}): Player {
  return {
    id, name: id, nationality: 'norwegian', age: 25, position,
    potential: 70, attributes: attrs(a),
  };
}

// An outfield XI plus a keeper, good enough for possession/defender logic.
function eleven(prefix: string): Player[] {
  return [
    player(`${prefix}-gk`, 'GK', { agility: 80, composure: 70 }),
    player(`${prefix}-cb1`, 'CB', { defending: 80, strength: 70, awareness: 60 }),
    player(`${prefix}-cb2`, 'CB', { defending: 80, strength: 70, awareness: 60 }),
    player(`${prefix}-lb`, 'LB', { defending: 70, speed: 70 }),
    player(`${prefix}-rb`, 'RB', { defending: 70, speed: 70 }),
    player(`${prefix}-cm1`, 'CM', { passing: 75, technique: 70, stamina: 75 }),
    player(`${prefix}-cm2`, 'CM', { passing: 75, technique: 70, stamina: 75 }),
    player(`${prefix}-lm`, 'LM', { speed: 75, technique: 70, passing: 65 }),
    player(`${prefix}-rm`, 'RM', { speed: 75, technique: 70, passing: 65 }),
    player(`${prefix}-st1`, 'ST', { finishing: 85, speed: 75, composure: 70, technique: 70, agility: 70 }),
    player(`${prefix}-st2`, 'ST', { finishing: 85, speed: 75, composure: 70, technique: 70, agility: 70 }),
  ];
}

function team(id: string): Team {
  return {
    id, name: id, formation: '4-4-2',
    colors: { primary: '#fff', secondary: '#000' },
    squad: eleven(id),
  };
}

function makeState(overrides: Partial<MatchState> = {}): MatchState {
  const home = team('home');
  const away = team('away');
  return {
    minute: 10,
    homeScore: 0,
    awayScore: 0,
    possession: 'home',
    ballPosition: { zone: 'middle_third', side: 'center' },
    phase: 'first_half',
    homeTeam: home,
    awayTeam: away,
    currentPlayers: { home: home.squad, away: away.squad },
    bookings: { yellow: [], red: [] },
    ...overrides,
  };
}

// Returns each value once then repeats the last — scripts successive rng() calls.
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

// ── SkillCalculator: pin each formula so arithmetic mutants are killed ─────────

describe('SkillCalculator:', () => {
  // For a player at their natural position the effective attributes equal the
  // raw attributes (modifier 1.0), so we can assert the exact weighted sum.
  // Distinct non-zero values per term so every coefficient *and* the additions
  // between terms are exercised (a zero term would hide its operator mutant).
  const cases: Array<{
    name: string;
    calc: (p: Player) => number;
    pos: PlayerPosition;
    a: Partial<PlayerAttributes>;
    expected: number;
  }> = [
    { name: 'dribbling = technique*0.4 + speed*0.3 + agility*0.3',
      calc: p => SkillCalculator.dribbling(p), pos: 'ST',
      a: { speed: 10, technique: 20, agility: 30 }, expected: 20 }, // 8 + 3 + 9
    { name: 'finishing = finishing*0.7 + composure*0.2 + technique*0.1',
      calc: p => SkillCalculator.finishing(p), pos: 'ST',
      a: { finishing: 10, composure: 20, technique: 30 }, expected: 14 }, // 7 + 4 + 3
    { name: 'heading = strength*0.4 + agility*0.35 + finishing*0.25',
      calc: p => SkillCalculator.heading(p), pos: 'ST',
      a: { finishing: 10, agility: 20, strength: 30 }, expected: 21.5 }, // 12 + 7 + 2.5
    { name: 'penalties = finishing*0.55 + composure*0.35 + technique*0.1',
      calc: p => SkillCalculator.penalties(p), pos: 'ST',
      a: { finishing: 10, composure: 20, technique: 30 }, expected: 15.5 }, // 5.5 + 7 + 3
    { name: 'throughBall = awareness*0.5 + passing*0.4 + technique*0.1',
      calc: p => SkillCalculator.throughBall(p), pos: 'CM',
      a: { awareness: 10, passing: 20, technique: 30 }, expected: 16 }, // 5 + 8 + 3
    { name: 'longShot = finishing*0.5 + technique*0.3 + composure*0.2',
      calc: p => SkillCalculator.longShot(p), pos: 'ST',
      a: { finishing: 10, technique: 20, composure: 30 }, expected: 17 }, // 5 + 6 + 6
    { name: 'crossing = passing*0.6 + technique*0.3 + awareness*0.1',
      calc: p => SkillCalculator.crossing(p), pos: 'LM',
      a: { passing: 10, technique: 20, awareness: 30 }, expected: 15 }, // 6 + 6 + 3
    { name: 'clearing = defending*0.5 + strength*0.4 + awareness*0.1',
      calc: p => SkillCalculator.clearing(p), pos: 'CB',
      a: { defending: 10, strength: 20, awareness: 30 }, expected: 16 }, // 5 + 8 + 3
    { name: 'tackling = defending*0.6 + awareness*0.2 + strength*0.2',
      calc: p => SkillCalculator.tackling(p), pos: 'CB',
      a: { defending: 10, awareness: 20, strength: 30 }, expected: 16 }, // 6 + 4 + 6
    { name: 'interception = awareness*0.5 + defending*0.3 + agility*0.2',
      calc: p => SkillCalculator.interception(p), pos: 'CB',
      a: { awareness: 10, defending: 20, agility: 30 }, expected: 17 }, // 5 + 6 + 6
    { name: 'gkSaving = agility*0.55 + awareness*0.25 + composure*0.2',
      calc: p => SkillCalculator.gkSaving(p), pos: 'GK',
      a: { agility: 10, composure: 20, awareness: 30 }, expected: 17 }, // 5.5 + 7.5 + 4
  ];

  for (const c of cases) {
    it(`given a single attribute when computing ${c.name}`, () => {
      const p = player('p', c.pos, c.a);
      expect(c.calc(p)).toBeCloseTo(c.expected, 5);
    });
  }

  it('given an out-of-position player when computing a skill then the modifier lowers it', () => {
    const onPosition = player('st', 'ST', { finishing: 100 });
    const outOfPosition = player('cb', 'CB', { finishing: 100 });
    // A striker's finishing is reduced when fielded as a centre-back.
    expect(SkillCalculator.finishing(outOfPosition, 'ST'))
      .toBeLessThan(SkillCalculator.finishing(onPosition, 'ST'));
  });
});

// ── offensive generators are now SUCCESS-ONLY ──────────────────────────────────
// Turnovers no longer live inside the generators: the contest (resolveContest) decides
// whether the action is won back. generateEvent only models the uncontested outcome.

describe('ShortPassGenerator (success-only):', () => {
  const passer = () => player('p', 'CM', { passing: 80, technique: 60 });

  it('is allowed in the playing halves and disallowed otherwise', () => {
    const gen = new ShortPassGenerator();
    expect(gen.canPerform(passer(), makeState({ phase: 'first_half' }))).toBe(true);
    expect(gen.canPerform(passer(), makeState({ phase: 'second_half' }))).toBe(true);
    expect(gen.canPerform(passer(), makeState({ phase: 'half_time' }))).toBe(false);
  });

  it('always completes (keeps possession) and advances one zone on a low forward roll', () => {
    // neutral params → pForward = 0.24; rng 0 < 0.24 advances middle_third → away_third
    const gen = new ShortPassGenerator(seq([0]));
    const event = assertDefined(
      gen.generateEvent(passer(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.type).toBe('short_pass');
    expect(event.team).toBe('home');
    expect(event.description).toContain('completes a short pass');
    expect(event.resultingState.possession).toBe('home');
    expect(event.resultingState.ballPosition.zone).toBe('away_third');
  });

  it('keeps the ball in the same zone when the forward roll is high', () => {
    const gen = new ShortPassGenerator(seq([0.5])); // 0.5 ≥ 0.24 → no advance
    const event = assertDefined(
      gen.generateEvent(passer(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.resultingState.ballPosition.zone).toBe('middle_third');
  });

  it('cannot advance past the final zone', () => {
    const gen = new ShortPassGenerator(seq([0])); // forward roll low
    const event = assertDefined(
      gen.generateEvent(passer(), makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.resultingState.ballPosition.zone).toBe('away_box');
  });

  describe('calculateProbability (selection weight, not outcome)', () => {
    it('weights a stronger passer above a weaker one', () => {
      const gen = new ShortPassGenerator();
      const strong = gen.calculateProbability(player('p', 'CM', { passing: 90, technique: 90 }), makeState());
      const weak = gen.calculateProbability(player('p', 'CM', { passing: 20, technique: 20 }), makeState());
      expect(strong).toBeGreaterThan(weak);
    });

    it('applies the home-zone retention bonus over attacking zones', () => {
      const gen = new ShortPassGenerator();
      const p = player('p', 'CM', { passing: 40, technique: 40 });
      const home = gen.calculateProbability(p, makeState({ ballPosition: { zone: 'home_third', side: 'center' } }));
      const mid = gen.calculateProbability(p, makeState({ ballPosition: { zone: 'middle_third', side: 'center' } }));
      expect(home / mid).toBeCloseTo(1.1 / 0.9, 5);
    });

    it('clamps very high skill to 0.95', () => {
      const elite = player('p', 'CM', { passing: 99, technique: 99 });
      expect(new ShortPassGenerator().calculateProbability(elite, makeState({ ballPosition: { zone: 'home_third', side: 'center' } })))
        .toBe(0.95);
    });
  });
});

describe('DribbleGenerator (success-only):', () => {
  const dribbler = () => player('p', 'LW', { speed: 90, technique: 90, agility: 90 });

  it('allows any outfielder but never a goalkeeper, and never outside the halves', () => {
    expect(new DribbleGenerator().canPerform(dribbler(), makeState())).toBe(true);
    expect(new DribbleGenerator().canPerform(player('p', 'CB', { speed: 10 }), makeState())).toBe(true);
    expect(new DribbleGenerator().canPerform(player('gk', 'GK', {}), makeState())).toBe(false);
    expect(new DribbleGenerator().canPerform(dribbler(), makeState({ phase: 'half_time' }))).toBe(false);
  });

  it('always beats the defender (success path) and advances one zone on a low roll', () => {
    // advancement roll 0 (< 0.6 → +1), then side roll 0 (< 0.5 → keep side)
    const gen = new DribbleGenerator(seq([0, 0]));
    const event = assertDefined(
      gen.generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.type).toBe('dribble');
    expect(event.description).toContain('skillful dribbling');
    expect(event.resultingState.possession).toBe('home');
    expect(event.resultingState.ballPosition.zone).toBe('away_third');
  });

  it('advances two zones when the advancement roll is high', () => {
    const gen = new DribbleGenerator(seq([0.9, 0])); // 0.9 ≥ 0.6 → +2
    const event = assertDefined(
      gen.generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.resultingState.ballPosition.zone).toBe('away_box');
  });

  it('the advancement roll exactly at 0.6 advances two zones (strict <)', () => {
    const gen = new DribbleGenerator(seq([0.6, 0]));
    const event = assertDefined(
      gen.generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.resultingState.ballPosition.zone).toBe('away_box');
  });

  it('keeps the side below 0.5 and moves a flank dribbler infield at ≥ 0.5', () => {
    const keep = assertDefined(
      new DribbleGenerator(seq([0, 0])).generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'left' } })),
      'generateEvent returned null',
    );
    expect(keep.resultingState.ballPosition.side).toBe('left');
    const infield = assertDefined(
      new DribbleGenerator(seq([0, 0.5])).generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'left' } })),
      'generateEvent returned null',
    );
    expect(infield.resultingState.ballPosition.side).toBe('center');
  });

  describe('calculateProbability (selection weight)', () => {
    it('scales by zone, clamped at 0.85', () => {
      const gen = new DribbleGenerator();
      const p = player('p', 'LW', { speed: 30, technique: 30, agility: 30 });
      const prob = (zone: BallPosition['zone']) =>
        gen.calculateProbability(p, makeState({ ballPosition: { zone, side: 'center' } }));
      const base = prob('middle_third');
      expect(prob('home_box')).toBeCloseTo(base * 0.6, 5);
      expect(prob('home_third')).toBeCloseTo(base * 0.8, 5);
      expect(prob('away_third')).toBeCloseTo(base * 1.2, 5);
      expect(prob('away_box')).toBeCloseTo(base * 1.1, 5);
      const elite = player('p', 'LW', { speed: 99, technique: 99, agility: 99 });
      expect(gen.calculateProbability(elite, makeState({ ballPosition: { zone: 'away_third', side: 'center' } }))).toBe(0.85);
    });
  });
});

describe('LongPass / ThroughBall / Cross (success-only):', () => {
  it('LongPass advances toward goal and keeps possession', () => {
    const gen = new LongPassGenerator(seq([0])); // jump roll low → +1
    const event = assertDefined(
      gen.generateEvent(player('p', 'CM', { passing: 80, strength: 60 }),
        makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.type).toBe('long_pass');
    expect(event.description).toContain('long ball');
    expect(event.resultingState.possession).toBe('home');
    expect(['away_third', 'away_box']).toContain(event.resultingState.ballPosition.zone);
  });

  it('ThroughBall splits the line by jumping two zones', () => {
    const gen = new ThroughBallGenerator(seq([0]));
    const event = assertDefined(
      gen.generateEvent(player('p', 'CM', { awareness: 80, passing: 80 }),
        makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } })),
      'generateEvent returned null',
    );
    expect(event.type).toBe('through_ball');
    expect(event.resultingState.ballPosition.zone).toBe('away_box');
    expect(event.resultingState.possession).toBe('home');
  });

  it('Cross beats the first defender and chains a header in the box', () => {
    const gen = new CrossGenerator(seq([0.999]));
    const event = assertDefined(
      gen.generateEvent(player('p', 'LM', { passing: 80, technique: 70 }),
        makeState({ possession: 'home', ballPosition: { zone: 'away_third', side: 'left' } })),
      'generateEvent returned null',
    );
    expect(event.type).toBe('cross');
    expect(event.resultingState.ballPosition).toEqual({ zone: 'away_box', side: 'center' });
    expect(assertDefined(event.chainedEvent, 'no chained event').type).toBe('shot'); // the header attempt
  });
});

// ── ShotGenerator (still resolved by the keeper — NOT routed through the contest) ─

describe('ShotGenerator:', () => {
  const striker = () => player('p', 'ST', { finishing: 90, composure: 80, technique: 70 });

  it('given the ball in the attacking box when checking canPerform then it is allowed', () => {
    const state = makeState({ ballPosition: { zone: 'away_box', side: 'center' } });
    expect(new ShotGenerator().canPerform(striker(), state)).toBe(true);
  });

  it('given the ball in midfield when checking canPerform then it is disallowed', () => {
    const state = makeState({ ballPosition: { zone: 'middle_third', side: 'center' } });
    expect(new ShotGenerator().canPerform(striker(), state)).toBe(false);
  });

  it('given a converted shot when generating then a goal chains and the score increments', () => {
    const gen = new ShotGenerator(() => 0);
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const event = assertDefined(gen.generateEvent(striker(), state), 'generateEvent returned null');
    expect(event.type).toBe('shot');
    expect(event.description).toContain('shoots');
    const goal = assertDefined(event.chainedEvent, 'no chained event');
    expect(goal.type).toBe('goal');
    expect(goal.description).toContain('GOAL');
    expect(goal.resultingState.homeScore).toBe(1);
    expect(goal.resultingState.awayScore).toBe(0);
    expect(goal.resultingState.possession).toBe('away');
    expect(goal.resultingState.ballPosition).toEqual({ zone: 'middle_third', side: 'center' });
  });

  it('given a saved shot when generating then a save chains and the score is unchanged', () => {
    const gen = new ShotGenerator(() => 0.999);
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const event = assertDefined(gen.generateEvent(striker(), state), 'generateEvent returned null');
    const outcome = assertDefined(event.chainedEvent, 'no chained event');
    expect(outcome.type).toBe('save');
    expect(outcome.team).toBe('away');
    expect(outcome.description).toContain('save');
    expect(outcome.resultingState.homeScore).toBe(0);
  });

  it('scores the away team when they are in possession', () => {
    const gen = new ShotGenerator(() => 0);
    const state = makeState({ possession: 'away', ballPosition: { zone: 'away_box', side: 'center' } });
    const event = assertDefined(gen.generateEvent(striker(), state), 'generateEvent returned null');
    const goal = assertDefined(event.chainedEvent, 'no chained event');
    expect(goal.resultingState.awayScore).toBe(1);
    expect(goal.resultingState.homeScore).toBe(0);
  });

  it('scales shot-taking by zone and clamps at 0.9', () => {
    const gen = new ShotGenerator();
    const s = player('p', 'ST', { finishing: 60 });
    const box = gen.calculateProbability(s, makeState({ ballPosition: { zone: 'away_box', side: 'center' } }));
    const third = gen.calculateProbability(s, makeState({ ballPosition: { zone: 'away_third', side: 'center' } }));
    expect(box / third).toBeCloseTo(1.2 / 0.8, 5);
    expect(box).toBeLessThanOrEqual(0.9);
  });

  it('Shot save names the defending goalkeeper', () => {
    const gen = new ShotGenerator(() => 0.999);
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const gk = assertDefined(state.currentPlayers.away.find(p => p.position === 'GK'), 'no GK found');
    const event = assertDefined(
      gen.generateEvent(player('p', 'ST', { finishing: 90 }), state),
      'generateEvent returned null',
    );
    const save = assertDefined(event.chainedEvent, 'no chained event');
    expect(save.type).toBe('save');
    expect(save.playerId).toBe(gk.id);
  });
});

// ── the contest: a selected defender resolves the attacker's action ─────────────

describe('resolveContest:', () => {
  const attacker = () => player('a', 'ST', { technique: 50, speed: 50, agility: 50, passing: 50 });
  const defender = () => player('d', 'CB', { defending: 80, awareness: 60, strength: 70 });

  it('a low foul roll yields a foul (set piece for the attackers)', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    const event = assertDefined(resolveContest('dribble', attacker(), defender(), state, seq([0])), 'resolveContest returned null');
    expect(event.type).toBe('foul');
    expect(event.team).toBe('away'); // the defending side conceded it
  });

  it('a clean win against a dribble is a tackle that flips possession', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    // rng[0] high → no foul; rng[1] low → defender wins
    const event = assertDefined(
      resolveContest('dribble', attacker(), defender(), state, seq([0.999, 0])),
      'resolveContest returned null',
    );
    expect(event.type).toBe('tackle');
    expect(event.team).toBe('away');
    expect(event.description).toContain('tackle');
    expect(event.resultingState.possession).toBe('away');
  });

  it('a clean win against a pass is an interception that flips possession', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    const event = assertDefined(
      resolveContest('short_pass', attacker(), defender(), state, seq([0.999, 0])),
      'resolveContest returned null',
    );
    expect(event.type).toBe('interception');
    expect(event.team).toBe('away');
    expect(event.resultingState.possession).toBe('away');
  });

  it('a win deep in the box is a clearance to midfield (relieves pressure)', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const event = assertDefined(
      resolveContest('dribble', attacker(), defender(), state, seq([0.999, 0])),
      'resolveContest returned null',
    );
    expect(event.type).toBe('clearance');
    expect(event.resultingState.possession).toBe('away');
    expect(event.resultingState.ballPosition).toEqual({ zone: 'middle_third', side: 'center' });
  });

  it('a cleared cross sometimes only reaches a corner', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_third', side: 'left' } });
    // no foul, win, then corner roll low (< CORNER_ON_CLEARED_CROSS)
    const event = assertDefined(
      resolveContest('cross', attacker(), defender(), state, seq([0.999, 0, 0])),
      'resolveContest returned null',
    );
    expect(event.type).toBe('cross');
    expect(assertDefined(event.chainedEvent, 'no chained event').type).toBe('corner');
  });

  it('when the defender neither fouls nor wins, the attacker proceeds (null)', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    expect(resolveContest('dribble', attacker(), defender(), state, seq([0.999, 0.999]))).toBeNull();
  });
});

describe('contestWinChance:', () => {
  const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
  const mid = (over: Partial<PlayerAttributes> = {}) =>
    player('p', 'CB', { defending: 50, awareness: 50, strength: 50, agility: 50, technique: 50, speed: 50, passing: 50, ...over });

  it('rises with a stronger defender, falls with a stronger attacker', () => {
    const atk = mid();
    expect(contestWinChance('dribble', atk, mid({ defending: 90, awareness: 90, strength: 90 }), state))
      .toBeGreaterThan(contestWinChance('dribble', atk, mid({ defending: 10, awareness: 10, strength: 10 }), state));
    const def = mid();
    expect(contestWinChance('dribble', mid({ technique: 90, speed: 90, agility: 90 }), def, state))
      .toBeLessThan(contestWinChance('dribble', mid({ technique: 10, speed: 10, agility: 10 }), def, state));
  });

  it('rises with pressing intensity', () => {
    const atk = mid();
    const def = mid();
    const low = makeState({ possession: 'home', params: { home: NEUTRAL_PARAMS, away: { ...NEUTRAL_PARAMS, pressIntensity: 0 } } });
    const high = makeState({ possession: 'home', params: { home: NEUTRAL_PARAMS, away: { ...NEUTRAL_PARAMS, pressIntensity: 100 } } });
    expect(contestWinChance('dribble', atk, def, high)).toBeGreaterThan(contestWinChance('dribble', atk, def, low));
  });

  it('a high-exposure action (through ball) is lost more than a safe short pass at parity', () => {
    const atk = mid();
    const def = mid();
    expect(contestWinChance('through_ball', atk, def, state)).toBeGreaterThan(contestWinChance('short_pass', atk, def, state));
  });
});
