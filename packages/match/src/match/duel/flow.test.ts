import type { Player } from '../../shared/types.ts';
import { NEUTRAL_PARAMS } from '../../tactics/match-parameters.ts';
import { CLEAN_ESCAPE_MARGIN } from './duels.ts';
import type { XY } from './field.ts';
import {
  attackY, goalPoint, carryForward, localNumbers,
  situationWeights, chooseSituation, resolveSituation, resolveLooseBall, flowTick,
  SHOT_RANGE_Y, CARRY_DISTANCE,
  type FlowTeam, type Situation,
} from './flow.ts';

const player = (id: string, attrs: Partial<Player['attributes']> = {}): Player => ({
  id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70,
  attributes: {
    speed: 50, strength: 50, stamina: 50, passing: 50,
    technique: 50, finishing: 50, defending: 50, goalkeeping: 10,
    ...attrs,
  },
});

interface TeamSpec {
  side: 'home' | 'away';
  players: Array<{ id: string; pos: XY; attrs?: Partial<Player['attributes']> }>;
  gkId?: string | null;
}

const team = (spec: TeamSpec): FlowTeam => ({
  side: spec.side,
  players: spec.players.map(p => player(p.id, p.attrs)),
  positions: Object.fromEntries(spec.players.map(p => [p.id, { ...p.pos }])),
  params: NEUTRAL_PARAMS,
  momentum: 0,
  gkId: spec.gkId ?? null,
});

const rngOf = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('frame helpers:', () => {
  it('attackY is 0 at the own goal line for both sides', () => {
    expect(attackY({ x: 0.5, y: 0 }, 'home')).toBe(0);
    expect(attackY({ x: 0.5, y: 1 }, 'away')).toBe(0);
    expect(attackY({ x: 0.5, y: 0.8 }, 'home')).toBeCloseTo(0.8, 10);
  });

  it('carryForward moves toward the attacked goal and clamps at it', () => {
    expect(goalPoint('home')).toEqual({ x: 0.5, y: 1 });
    const next = carryForward({ x: 0.5, y: 0.5 }, 'home', 0.1);
    expect(next.y).toBeCloseTo(0.6, 10);
    const clamped = carryForward({ x: 0.5, y: 0.99 }, 'home', 0.5);
    expect(clamped.y).toBeCloseTo(1, 10);
  });
});

describe('situation chooser:', () => {
  const local = { secondDefenderPenalty: 0, passTargetBonus: 0, spareMan: 0 };

  it('shots only appear inside shot range; crosses only wide and advanced', () => {
    const t = team({ side: 'home', players: [{ id: 'c', pos: { x: 0.5, y: 0.5 } }] });
    const deep = situationWeights(t.players[0], { x: 0.5, y: 0.5 }, t, local);
    expect(deep.shot).toBe(0);
    expect(deep.cross).toBe(0);
    const inRange = situationWeights(t.players[0], { x: 0.5, y: SHOT_RANGE_Y + 0.1 }, t, local);
    expect(inRange.shot).toBeGreaterThan(0);
    const wide = situationWeights(t.players[0], { x: 0.1, y: 0.8 }, t, local);
    expect(wide.cross).toBeGreaterThan(0);
  });

  it('an outnumbered deep carrier gets shield and clear options', () => {
    const t = team({ side: 'home', players: [{ id: 'c', pos: { x: 0.5, y: 0.1 } }] });
    const crowded = { secondDefenderPenalty: 0.15, passTargetBonus: 0, spareMan: 0 };
    const w = situationWeights(t.players[0], { x: 0.5, y: 0.1 }, t, crowded);
    expect(w.shield).toBeGreaterThan(0);
    expect(w.clear).toBeGreaterThan(0);
    const calm = situationWeights(t.players[0], { x: 0.5, y: 0.1 }, t, local);
    expect(calm.shield).toBe(0);
    expect(calm.clear).toBe(0);
  });

  it('chooseSituation picks by cumulative weight with one draw', () => {
    const weights = { short_pass: 1, dribble: 1 } as Record<Situation, number>;
    expect(chooseSituation(weights, rngOf(0.25))).toBe('short_pass');
    expect(chooseSituation(weights, rngOf(0.75))).toBe('dribble');
  });
});

describe('local numbers:', () => {
  it('extra defenders around the ball penalise the attacker; a thin back band flips the spare man', () => {
    const attacking = team({ side: 'home', players: [{ id: 'a', pos: { x: 0.5, y: 0.5 } }] });
    const packed = team({
      side: 'away',
      players: [
        { id: 'd1', pos: { x: 0.5, y: 0.5 } },
        { id: 'd2', pos: { x: 0.5, y: 0.5 } },
        { id: 'd3', pos: { x: 0.5, y: 0.5 } },
      ],
    });
    const local = localNumbers(attacking, packed, { x: 0.5, y: 0.5 });
    expect(local.secondDefenderPenalty).toBeGreaterThan(0);
    // Away defends band 4 (y near 1): nobody home → negative spare man once attackers get there.
    const highAttack = team({ side: 'home', players: [{ id: 'a', pos: { x: 0.5, y: 0.9 } }] });
    expect(localNumbers(highAttack, packed, { x: 0.5, y: 0.9 }).spareMan).toBeLessThan(0);
  });
});

describe('short pass chain:', () => {
  const setup = () => ({
    attacking: team({
      side: 'home',
      players: [
        { id: 'carrier', pos: { x: 0.5, y: 0.4 }, attrs: { passing: 60 } },
        { id: 'mate', pos: { x: 0.5, y: 0.55 } },
      ],
    }),
    defending: team({
      side: 'away',
      players: [{ id: 'reader', pos: { x: 0.45, y: 0.5 }, attrs: { defending: 60 } }],
      gkId: null,
    }),
  });

  it('a won pass duel moves the ball to the receiver', () => {
    const { attacking, defending } = setup();
    const out = resolveSituation('short_pass', attacking, defending, 'carrier', rngOf(0.1));
    expect(out.ball).toEqual({ mode: 'carried', side: 'home', carrierId: 'mate' });
    const pass = out.events.find(e => e.type === 'short_pass')!;
    expect(pass.playerId).toBe('carrier');
    expect(pass.metadata?.receiverId).toBe('mate');
    expect(pass.metadata?.duel.duelType).toBe('pass');
  });

  it('a lost pass duel is an interception carrying the stats metadata', () => {
    const { attacking, defending } = setup();
    const out = resolveSituation('short_pass', attacking, defending, 'carrier', rngOf(0.99));
    expect(out.ball).toEqual({ mode: 'carried', side: 'away', carrierId: 'reader' });
    const pick = out.events.find(e => e.type === 'interception')!;
    expect(pick.team).toBe('away');
    expect(pick.metadata).toMatchObject({
      contestedAction: 'short_pass', attackingTeam: 'home', attackerId: 'carrier',
    });
  });
});

describe('dribble chain:', () => {
  const setup = (attrs: Partial<Player['attributes']> = {}) => ({
    attacking: team({
      side: 'home',
      players: [{ id: 'carrier', pos: { x: 0.5, y: 0.5 }, attrs: { technique: 70, ...attrs } }],
    }),
    defending: team({
      side: 'away',
      players: [{ id: 'marker', pos: { x: 0.5, y: 0.55 } }],
    }),
  });

  it('a clean win carries the ball forward past the beaten defender', () => {
    const { attacking, defending } = setup();
    // duel roll 0.01 (big win, no escalation), foul roll 0.99 (no foul)
    const out = resolveSituation('dribble', attacking, defending, 'carrier', rngOf(0.01, 0.99));
    expect(out.ball).toEqual({ mode: 'carried', side: 'home', carrierId: 'carrier' });
    expect(attacking.positions.carrier.y).toBeCloseTo(0.5 + CARRY_DISTANCE * (0.5 / Math.hypot(0, 0.5)), 1);
    expect(out.events.find(e => e.type === 'dribble')?.metadata?.duel.duelType).toBe('dribble');
  });

  it('a narrow win escalates into a strength duel the defender can still win', () => {
    const { attacking, defending } = setup();
    const chance = 0.44 + 20 / 65; // technique 70 vs defending 50
    // dribble roll = narrow win; no foul (0.99); strength roll lost (0.99)
    const out = resolveSituation('dribble', attacking, defending, 'carrier',
      rngOf(chance - CLEAN_ESCAPE_MARGIN / 2, 0.99, 0.99));
    expect(out.ball).toEqual({ mode: 'carried', side: 'away', carrierId: 'marker' });
    expect(out.events.find(e => e.type === 'tackle')?.metadata?.contestedAction).toBe('dribble');
  });

  it('a big win with a lunging defender becomes a foul and a free kick', () => {
    const { attacking, defending } = setup({ technique: 95 });
    // dribble roll 0.01 → margin ≈ 0.87 clamped chance 0.9 → foul chance capped 0.3; foul roll 0.05 → foul
    // then card roll (red: margin>0.45, roll 0.99 no red... margin 0.89 > 0.45 so red roll first) → 0.99 no red, yellow roll 0.99 no card
    const out = resolveSituation('dribble', attacking, defending, 'carrier', rngOf(0.01, 0.05, 0.99, 0.99));
    expect(out.events.some(e => e.type === 'foul' && e.playerId === 'marker')).toBe(true);
    expect(out.events.some(e => e.type === 'free_kick')).toBe(true);
    const foul = out.events.find(e => e.type === 'foul')!;
    expect(foul.metadata?.attackerId).toBe('carrier'); // fouled player, for the injury system
  });
});

describe('through ball chain:', () => {
  it('a clean race win puts the runner through and moves them toward goal', () => {
    const attacking = team({
      side: 'home',
      players: [
        { id: 'carrier', pos: { x: 0.5, y: 0.5 }, attrs: { passing: 80 } },
        { id: 'runner', pos: { x: 0.5, y: 0.7 }, attrs: { speed: 90 } },
      ],
    });
    const defending = team({
      side: 'away',
      players: [{ id: 'cover', pos: { x: 0.5, y: 0.75 }, attrs: { speed: 40 } }],
    });
    // delivery roll 0.1 (good), speed duel roll 0.01 (clean escape)
    const out = resolveSituation('through_ball', attacking, defending, 'carrier', rngOf(0.1, 0.01));
    expect(out.ball).toEqual({ mode: 'carried', side: 'home', carrierId: 'runner' });
    expect(attackY(attacking.positions.runner, 'home')).toBeGreaterThan(0.7);
    const tb = out.events.find(e => e.type === 'through_ball')!;
    expect(tb.metadata?.receiverId).toBe('runner'); // injury-system contract
  });

  it('a lost race is an interception credited to the covering defender', () => {
    const attacking = team({
      side: 'home',
      players: [
        { id: 'carrier', pos: { x: 0.5, y: 0.5 } },
        { id: 'runner', pos: { x: 0.5, y: 0.7 } },
      ],
    });
    const defending = team({
      side: 'away',
      players: [{ id: 'cover', pos: { x: 0.5, y: 0.75 }, attrs: { speed: 90 } }],
    });
    const out = resolveSituation('through_ball', attacking, defending, 'carrier', rngOf(0.1, 0.99));
    expect(out.ball.mode).toBe('carried');
    expect((out.ball as any).side).toBe('away');
    expect(out.events.find(e => e.type === 'interception')?.metadata?.contestedAction).toBe('through_ball');
  });
});

describe('shot chain:', () => {
  const setup = () => ({
    attacking: team({
      side: 'home',
      players: [{ id: 'striker', pos: { x: 0.5, y: 0.85 }, attrs: { finishing: 70 } }],
    }),
    defending: team({
      side: 'away',
      players: [{ id: 'gk', pos: { x: 0.5, y: 0.96 }, attrs: { goalkeeping: 60 } }],
      gkId: 'gk',
    }),
  });

  it('a converted shot emits shot + goal and restarts with a kickoff for the conceders', () => {
    const { attacking, defending } = setup();
    const out = resolveSituation('shot', attacking, defending, 'striker', rngOf(0.01));
    expect(out.goal).toBe('home');
    expect(out.events.map(e => e.type)).toEqual(['shot', 'goal']);
    expect(out.ball).toEqual({ mode: 'carried', side: 'away', carrierId: 'gk' });
  });

  it('a saved shot credits the keeper (shots-on-target contract)', () => {
    const { attacking, defending } = setup();
    // shot roll just above the chance → save; corner roll 0.9 → no corner
    const out = resolveSituation('shot', attacking, defending, 'striker', rngOf(0.3, 0.9));
    expect(out.goal).toBeUndefined();
    expect(out.events.map(e => e.type)).toEqual(['shot', 'save']);
    expect(out.events[1].playerId).toBe('gk');
    expect(out.ball).toEqual({ mode: 'carried', side: 'away', carrierId: 'gk' });
  });

  it('a scrambled save can concede a corner, which chains a set-piece delivery', () => {
    const { attacking, defending } = setup();
    // shot saved (0.3), corner roll 0.05 → corner; delivery roll 0.99 (poor, margin < -0.25 → loose)
    const out = resolveSituation('shot', attacking, defending, 'striker', rngOf(0.3, 0.05, 0.99));
    expect(out.events.some(e => e.type === 'corner')).toBe(true);
  });
});

describe('loose ball:', () => {
  it('the nearer, faster player wins the race and picks up at the spot', () => {
    const home = team({ side: 'home', players: [{ id: 'h', pos: { x: 0.4, y: 0.5 }, attrs: { speed: 80 } }] });
    const away = team({ side: 'away', players: [{ id: 'a', pos: { x: 0.9, y: 0.9 }, attrs: { speed: 40 } }] });
    const out = resolveLooseBall({ attacking: home, defending: away, rng: rngOf(0.01), events: [] }, { x: 0.45, y: 0.5 });
    expect(out.ball).toEqual({ mode: 'carried', side: 'home', carrierId: 'h' });
    expect(home.positions.h).toEqual({ x: 0.45, y: 0.5 });
  });

  it('a narrow race win escalates to strength, which the other side can take', () => {
    const home = team({ side: 'home', players: [{ id: 'h', pos: { x: 0.5, y: 0.45 }, attrs: { strength: 30 } }] });
    const away = team({ side: 'away', players: [{ id: 'a', pos: { x: 0.5, y: 0.55 }, attrs: { strength: 80 } }] });
    // equidistant → no head start; speed roll = narrow home win; strength roll lost
    const out = resolveLooseBall(
      { attacking: home, defending: away, rng: rngOf(0.5 - CLEAN_ESCAPE_MARGIN / 2, 0.9), events: [] },
      { x: 0.5, y: 0.5 },
    );
    expect(out.ball).toEqual({ mode: 'carried', side: 'away', carrierId: 'a' });
  });
});

describe('flowTick:', () => {
  it('a free ball resolves as a pickup race', () => {
    const home = team({ side: 'home', players: [{ id: 'h', pos: { x: 0.5, y: 0.5 } }] });
    const away = team({ side: 'away', players: [{ id: 'a', pos: { x: 0.9, y: 0.9 } }] });
    const out = flowTick(home, away, { mode: 'free', at: { x: 0.5, y: 0.5 } }, rngOf(0.4));
    expect(out.ball.mode).toBe('carried');
  });

  it('a keeper in possession distributes rather than dribbling', () => {
    const home = team({
      side: 'home',
      players: [
        { id: 'gk', pos: { x: 0.5, y: 0.04 }, attrs: { goalkeeping: 70 } },
        { id: 'cb', pos: { x: 0.5, y: 0.2 } },
      ],
      gkId: 'gk',
    });
    const away = team({ side: 'away', players: [{ id: 'st', pos: { x: 0.5, y: 0.3 } }] });
    // distribution roll 0.9 → short pass branch; pass duel roll 0.1 → completed
    const out = flowTick(home, away, { mode: 'carried', side: 'home', carrierId: 'gk' }, rngOf(0.9, 0.1));
    expect(out.events[0].type).toBe('short_pass');
    expect(out.ball).toEqual({ mode: 'carried', side: 'home', carrierId: 'cb' });
  });

  it('a vanished carrier (sub/red card) turns the ball loose', () => {
    const home = team({ side: 'home', players: [{ id: 'h', pos: { x: 0.5, y: 0.5 } }] });
    const away = team({ side: 'away', players: [{ id: 'a', pos: { x: 0.6, y: 0.5 } }] });
    const out = flowTick(home, away, { mode: 'carried', side: 'home', carrierId: 'gone' }, rngOf(0.5, 0.5));
    expect(out.ball.mode).toBe('carried'); // someone picked it up
  });
});

describe('last-man professional foul:', () => {
  // Runner speed 99 vs cover 1: race chance 0.5 + 98/900 ≈ 0.609 plus the delivery
  // bonus (0.06 here) and possibly the spare-man bonus (0.08) — rolls below are
  // chosen so the margin band holds whether or not the spare-man bonus applies.
  const setup = () => ({
    attacking: team({
      side: 'home',
      players: [
        { id: 'carrier', pos: { x: 0.5, y: 0.55 } },
        { id: 'runner', pos: { x: 0.5, y: 0.9 }, attrs: { speed: 99 } },
      ],
    }),
    defending: team({
      side: 'away',
      players: [{ id: 'cover', pos: { x: 0.5, y: 0.92 }, attrs: { speed: 1 } }],
    }),
  });

  it('a beaten last man can haul the runner down: red card and a penalty', () => {
    const { attacking, defending } = setup();
    // delivery 0.2 (on target, margin 0.3), race 0.42 → margin 0.25–0.33 (no
    // escalation, reachable), pro-foul roll 0.1 → foul, red roll 0.05 → red;
    // in the box → penalty, roll (cycled 0.2) → goal
    const out = resolveSituation('through_ball', attacking, defending, 'carrier',
      rngOf(0.2, 0.42, 0.1, 0.05));
    const foul = out.events.find(e => e.type === 'foul');
    expect(foul?.playerId).toBe('cover');
    expect(foul?.metadata?.duel.duelType).toBe('speed');
    expect(out.events.some(e => e.type === 'red_card' && e.playerId === 'cover')).toBe(true);
    expect(out.events.some(e => e.type === 'penalty')).toBe(true);
    expect(out.goal).toBe('home');
  });

  it('a runner clear beyond reach is simply through — no foul roll', () => {
    const { attacking, defending } = setup();
    // delivery 0.2, race 0.1 → margin ≥ 0.47 > PRO_FOUL_REACH: clean escape
    const out = resolveSituation('through_ball', attacking, defending, 'carrier', rngOf(0.2, 0.1));
    expect(out.events.some(e => e.type === 'foul')).toBe(false);
    expect(out.ball).toEqual({ mode: 'carried', side: 'home', carrierId: 'runner' });
  });
});

describe('throw-ins:', () => {
  const setup = (throwerStrength: number) => ({
    attacking: team({
      side: 'home',
      players: [
        { id: 'carrier', pos: { x: 0.03, y: 0.8 } },
        { id: 'giant', pos: { x: 0.4, y: 0.8 }, attrs: { strength: throwerStrength } },
      ],
    }),
    defending: team({
      side: 'away',
      players: [{ id: 'marker', pos: { x: 0.06, y: 0.8 }, attrs: { defending: 70 } }],
    }),
  });

  it('a strong taker in the final third launches a long throw into the box', () => {
    const { attacking, defending } = setup(80);
    // dribble 0.5 → tackled out; go-long gate 0.1 < longThrowChance(80)=0.25;
    // delivery (Strength 80 vs anchor 80 → 0.5) 0.3 → on target, margin 0.2;
    // box strength duel 0.2 → target wins → header shot 0.9 → off target
    const out = resolveSituation('dribble', attacking, defending, 'carrier',
      rngOf(0.5, 0.1, 0.3, 0.2, 0.9));
    const throwIn = out.events.find(e => e.type === 'throw_in');
    expect(throwIn?.playerId).toBe('giant');
    expect(throwIn?.description).toContain('long throw');
    expect(out.events.some(e => e.type === 'shot')).toBe(true);
  });

  it('without a strong enough taker the throw stays a quick restart', () => {
    const { attacking, defending } = setup(60);
    const out = resolveSituation('dribble', attacking, defending, 'carrier', rngOf(0.5));
    const throwIn = out.events.find(e => e.type === 'throw_in');
    expect(throwIn?.description).toContain('takes it quickly');
    expect(out.ball.mode).toBe('carried');
  });
});
