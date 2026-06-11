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
  const cases: Array<{
    name: string;
    calc: (p: Player) => number;
    pos: Position;
    a: Partial<PlayerAttributes>;
    expected: number;
  }> = [
    { name: 'dribbling = speed*0.3 + technique*0.4 + agility*0.3',
      calc: p => SkillCalculator.dribbling(p), pos: 'ST',
      a: { speed: 100, technique: 100, agility: 100 }, expected: 100 },
    { name: 'dribbling isolates the technique coefficient',
      calc: p => SkillCalculator.dribbling(p), pos: 'ST',
      a: { technique: 100 }, expected: 40 },
    { name: 'finishing = finishing*0.7 + composure*0.2 + technique*0.1',
      calc: p => SkillCalculator.finishing(p), pos: 'ST',
      a: { finishing: 100 }, expected: 70 },
    { name: 'heading = finishing*0.4 + agility*0.3 + strength*0.3',
      calc: p => SkillCalculator.heading(p), pos: 'ST',
      a: { strength: 100 }, expected: 30 },
    { name: 'penalties = finishing*0.6 + composure*0.3 + technique*0.1',
      calc: p => SkillCalculator.penalties(p), pos: 'ST',
      a: { composure: 100 }, expected: 30 },
    { name: 'throughBall = awareness*0.4 + passing*0.5 + technique*0.1',
      calc: p => SkillCalculator.throughBall(p), pos: 'CM',
      a: { passing: 100 }, expected: 50 },
    { name: 'longShot = finishing*0.5 + technique*0.3 + composure*0.2',
      calc: p => SkillCalculator.longShot(p), pos: 'ST',
      a: { finishing: 100 }, expected: 50 },
    { name: 'crossing = passing*0.6 + technique*0.3 + awareness*0.1',
      calc: p => SkillCalculator.crossing(p), pos: 'LM',
      a: { passing: 100 }, expected: 60 },
    { name: 'tackling = defending*0.6 + awareness*0.2 + strength*0.2',
      calc: p => SkillCalculator.tackling(p), pos: 'CB',
      a: { defending: 100 }, expected: 60 },
    { name: 'interception = awareness*0.5 + defending*0.3 + agility*0.2',
      calc: p => SkillCalculator.interception(p), pos: 'CB',
      a: { awareness: 100 }, expected: 50 },
    { name: 'gkSaving = agility*0.5 + composure*0.3 + awareness*0.2',
      calc: p => SkillCalculator.gkSaving(p), pos: 'GK',
      a: { agility: 100 }, expected: 50 },
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

// ── ShortPassGenerator ────────────────────────────────────────────────────────

describe('ShortPassGenerator:', () => {
  const gen = new ShortPassGenerator();
  const passer = () => player('p', 'CM', { passing: 80, technique: 60 });

  it('given an active half when checking canPerform then it is allowed', () => {
    expect(gen.canPerform(passer(), makeState({ phase: 'first_half' }))).toBe(true);
    expect(gen.canPerform(passer(), makeState({ phase: 'second_half' }))).toBe(true);
  });

  it('given a non-play phase when checking canPerform then it is disallowed', () => {
    expect(gen.canPerform(passer(), makeState({ phase: 'half_time' }))).toBe(false);
  });

  it('given a successful roll when generating then possession is kept', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(passer(), state)!;
    expect(event.type).toBe('short_pass');
    expect(event.team).toBe('home');
    expect(event.description).toContain('completes a short pass');
    expect(event.resultingState.possession).toBe('home');
    spy.mockRestore();
  });

  it('given a failed roll when generating then possession turns over', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(passer(), state)!;
    expect(event.description).toContain('intercepted');
    expect(event.resultingState.possession).toBe('away');
    spy.mockRestore();
  });
});

// ── DribbleGenerator ──────────────────────────────────────────────────────────

describe('DribbleGenerator:', () => {
  const gen = new DribbleGenerator();
  const dribbler = () => player('p', 'LW', { speed: 90, technique: 90, agility: 90 });

  it('given a skilful outfielder when checking canPerform then it is allowed', () => {
    expect(gen.canPerform(dribbler(), makeState())).toBe(true);
  });

  it('given a goalkeeper when checking canPerform then it is never allowed', () => {
    const gk = player('gk', 'GK', { speed: 90, technique: 90, agility: 90 });
    expect(gen.canPerform(gk, makeState())).toBe(false);
  });

  it('given low dribbling skill when checking canPerform then it is disallowed', () => {
    const clumsy = player('p', 'CB', { speed: 10, technique: 10, agility: 10 });
    expect(gen.canPerform(clumsy, makeState())).toBe(false);
  });

  it('given a failed roll when generating then the ball is lost', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const event = gen.generateEvent(dribbler(), makeState({ possession: 'home' }))!;
    expect(event.type).toBe('dribble');
    expect(event.description).toContain('loses the ball');
    expect(event.resultingState.possession).toBe('away');
    spy.mockRestore();
  });
});

// ── TackleGenerator ───────────────────────────────────────────────────────────

describe('TackleGenerator:', () => {
  const gen = new TackleGenerator();

  it('given no defenders when checking canPerform then it is disallowed', () => {
    const state = makeState();
    state.currentPlayers.away = state.currentPlayers.away.filter(
      p => !['CB', 'LB', 'RB', 'CDM'].includes(p.position),
    );
    expect(gen.canPerform(state.currentPlayers.home[0], state)).toBe(false);
  });

  it('given a successful tackle when generating then possession flips to the defenders', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.type).toBe('tackle');
    expect(event.team).toBe('away');
    expect(event.description).toContain('clean tackle');
    expect(event.resultingState.possession).toBe('away');
    spy.mockRestore();
  });

  it('given a failed tackle when generating then possession is retained', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.description).toContain('keeps possession');
    expect(event.resultingState.possession).toBe('home');
    spy.mockRestore();
  });
});

// ── InterceptionGenerator ─────────────────────────────────────────────────────

describe('InterceptionGenerator:', () => {
  const gen = new InterceptionGenerator();

  it('given outfield defenders when checking canPerform then it is allowed', () => {
    expect(gen.canPerform(makeState().currentPlayers.home[9], makeState())).toBe(true);
  });

  it('given a successful interception when generating then possession flips', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState({ possession: 'home' });
    const event = gen.generateEvent(state.currentPlayers.home[9], state)!;
    expect(event.type).toBe('interception');
    expect(event.team).toBe('away');
    expect(event.resultingState.possession).toBe('away');
    spy.mockRestore();
  });
});

// ── ShotGenerator ─────────────────────────────────────────────────────────────

describe('ShotGenerator:', () => {
  const gen = new ShotGenerator();
  const striker = () => player('p', 'ST', { finishing: 90, composure: 80, technique: 70 });

  it('given the ball in the attacking box when checking canPerform then it is allowed', () => {
    const state = makeState({ ballPosition: { zone: 'away_box', side: 'center' } });
    expect(gen.canPerform(striker(), state)).toBe(true);
  });

  it('given the ball in midfield when checking canPerform then it is disallowed', () => {
    const state = makeState({ ballPosition: { zone: 'middle_third', side: 'center' } });
    expect(gen.canPerform(striker(), state)).toBe(false);
  });

  it('given a converted shot when generating then a goal chains and the score increments', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState({
      possession: 'home',
      ballPosition: { zone: 'away_box', side: 'center' },
    });
    const event = gen.generateEvent(striker(), state)!;
    expect(event.type).toBe('shot');
    expect(event.description).toContain('shoots');
    const goal = event.chainedEvent!;
    expect(goal.type).toBe('goal');
    expect(goal.resultingState.homeScore).toBe(1);
    expect(goal.resultingState.awayScore).toBe(0);
    spy.mockRestore();
  });

  it('given a saved shot when generating then a save chains and the score is unchanged', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState({
      possession: 'home',
      ballPosition: { zone: 'away_box', side: 'center' },
    });
    const event = gen.generateEvent(striker(), state)!;
    const outcome = event.chainedEvent!;
    expect(outcome.type).toBe('save');
    expect(outcome.team).toBe('away');
    expect(outcome.resultingState.homeScore).toBe(0);
    spy.mockRestore();
  });
});
