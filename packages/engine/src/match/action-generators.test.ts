import {
  SkillCalculator,
  ShortPassGenerator,
  DribbleGenerator,
  TackleGenerator,
  InterceptionGenerator,
  ShotGenerator,
} from './action-generators.ts';
import { MatchState, BallPosition } from './types.ts';
import { Player, PlayerAttributes, Position, Team } from '../shared/types.ts';
import { NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';

// ── fixtures ────────────────────────────────────────────────────────────────

function attrs(overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return {
    speed: 0, strength: 0, agility: 0, passing: 0, finishing: 0,
    technique: 0, defending: 0, stamina: 0, awareness: 0, composure: 0,
    ...overrides,
  };
}

function player(id: string, position: Position, a: Partial<PlayerAttributes> = {}): Player {
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
  const starters = eleven(id);
  return {
    id, name: id, formation: '4-4-2',
    colors: { primary: '#fff', secondary: '#000' },
    starters,
    substitutes: [],
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
    currentPlayers: { home: home.starters, away: away.starters },
    bookings: { yellow: [], red: [] },
    ...overrides,
  };
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
    pos: Position;
    a: Partial<PlayerAttributes>;
    expected: number;
  }> = [
    { name: 'dribbling = speed*0.3 + technique*0.4 + agility*0.3',
      calc: p => SkillCalculator.dribbling(p), pos: 'ST',
      a: { speed: 10, technique: 20, agility: 30 }, expected: 20 }, // 3 + 8 + 9
    { name: 'finishing = finishing*0.7 + composure*0.2 + technique*0.1',
      calc: p => SkillCalculator.finishing(p), pos: 'ST',
      a: { finishing: 10, composure: 20, technique: 30 }, expected: 14 }, // 7 + 4 + 3
    { name: 'heading = finishing*0.4 + agility*0.3 + strength*0.3',
      calc: p => SkillCalculator.heading(p), pos: 'ST',
      a: { finishing: 10, agility: 20, strength: 30 }, expected: 19 }, // 4 + 6 + 9
    { name: 'penalties = finishing*0.6 + composure*0.3 + technique*0.1',
      calc: p => SkillCalculator.penalties(p), pos: 'ST',
      a: { finishing: 10, composure: 20, technique: 30 }, expected: 15 }, // 6 + 6 + 3
    { name: 'throughBall = awareness*0.4 + passing*0.5 + technique*0.1',
      calc: p => SkillCalculator.throughBall(p), pos: 'CM',
      a: { awareness: 10, passing: 20, technique: 30 }, expected: 17 }, // 4 + 10 + 3
    { name: 'longShot = finishing*0.5 + technique*0.3 + composure*0.2',
      calc: p => SkillCalculator.longShot(p), pos: 'ST',
      a: { finishing: 10, technique: 20, composure: 30 }, expected: 17 }, // 5 + 6 + 6
    { name: 'crossing = passing*0.6 + technique*0.3 + awareness*0.1',
      calc: p => SkillCalculator.crossing(p), pos: 'LM',
      a: { passing: 10, technique: 20, awareness: 30 }, expected: 15 }, // 6 + 6 + 3
    { name: 'tackling = defending*0.6 + awareness*0.2 + strength*0.2',
      calc: p => SkillCalculator.tackling(p), pos: 'CB',
      a: { defending: 10, awareness: 20, strength: 30 }, expected: 16 }, // 6 + 4 + 6
    { name: 'interception = awareness*0.5 + defending*0.3 + agility*0.2',
      calc: p => SkillCalculator.interception(p), pos: 'CB',
      a: { awareness: 10, defending: 20, agility: 30 }, expected: 17 }, // 5 + 6 + 6
    { name: 'gkSaving = agility*0.5 + composure*0.3 + awareness*0.2',
      calc: p => SkillCalculator.gkSaving(p), pos: 'GK',
      a: { agility: 10, composure: 20, awareness: 30 }, expected: 17 }, // 5 + 6 + 6
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

// Returns each value once then repeats the last — scripts successive rng() calls.
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

// ── ShortPassGenerator ────────────────────────────────────────────────────────

describe('ShortPassGenerator:', () => {
  const passer = () => player('p', 'CM', { passing: 80, technique: 60 });

  it('given an active half when checking canPerform then it is allowed', () => {
    const gen = new ShortPassGenerator();
    expect(gen.canPerform(passer(), makeState({ phase: 'first_half' }))).toBe(true);
    expect(gen.canPerform(passer(), makeState({ phase: 'second_half' }))).toBe(true);
  });

  it('given a non-play phase when checking canPerform then it is disallowed', () => {
    expect(new ShortPassGenerator().canPerform(passer(), makeState({ phase: 'half_time' }))).toBe(false);
  });

  describe('calculateProbability', () => {
    it('retains better with a stronger passer than a weaker one', () => {
      const gen = new ShortPassGenerator();
      const strong = gen.calculateProbability(player('p', 'CM', { passing: 90, technique: 90 }), makeState());
      const weak = gen.calculateProbability(player('p', 'CM', { passing: 20, technique: 20 }), makeState());
      expect(strong).toBeGreaterThan(weak);
    });

    it('applies the home-zone retention bonus over attacking zones', () => {
      const gen = new ShortPassGenerator();
      const p = player('p', 'CM', { passing: 40, technique: 40 }); // low enough to avoid the 0.95 clamp
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

  it('on a successful low roll keeps possession and advances the ball one zone', () => {
    // rng[0]=0 success; rng[1]=0 → moveForward (0 < 0.3) advances middle_third → away_third
    const gen = new ShortPassGenerator(seq([0, 0]));
    const event = gen.generateEvent(passer(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } }))!;
    expect(event.type).toBe('short_pass');
    expect(event.team).toBe('home');
    expect(event.description).toContain('completes a short pass');
    expect(event.resultingState.possession).toBe('home');
    expect(event.resultingState.ballPosition.zone).toBe('away_third');
  });

  it('on a success without forward movement keeps the ball in the same zone', () => {
    // rng[0]=0 success; rng[1]=0.5 → moveForward false (0.5 ≥ 0.3) → zone unchanged
    const gen = new ShortPassGenerator(seq([0, 0.5]));
    const event = gen.generateEvent(passer(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } }))!;
    expect(event.resultingState.ballPosition.zone).toBe('middle_third');
  });

  it('on a failed roll turns possession over', () => {
    const gen = new ShortPassGenerator(() => 0.999);
    const event = gen.generateEvent(passer(), makeState({ possession: 'home' }))!;
    expect(event.description).toContain('intercepted');
    expect(event.resultingState.possession).toBe('away');
  });
});

// ── DribbleGenerator ──────────────────────────────────────────────────────────

describe('DribbleGenerator:', () => {
  const dribbler = () => player('p', 'LW', { speed: 90, technique: 90, agility: 90 });

  it('given a skilful outfielder when checking canPerform then it is allowed', () => {
    expect(new DribbleGenerator().canPerform(dribbler(), makeState())).toBe(true);
  });

  it('given a goalkeeper when checking canPerform then it is never allowed', () => {
    const gk = player('gk', 'GK', { speed: 90, technique: 90, agility: 90 });
    expect(new DribbleGenerator().canPerform(gk, makeState())).toBe(false);
  });

  it('given a weak outfielder then it may still attempt a dribble (no skill gate)', () => {
    const clumsy = player('p', 'CB', { speed: 10, technique: 10, agility: 10 });
    expect(new DribbleGenerator().canPerform(clumsy, makeState())).toBe(true);
    // …but it succeeds far less often than a skilful dribbler.
    const gen = new DribbleGenerator();
    const weak = gen.calculateProbability(clumsy, makeState({ ballPosition: { zone: 'middle_third', side: 'center' } }));
    const skilled = gen.calculateProbability(dribbler(), makeState({ ballPosition: { zone: 'middle_third', side: 'center' } }));
    expect(weak).toBeLessThan(skilled);
  });

  it('scales dribbling by the zone modifier, clamped at 0.85', () => {
    const gen = new DribbleGenerator();
    expect(gen.calculateProbability(dribbler(), makeState({ ballPosition: { zone: 'away_third', side: 'center' } }))).toBe(0.85);
    const mid = gen.calculateProbability(dribbler(), makeState({ ballPosition: { zone: 'middle_third', side: 'center' } }));
    const homeBox = gen.calculateProbability(dribbler(), makeState({ ballPosition: { zone: 'home_box', side: 'center' } }));
    expect(homeBox / mid).toBeCloseTo(0.6, 5);
  });

  it('on success advances the ball by one zone when the advancement roll is low', () => {
    // rng[0]=0 success; rng[1]=0 advancement (0<0.6 → +1); rng[2]=0 keep side
    const gen = new DribbleGenerator(seq([0, 0, 0]));
    const event = gen.generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } }))!;
    expect(event.description).toContain('skillful dribbling');
    expect(event.resultingState.ballPosition.zone).toBe('away_third');
  });

  it('on success advances by two zones when the advancement roll is high', () => {
    // rng[0]=0.1 success; rng[1]=0.9 advancement (≥0.6 → +2); rng[2]=0 keep side
    const gen = new DribbleGenerator(seq([0.1, 0.9, 0]));
    const event = gen.generateEvent(dribbler(), makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } }))!;
    expect(event.resultingState.ballPosition.zone).toBe('away_box'); // middle_third + 2
  });

  it('on a failed roll loses the ball', () => {
    const gen = new DribbleGenerator(() => 0.999);
    const event = gen.generateEvent(dribbler(), makeState({ possession: 'home' }))!;
    expect(event.type).toBe('dribble');
    expect(event.description).toContain('loses the ball');
    expect(event.resultingState.possession).toBe('away');
  });
});

// ── TackleGenerator ───────────────────────────────────────────────────────────

describe('TackleGenerator:', () => {
  it('given no defenders when checking canPerform then it is disallowed', () => {
    const state = makeState();
    state.currentPlayers.away = state.currentPlayers.away.filter(
      p => !['CB', 'LB', 'RB', 'CDM'].includes(p.position),
    );
    expect(new TackleGenerator().canPerform(state.currentPlayers.home[0], state)).toBe(false);
  });

  it('given a successful tackle when generating then possession flips to the defenders', () => {
    const gen = new TackleGenerator(() => 0);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.type).toBe('tackle');
    expect(event.team).toBe('away');
    expect(event.description).toContain('clean tackle');
    expect(event.resultingState.possession).toBe('away');
  });

  it('given a failed tackle when generating then possession is retained', () => {
    const gen = new TackleGenerator(() => 0.999);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.description).toContain('keeps possession');
    expect(event.resultingState.possession).toBe('home');
  });

  it('returns null when there is no defender to contest', () => {
    const state = makeState({ possession: 'home' });
    state.currentPlayers.away = state.currentPlayers.away.filter(p => p.position === 'GK' || p.position === 'ST');
    expect(new TackleGenerator(() => 0).generateEvent(state.currentPlayers.home[9], state)).toBeNull();
  });
});

// ── InterceptionGenerator ─────────────────────────────────────────────────────

describe('InterceptionGenerator:', () => {
  it('given outfield defenders when checking canPerform then it is allowed', () => {
    expect(new InterceptionGenerator().canPerform(makeState().currentPlayers.home[9], makeState())).toBe(true);
  });

  it('given a successful interception when generating then possession flips', () => {
    const gen = new InterceptionGenerator(() => 0);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.type).toBe('interception');
    expect(event.team).toBe('away');
    expect(event.resultingState.possession).toBe('away');
  });

  it('given a failed interception when generating then possession is unchanged', () => {
    const gen = new InterceptionGenerator(() => 0.999);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.description).toContain('fails to intercept');
    expect(event.resultingState.possession).toBe('home');
  });
});

// ── ShotGenerator ─────────────────────────────────────────────────────────────

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
    const event = gen.generateEvent(striker(), state)!;
    expect(event.type).toBe('shot');
    expect(event.description).toContain('shoots');
    const goal = event.chainedEvent!;
    expect(goal.type).toBe('goal');
    expect(goal.description).toContain('GOAL');
    expect(goal.resultingState.homeScore).toBe(1);
    expect(goal.resultingState.awayScore).toBe(0);
    // possession resets to the other team at the centre
    expect(goal.resultingState.possession).toBe('away');
    expect(goal.resultingState.ballPosition).toEqual({ zone: 'middle_third', side: 'center' });
  });

  it('given a saved shot when generating then a save chains and the score is unchanged', () => {
    const gen = new ShotGenerator(() => 0.999);
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const event = gen.generateEvent(striker(), state)!;
    const outcome = event.chainedEvent!;
    expect(outcome.type).toBe('save');
    expect(outcome.team).toBe('away');
    expect(outcome.description).toContain('save');
    expect(outcome.resultingState.homeScore).toBe(0);
  });

  it('scores the away team when they are in possession', () => {
    const gen = new ShotGenerator(() => 0);
    const state = makeState({ possession: 'away', ballPosition: { zone: 'away_box', side: 'center' } });
    const goal = gen.generateEvent(striker(), state)!.chainedEvent!;
    expect(goal.resultingState.awayScore).toBe(1);
    expect(goal.resultingState.homeScore).toBe(0);
  });
});

// ── calculateProbability formulas & zone modifiers ─────────────────────────────
// calculateProbability is public, so we assert exact values across zones/positions
// to pin the per-zone modifiers, coefficients and clamps.

describe('calculateProbability — zone & position modifiers:', () => {
  // The per-action base is now a parity-centred differential; the zone/position
  // modifiers still multiply on top, so we pin them via ratios to a reference
  // zone/position (base cancels) plus clamp checks — robust to balance tuning.
  it('DribbleGenerator scales by zone', () => {
    const gen = new DribbleGenerator();
    const p = player('p', 'LW', { speed: 30, technique: 30, agility: 30 });
    const prob = (zone: BallPosition['zone']) =>
      gen.calculateProbability(p, makeState({ ballPosition: { zone, side: 'center' } }));
    const base = prob('middle_third'); // zone modifier 1.0
    expect(prob('home_box')).toBeCloseTo(base * 0.6, 5);
    expect(prob('home_third')).toBeCloseTo(base * 0.8, 5);
    expect(prob('away_third')).toBeCloseTo(base * 1.2, 5);
    expect(prob('away_box')).toBeCloseTo(base * 1.1, 5);
  });

  it('DribbleGenerator clamps at 0.85 for a dominant dribbler', () => {
    const gen = new DribbleGenerator();
    const elite = player('p', 'LW', { speed: 99, technique: 99, agility: 99 });
    expect(gen.calculateProbability(elite, makeState({ ballPosition: { zone: 'away_third', side: 'center' } }))).toBe(0.85);
  });

  it('TackleGenerator scales by zone for the defending side', () => {
    const gen = new TackleGenerator();
    const p = player('d', 'CB', { defending: 50, awareness: 50, strength: 50 });
    const prob = (zone: BallPosition['zone'], possession: 'home' | 'away') =>
      gen.calculateProbability(p, makeState({ possession, ballPosition: { zone, side: 'center' } }));
    // possession home → defenders are 'away' → away-side modifiers (ratios to middle_third = 1.0)
    const base = prob('middle_third', 'home');
    expect(prob('away_box', 'home')).toBeCloseTo(base * 1.4, 5);
    expect(prob('away_third', 'home')).toBeCloseTo(base * 1.2, 5);
    expect(prob('home_third', 'home')).toBeCloseTo(base * 0.8, 5);
    expect(prob('home_box', 'home')).toBeCloseTo(base * 0.6, 5);
    // mirrored when the home team defends
    expect(prob('home_box', 'away')).toBeCloseTo(prob('away_box', 'home'), 5);
  });

  it('InterceptionGenerator scales by position and clamps at 0.4', () => {
    const gen = new InterceptionGenerator();
    const at = (pos: Position, awareness: number) =>
      gen.calculateProbability(player('p', pos, { awareness }), makeState());
    const cm = at('CM', 60); // position modifier 1.0
    expect(at('CB', 60)).toBeCloseTo(cm * 1.3, 5);
    expect(at('ST', 60)).toBeCloseTo(cm * 0.6, 5);
    // an elite reader clamps to 0.4
    const elite = gen.calculateProbability(player('p', 'CB', { awareness: 99, defending: 99, agility: 99 }), makeState());
    expect(elite).toBe(0.4);
  });

  it('ShotGenerator scales shot-taking by zone and clamps at 0.9', () => {
    const gen = new ShotGenerator();
    const striker = player('p', 'ST', { finishing: 60 });
    const box = gen.calculateProbability(striker, makeState({ ballPosition: { zone: 'away_box', side: 'center' } }));
    const third = gen.calculateProbability(striker, makeState({ ballPosition: { zone: 'away_third', side: 'center' } }));
    expect(box / third).toBeCloseTo(1.2 / 0.8, 5); // away_box 1.2 vs away_third 0.8
    expect(box).toBeLessThanOrEqual(0.9);
  });

  it('ShortPassGenerator applies the home-zone retention bonus', () => {
    const gen = new ShortPassGenerator();
    const p = player('p', 'CM', { passing: 40, technique: 40 });
    const homeBox = gen.calculateProbability(p, makeState({ ballPosition: { zone: 'home_box', side: 'center' } }));
    const awayBox = gen.calculateProbability(p, makeState({ ballPosition: { zone: 'away_box', side: 'center' } }));
    expect(homeBox / awayBox).toBeCloseTo(1.1 / 0.9, 5);
    expect(homeBox).toBeLessThanOrEqual(0.95);
  });
});

// ── boundary & branch top-up ───────────────────────────────────────────────────

describe('generator boundaries & branches:', () => {
  it('ShortPass treats rng exactly equal to the probability as a failure (strict <)', () => {
    const passer = player('p', 'CM', { passing: 80, technique: 60 });
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    const prob = new ShortPassGenerator().calculateProbability(passer, state); // exact float
    const event = new ShortPassGenerator(() => prob).generateEvent(passer, state)!; // rng === prob
    expect(event.description).toContain('intercepted');
    expect(event.resultingState.possession).toBe('away');
  });

  it('ShortPass success with the forward roll exactly at 0.3 does not advance (strict <)', () => {
    const passer = player('p', 'CM', { passing: 80, technique: 60 });
    const gen = new ShortPassGenerator(seq([0, 0.3])); // success, then moveForward roll === 0.3
    const event = gen.generateEvent(passer, makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } }))!;
    expect(event.resultingState.ballPosition.zone).toBe('middle_third');
  });

  it('ShortPass cannot advance past the final zone', () => {
    const passer = player('p', 'CM', { passing: 80, technique: 60 });
    const gen = new ShortPassGenerator(seq([0, 0])); // success + forward roll
    const event = gen.generateEvent(passer, makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } }))!;
    expect(event.resultingState.ballPosition.zone).toBe('away_box'); // clamped at the last zone
  });

  it('Dribble treats rng exactly equal to the probability as a failure', () => {
    const dribbler = player('p', 'LW', { speed: 90, technique: 90, agility: 90 });
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    const prob = new DribbleGenerator().calculateProbability(dribbler, state); // exact float
    const event = new DribbleGenerator(() => prob).generateEvent(dribbler, state)!; // rng === prob
    expect(event.description).toContain('loses the ball');
  });

  it('Dribble advancement roll exactly at 0.6 advances two zones (strict <)', () => {
    const dribbler = player('p', 'LW', { speed: 90, technique: 90, agility: 90 });
    // success roll, then advancement roll === 0.6 (0.6 < 0.6 is false → +2), then keep side
    const gen = new DribbleGenerator(seq([0, 0.6, 0]));
    const event = gen.generateEvent(dribbler, makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } }))!;
    expect(event.resultingState.ballPosition.zone).toBe('away_box'); // middle_third + 2
  });

  it('Dribble keeps the side when the side roll is below 0.5', () => {
    const dribbler = player('p', 'LW', { speed: 90, technique: 90, agility: 90 });
    // success, advancement +1, side roll 0 (< 0.5 → keep current side)
    const gen = new DribbleGenerator(seq([0, 0, 0]));
    const event = gen.generateEvent(dribbler, makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'left' } }))!;
    expect(event.resultingState.ballPosition.side).toBe('left');
  });

  it('Dribble moves a flank dribbler infield when the side roll is at least 0.5', () => {
    const dribbler = player('p', 'LW', { speed: 90, technique: 90, agility: 90 });
    // success, advancement +1, side roll 0.5 (≥ 0.5 → leaves the wing); left wing → center
    const gen = new DribbleGenerator(seq([0, 0, 0.5]));
    const event = gen.generateEvent(dribbler, makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'left' } }))!;
    expect(event.resultingState.ballPosition.side).toBe('center');
  });

  it('Dribble is disallowed outside the playing halves', () => {
    const dribbler = player('p', 'LW', { speed: 90, technique: 90, agility: 90 });
    expect(new DribbleGenerator().canPerform(dribbler, makeState({ phase: 'half_time' }))).toBe(false);
  });

  it('Dribble is allowed for any outfielder regardless of skill', () => {
    const lowSkill = player('p', 'LW', { speed: 30, technique: 30, agility: 30 });
    expect(new DribbleGenerator().canPerform(lowSkill, makeState())).toBe(true);
  });

  it('Tackle uses the home-side zone modifiers when the home team defends', () => {
    const gen = new TackleGenerator();
    const d = player('d', 'CB', { defending: 50, awareness: 50, strength: 50 });
    const prob = (zone: BallPosition['zone']) =>
      gen.calculateProbability(d, makeState({ possession: 'away', ballPosition: { zone, side: 'center' } }));
    const mid = prob('middle_third');
    expect(prob('home_third') / mid).toBeCloseTo(1.2, 5);
    expect(prob('away_third') / mid).toBeCloseTo(0.8, 5);
  });

  it('Shot save names the defending goalkeeper', () => {
    const gen = new ShotGenerator(() => 0.999); // forced save
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const gk = state.currentPlayers.away.find(p => p.position === 'GK')!;
    const save = gen.generateEvent(player('p', 'ST', { finishing: 90 }), state)!.chainedEvent!;
    expect(save.type).toBe('save');
    expect(save.playerId).toBe(gk.id);
  });

  it('Tackle, Interception and Shot are all disallowed outside the playing halves', () => {
    const defender = makeState().currentPlayers.home[1];
    const striker = player('p', 'ST', { finishing: 90 });
    const tackleState = makeState({ phase: 'half_time' });
    const shotState = makeState({ phase: 'half_time', ballPosition: { zone: 'away_box', side: 'center' } });
    expect(new TackleGenerator().canPerform(defender, tackleState)).toBe(false);
    expect(new InterceptionGenerator().canPerform(defender, tackleState)).toBe(false);
    expect(new ShotGenerator().canPerform(striker, shotState)).toBe(false);
  });

  it('Tackle treats the success roll exactly equal to the probability as a failure (strict <)', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    const tackler = state.currentPlayers.away[1]; // first defender pickRandom returns at rng 0 (cb1)
    const prob = new TackleGenerator().calculateProbability(tackler, state);
    // seq[0] feeds pickRandom (→ index 0 = cb1); seq[1] is the success roll.
    const fail = new TackleGenerator(seq([0, prob])).generateEvent(state.currentPlayers.home[9], state)!;
    expect(fail.resultingState.possession).toBe('home'); // prob < prob is false → not won
    const win = new TackleGenerator(seq([0, prob - 1e-9])).generateEvent(state.currentPlayers.home[9], state)!;
    expect(win.resultingState.possession).toBe('away');
  });

  it('Interception treats the success roll exactly equal to the probability as a failure (strict <)', () => {
    const state = makeState({ possession: 'home', ballPosition: { zone: 'middle_third', side: 'center' } });
    const interceptor = state.currentPlayers.away[1]; // index 0 of the non-GK candidates (cb1)
    const prob = new InterceptionGenerator().calculateProbability(interceptor, state);
    const fail = new InterceptionGenerator(seq([0, prob])).generateEvent(state.currentPlayers.home[9], state)!;
    expect(fail.resultingState.possession).toBe('home');
    const win = new InterceptionGenerator(seq([0, prob - 1e-9])).generateEvent(state.currentPlayers.home[9], state)!;
    expect(win.resultingState.possession).toBe('away');
  });
});

// ── Shot goal probability (conversion = finisher vs keeper, parity-centred) ─────
// conv  = clamp(0.02, 0.6, 0.11 + (finishing − gkSkill) / 220)
// goalProb = clamp(0.01, 0.6, conv · zoneMult · qFactor / cFactor)
// We mirror the production formula and probe either side of it so any coefficient/
// operator/clamp mutation shifts goalProb and flips the goal/save outcome.

describe('ShotGenerator goal probability:', () => {
  const EPS = 1e-6;
  const gkOf = (state: MatchState) => state.currentPlayers.away.find(p => p.position === 'GK')!;

  function goalProb(striker: Player, state: MatchState): number {
    const gkSkill = SkillCalculator.gkSaving(gkOf(state));
    const zoneMult = state.ballPosition.zone === 'away_box' ? 1.0 : 0.4;
    const atk = state.params?.[state.possession] ?? NEUTRAL_PARAMS;
    const def = state.params?.[state.possession === 'home' ? 'away' : 'home'] ?? NEUTRAL_PARAMS;
    const conv = Math.max(0.02, Math.min(0.6, 0.11 + (SkillCalculator.finishing(striker) - gkSkill) / 220));
    const qFactor = 0.7 + 0.6 * (atk.chanceQuality / 100);
    const cFactor = 0.5 + 1.0 * (def.defensiveCompactness / 100);
    return Math.max(0.01, Math.min(0.6, conv * zoneMult * qFactor / cFactor));
  }

  function outcome(striker: Player, state: MatchState, rng: number): string {
    return new ShotGenerator(() => rng).generateEvent(striker, state)!.chainedEvent!.type;
  }

  it('converts a shot when rng is just below the computed probability, saves just above', () => {
    const striker = player('p', 'ST', { finishing: 70, composure: 60, technique: 60 });
    const state = makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } });
    const g = goalProb(striker, state);
    expect(g).toBeGreaterThan(0.01);
    expect(g).toBeLessThan(0.6);
    expect(outcome(striker, state, g - EPS)).toBe('goal');
    expect(outcome(striker, state, g + EPS)).toBe('save');
    expect(outcome(striker, state, g)).toBe('save'); // strict <
  });

  it('applies the lower away_third zone multiplier (0.4 not 1.0)', () => {
    const striker = player('p', 'ST', { finishing: 70, composure: 60, technique: 60 });
    const box = goalProb(striker, makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } }));
    const third = goalProb(striker, makeState({ possession: 'home', ballPosition: { zone: 'away_third', side: 'center' } }));
    expect(third).toBeCloseTo(box * 0.4, 5);
  });

  it('converts better as the finisher-vs-keeper gap widens', () => {
    const stateVsThisGk = (finishing: number) =>
      goalProb(player('p', 'ST', { finishing }), makeState({ possession: 'home', ballPosition: { zone: 'away_box', side: 'center' } }));
    expect(stateVsThisGk(95)).toBeGreaterThan(stateVsThisGk(30));
  });

  it('caps goal probability at 0.6 for a total mismatch', () => {
    const striker = player('p', 'ST', { finishing: 99, composure: 99, technique: 99 });
    // weak keeper (default-0 GK in a stripped away side) + max chance quality + zero compactness
    const away = team('away');
    away.starters = away.starters.map(p => p.position === 'GK' ? player('away-gk', 'GK', {}) : p);
    const params = {
      home: { ...NEUTRAL_PARAMS, chanceQuality: 100 },
      away: { ...NEUTRAL_PARAMS, defensiveCompactness: 0 },
    };
    const state = makeState({
      possession: 'home', awayTeam: away,
      currentPlayers: { home: team('home').starters, away: away.starters },
      ballPosition: { zone: 'away_box', side: 'center' }, params,
    });
    expect(goalProb(striker, state)).toBe(0.6);
  });
});
