import {
  checkChance, opposedCheck, visionCheck, engagementChance, firstTouchCheck,
  VISION_SPECS, FIRST_TOUCH_SPEC, SECOND_DEFENDER_FACTOR,
} from './skill-checks.ts';
import { MatchSimulator } from './match-simulator.ts';
import { ActionSelector } from './action-selector.ts';
import { ThroughBallGenerator } from './action-generators.ts';
import { NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
import { mulberry32 } from './distribution.ts';
import { createTestTeam } from './test-fixtures.ts';
import type { Team } from '../shared/types.ts';
import type { MatchState } from './types.ts';

describe('checkChance:', () => {
  const spec = { parity: 0.5, spread: 100, lo: 0.1, hi: 0.9 };

  test('equal skill lands exactly on parity', () => {
    expect(checkChance(70, 70, spec)).toBe(0.5);
  });

  test('skill difference shifts by diff/spread', () => {
    expect(checkChance(80, 70, spec)).toBeCloseTo(0.6);
    expect(checkChance(60, 70, spec)).toBeCloseTo(0.4);
  });

  test('clamps at lo and hi', () => {
    expect(checkChance(99, 1, spec)).toBe(0.9);
    expect(checkChance(1, 99, spec)).toBe(0.1);
  });

  test('opposedCheck consumes one draw and follows the chance', () => {
    expect(opposedCheck(70, 70, spec, () => 0.49)).toBe(true);
    expect(opposedCheck(70, 70, spec, () => 0.51)).toBe(false);
  });
});

describe('visionCheck:', () => {
  test('through balls are harder to see than long balls', () => {
    expect(VISION_SPECS.through_ball.parity).toBeLessThan(VISION_SPECS.long_pass.parity);
  });

  test('awareness raises the chance of seeing the killer ball', () => {
    const seen = (awareness: number) => {
      const rng = mulberry32(7);
      let n = 0;
      for (let i = 0; i < 1000; i++) { if (visionCheck(awareness, 'through_ball', rng)) { n++; } }
      return n;
    };
    expect(seen(90)).toBeGreaterThan(seen(50));
    expect(seen(50)).toBeGreaterThan(seen(20));
  });
});

describe('engagementChance:', () => {
  test('press intensity raises it; the defending box raises it further', () => {
    expect(engagementChance(90, 'middle_third')).toBeGreaterThan(engagementChance(30, 'middle_third'));
    expect(engagementChance(50, 'away_box')).toBeGreaterThan(engagementChance(50, 'middle_third'));
    expect(engagementChance(50, 'home_box')).toBeLessThan(engagementChance(50, 'middle_third'));
  });

  test('stays within [0, 0.6]', () => {
    expect(engagementChance(0, 'home_box')).toBeGreaterThanOrEqual(0);
    expect(engagementChance(100, 'away_box')).toBeLessThanOrEqual(0.6);
  });

  test('the second defender checks at a reduced factor', () => {
    expect(SECOND_DEFENDER_FACTOR).toBeLessThan(1);
    expect(SECOND_DEFENDER_FACTOR).toBeGreaterThan(0);
  });
});

describe('firstTouchCheck:', () => {
  test('a clean technician controls it more often than a clogger', () => {
    const controls = (skill: number) => {
      const rng = mulberry32(11);
      let n = 0;
      for (let i = 0; i < 1000; i++) { if (firstTouchCheck(skill, 60, rng)) { n++; } }
      return n;
    };
    expect(controls(90)).toBeGreaterThan(controls(30));
    // even at parity most touches are clean — the pass is only "risky", not a coin flip
    expect(FIRST_TOUCH_SPEC.parity).toBeGreaterThan(0.75);
  });
});

// ── pipeline-level assertions ──────────────────────────────────────────────────

function withAwareness(team: Team, awareness: number): Team {
  return {
    ...team,
    squad: team.squad.map(p => ({ ...p, attributes: { ...p.attributes, awareness } })),
  };
}

/** A mid-pitch MatchState where the only registered option is the through ball —
 *  isolates the vision gate from decision-quality effects (which also read awareness). */
function throughBallOnlyAttempts(awareness: number, n: number): number {
  const home = withAwareness(createTestTeam('home', 'Home', '4-4-2', { idPrefix: 'h-' }), awareness);
  const away = createTestTeam('away', 'Away', '4-4-2', { idPrefix: 'a-' });
  const rng = mulberry32(31);
  const selector = new ActionSelector(rng);
  selector.registerAction('through_ball', new ThroughBallGenerator(rng));
  const state: MatchState = {
    minute: 30, homeScore: 0, awayScore: 0, possession: 'home',
    ballPosition: { zone: 'middle_third', side: 'center' }, phase: 'first_half',
    homeTeam: home, awayTeam: away,
    currentPlayers: { home: home.squad, away: away.squad },
    bookings: { yellow: [], red: [] },
  };
  let produced = 0;
  for (let i = 0; i < n; i++) {
    if (selector.selectPlayerAction(state)) { produced++; }
  }
  return produced;
}

describe('perception stage (integration):', () => {
  test('with the through ball as the only option, awareness gates how often it is even attempted', () => {
    const sharp = throughBallOnlyAttempts(90, 400);
    const blind = throughBallOnlyAttempts(20, 400);
    expect(sharp).toBeGreaterThan(blind * 1.3);
  });
});

describe('receiver stage (integration):', () => {
  test('a seeded season sample produces some loose first touches off through balls', () => {
    let loose = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const home = createTestTeam('home', 'Home', '4-4-2', { idPrefix: 'h-' });
      const away = createTestTeam('away', 'Away', '4-4-2', { idPrefix: 'a-' });
      const sim = new MatchSimulator({
        matchDuration: 90, eventsPerMinute: 3,
        homeTeam: home, awayTeam: away,
        homeStarters: home.squad, awayStarters: away.squad,
        rng: mulberry32(seed),
      });
      loose += sim.simulate().events.filter(e => e.metadata?.looseTouch).length;
    }
    expect(loose).toBeGreaterThan(0);
  });

  test('header events off crosses/corners carry the aerial marker', () => {
    let aerial = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const home = createTestTeam('home', 'Home', '4-4-2', { idPrefix: 'h-' });
      const away = createTestTeam('away', 'Away', '4-4-2', { idPrefix: 'a-' });
      const sim = new MatchSimulator({
        matchDuration: 90, eventsPerMinute: 3,
        homeTeam: home, awayTeam: away,
        homeStarters: home.squad, awayStarters: away.squad,
        rng: mulberry32(seed),
      });
      aerial += sim.simulate().events.filter(e => e.metadata?.aerial).length;
    }
    expect(aerial).toBeGreaterThan(0);
  });
});

describe('engagement stage (integration):', () => {
  test('a heavy press produces second-defender challenges; a passive block far fewer', () => {
    const count = (pressIntensity: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const home = createTestTeam('home', 'Home', '4-4-2', { idPrefix: 'h-' });
        const away = createTestTeam('away', 'Away', '4-4-2', { idPrefix: 'a-' });
        const sim = new MatchSimulator({
          matchDuration: 90, eventsPerMinute: 3,
          homeTeam: home, awayTeam: away,
          homeStarters: home.squad, awayStarters: away.squad,
          awayParams: { ...NEUTRAL_PARAMS, pressIntensity },
          rng: mulberry32(seed + 100),
        });
        n += sim.simulate().events.filter(e => e.metadata?.secondDefender && e.team === 'away').length;
      }
      return n;
    };
    const heavy = count(95);
    const passive = count(5);
    expect(heavy).toBeGreaterThan(passive);
    expect(heavy).toBeGreaterThan(0);
  });
});
