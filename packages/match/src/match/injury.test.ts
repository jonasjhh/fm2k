import {
  collectExposures, rollInjuries, fatigueRiskFactor, injuryDescription, INJURY_TYPES,
  type MatchInjury,
} from './injury.ts';
import { INJURY_BY_ID, TRIGGER_EXPOSURE } from './injury-catalogue.ts';
import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import { mulberry32 } from './rng.ts';
import { createTestTeam, createUniformPlayer } from './test-fixtures.ts';
import type { MatchEvent, MatchState, EventType } from './types.ts';
import type { Player } from '../shared/types.ts';

function ev(type: EventType, team: 'home' | 'away', extra: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: `t-${type}`, type, minute: 30, team, description: type,
    resultingState: {} as MatchState, ...extra,
  };
}

function stateWith(players: Player[], energy = 80): MatchState {
  return {
    minute: 30, homeScore: 0, awayScore: 0, possession: 'home',
    ballPosition: { zone: 'middle_third', side: 'center' }, phase: 'first_half',
    homeTeam: {} as MatchState['homeTeam'], awayTeam: {} as MatchState['awayTeam'],
    currentPlayers: { home: players, away: [] },
    energy: { home: Object.fromEntries(players.map(p => [p.id, energy])), away: {} },
    bookings: { yellow: [], red: [] },
  };
}

const carrier = createUniformPlayer('carrier', 'Carrier', 'ST');

describe('collectExposures:', () => {
  test('a tackle exposes the challenged carrier and the tackler as distinct situations', () => {
    // They are separate triggers, not one trigger with a multiplier: a tackler plants and
    // twists where the player they hit takes it in the thigh, so the injuries differ too.
    const exposures = collectExposures([
      ev('tackle', 'away', { playerId: 'tackler', metadata: { attackerId: 'carrier', attackingTeam: 'home' } }),
    ]);
    expect(exposures).toEqual([
      { playerId: 'carrier', team: 'home', trigger: 'tackled' },
      { playerId: 'tackler', team: 'away', trigger: 'tackling' },
    ]);
  });

  test('a foul\'s trigger reflects the card it drew, so each carries its own exposure', () => {
    const foul = (cards: MatchEvent[]) => collectExposures([
      ev('foul', 'away', { playerId: 'tackler', metadata: { attackerId: 'carrier', attackingTeam: 'home' } }),
      ...cards,
    ])[0];
    expect(foul([]).trigger).toBe('foul');
    expect(foul([ev('yellow_card', 'away', { playerId: 'tackler' })]).trigger).toBe('yellow_foul');
    expect(foul([ev('red_card', 'away', { playerId: 'tackler' })]).trigger).toBe('red_foul');
  });

  test('the exposure table prices a carded foul above a clean one, and a tackler below both', () => {
    // What used to be YELLOW_FOUL_MULT/RED_FOUL_MULT/TACKLER_FACTOR now lives as tunable rows.
    const knock = (t: keyof typeof TRIGGER_EXPOSURE) => TRIGGER_EXPOSURE[t].knock;
    expect(knock('tackling')).toBeLessThan(knock('tackled'));
    expect(knock('foul')).toBeLessThan(knock('yellow_foul'));
    expect(knock('yellow_foul')).toBeLessThan(knock('red_foul'));
  });

  test('sprints, through-ball runs, aerial duels and saves expose the right player', () => {
    const exposures = collectExposures([
      ev('dribble', 'home', { playerId: 'carrier' }),
      ev('through_ball', 'home', { playerId: 'passer', metadata: { receiverId: 'runner' } }),
      ev('shot', 'home', { playerId: 'header', metadata: { aerial: true } }),
      ev('shot', 'home', { playerId: 'normal-shot' }), // not aerial → no exposure
      ev('save', 'away', { playerId: 'keeper' }),
    ]);
    expect(exposures.map(e => [e.playerId, e.trigger])).toEqual([
      ['carrier', 'sprint'],
      ['runner', 'through_run'],
      ['header', 'aerial'],
      ['keeper', 'save'],
    ]);
  });
});

describe('rollInjuries:', () => {
  const tackleEvents = [
    ev('tackle', 'away', { playerId: 'tackler', metadata: { attackerId: 'carrier', attackingTeam: 'home' } }),
  ];

  test('bands roll worst-first, so a serious injury is never masked by a knock', () => {
    // rng 0 → every chance roll passes. Because the bands are rolled serious→knock, the
    // challenged player takes the worst outcome the situation can produce, not the first.
    const injuries = rollInjuries(tackleEvents, stateWith([carrier]), new Set(), () => 0);
    expect(injuries).toHaveLength(1);
    expect(injuries[0]).toMatchObject({
      playerId: 'carrier', team: 'home', cause: 'tackled',
      type: 'knee_ligament_tear', severity: 'serious',
    });
    expect(injuries[0].baseDays).toBeGreaterThanOrEqual(1);
  });

  test('a knock is what a challenge actually produces once the rare bands fail', () => {
    // Fail serious and moderate, pass knock, then pick the head of the table.
    const seq = [1, 1, 0, 0, 0];
    let i = 0;
    const injuries = rollInjuries(
      tackleEvents, stateWith([carrier]), new Set(), () => seq[Math.min(i++, seq.length - 1)],
    );
    expect(injuries[0]).toMatchObject({ type: 'dead_leg', severity: 'knock' });
  });

  test('an injury carries its own mitigation clamps for the club layer to honour', () => {
    const injuries = rollInjuries(tackleEvents, stateWith([carrier]), new Set(), () => 0);
    const def = INJURY_BY_ID[injuries[0].type];
    expect(injuries[0].maxAvertChance).toBe(def.maxAvertChance);
    expect(injuries[0].minDurationFraction).toBe(def.minDurationFraction);
  });

  test('an empty severity slot consumes no rng draw, so it cannot shift later picks', () => {
    // Keepers have no serious injuries. If that slot still drew, the save trigger's roll
    // sequence would silently differ from every other trigger's.
    const keeper = createUniformPlayer('keeper', 'Keeper', 'GK');
    const draws: number[] = [];
    rollInjuries(
      [ev('save', 'home', { playerId: 'keeper' })], stateWith([keeper]), new Set(),
      () => { draws.push(1); return 1; },
    );
    // moderate + knock chance rolls only — the serious slot is skipped outright.
    expect(draws).toHaveLength(2);
  });

  test('broken_leg is only reachable through a carded foul', () => {
    const rig = (events: MatchEvent[]): MatchInjury[] => {
      // pass the chance roll, then force the type pick to the table tail
      const seq = [0, 0.999, 0.5];
      let i = 0;
      return rollInjuries(events, stateWith([carrier]), new Set(), () => seq[Math.min(i++, seq.length - 1)]);
    };
    const carded = rig([
      ev('foul', 'away', { playerId: 'tackler', metadata: { attackerId: 'carrier', attackingTeam: 'home' } }),
      ev('red_card', 'away', { playerId: 'tackler' }),
    ]);
    expect(carded[0].type).toBe('broken_leg');
    const clean = rig([
      ev('foul', 'away', { playerId: 'tackler', metadata: { attackerId: 'carrier', attackingTeam: 'home' } }),
    ]);
    expect(clean[0].type).not.toBe('broken_leg');
  });

  test('an already-injured (or off-pitch) player is never injured again', () => {
    const injuries = rollInjuries(tackleEvents, stateWith([carrier]), new Set(['carrier']), () => 0);
    expect(injuries).toHaveLength(0);
  });

  test('fatigue raises the risk (tired legs break down)', () => {
    expect(fatigueRiskFactor(carrier, 20)).toBeGreaterThan(fatigueRiskFactor(carrier, 90));
    const frail = createUniformPlayer('w', 'W', 'ST', 30);
    const robust = createUniformPlayer('s', 'S', 'ST', 90);
    expect(fatigueRiskFactor(frail, 70)).toBeGreaterThan(fatigueRiskFactor(robust, 70));
  });

  test('descriptions name the player, cause and layoff', () => {
    const injury: MatchInjury = {
      playerId: 'carrier', team: 'home', minute: 70, cause: 'through_run',
      type: 'hamstring_pull', baseDays: 21,
      severity: 'moderate', maxAvertChance: 0.45, minDurationFraction: 0.45,
    };
    const text = injuryDescription('Runner', injury);
    expect(text).toContain('Runner');
    expect(text).toContain('sprinting onto the through ball');
    expect(text).toContain('hamstring pull');
    expect(text).toContain('21 days');
  });
});

describe('in-match injuries (simulator integration):', () => {
  function playMatch(seed: number, injuryRng?: () => number) {
    const home = createTestTeam('home', 'Home', '4-4-2', { idPrefix: 'h-' });
    const away = createTestTeam('away', 'Away', '4-4-2', { idPrefix: 'a-' });
    const sim = new DuelMatchSimulator({
      matchDuration: 90, eventsPerMinute: 3,
      homeTeam: home, awayTeam: away,
      homeStarters: home.squad, awayStarters: away.squad,
      rng: mulberry32(seed),
      ...(injuryRng && { injuryRng }),
    });
    return sim.simulate();
  }

  test('with a forced injury rng, injury events fire, the player leaves and never returns', () => {
    // First chance roll passes; every later draw is neutral (fails further chance rolls,
    // picks mid-table types) — so exactly one injury occurs.
    let first = true;
    const injuryRng = () => { if (first) { first = false; return 0; } return 0.5; };
    const result = playMatch(3, injuryRng);
    const injuryEvents = result.events.filter(e => e.type === 'injury');
    expect(injuryEvents).toHaveLength(1);
    const victim = injuryEvents[0].playerId;
    const side = injuryEvents[0].team;
    expect(victim).toBeDefined();
    expect(result.finalState.currentPlayers[side].map(p => p.id)).not.toContain(victim);
    expect(result.injuries[side].map(i => i.playerId)).toContain(victim);
    // no later event involves the victim (they're off the pitch)
    const after = result.events.filter(e => e.minute > injuryEvents[0].minute && e.playerId === victim);
    expect(after).toHaveLength(0);
  });

  test('injury types come from the known catalogue and injuries land in the result per side', () => {
    let injuriesSeen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const result = playMatch(seed);
      for (const side of ['home', 'away'] as const) {
        for (const injury of result.injuries[side]) {
          injuriesSeen++;
          expect(INJURY_TYPES).toContain(injury.type);
          expect(injury.baseDays).toBeGreaterThanOrEqual(1);
        }
      }
    }
    // ~0.5 injuries/match over 30 matches: expect at least a few
    expect(injuriesSeen).toBeGreaterThan(0);
  });

  test('same seed ⇒ identical injuries (dedicated stream is deterministic)', () => {
    const a = playMatch(42);
    const b = playMatch(42);
    expect(a.injuries).toEqual(b.injuries);
    expect(a.events.map(e => e.description)).toEqual(b.events.map(e => e.description));
  });
});
