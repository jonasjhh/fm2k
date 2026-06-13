import { MatchOccurrence } from './match-occurrence.ts';
import type { MatchOccurrenceConfig } from './match-occurrence.ts';
import { createGameDateTime } from '@fm2k/timeline';
import type { OccurrenceContext } from '@fm2k/timeline';
import type { Team, Player, Formation } from '../shared/types.ts';

function createTestPlayer(id: string, name: string, position: string): Player {
  return {
    id,
    name,
    nationality: 'norwegian',
    age: 25,
    position: position as any,
    potential: 70,
    attributes: {
      speed: 70, strength: 70, agility: 70,
      passing: 70, finishing: 70, technique: 70,
      defending: 70, stamina: 75, awareness: 70, composure: 70,
    },
  };
}

function createTestTeam(id: string, name: string): Team {
  return {
    id,
    name,
    formation: '4-4-2' as Formation,
    colors: { primary: '#FFFFFF', secondary: '#000000' },
    starters: [
      createTestPlayer(`${id}-gk`, 'GK', 'GK'),
      createTestPlayer(`${id}-cb1`, 'CB1', 'CB'),
      createTestPlayer(`${id}-cb2`, 'CB2', 'CB'),
      createTestPlayer(`${id}-lb`, 'LB', 'LB'),
      createTestPlayer(`${id}-rb`, 'RB', 'RB'),
      createTestPlayer(`${id}-cm1`, 'CM1', 'CM'),
      createTestPlayer(`${id}-cm2`, 'CM2', 'CM'),
      createTestPlayer(`${id}-lm`, 'LM', 'LM'),
      createTestPlayer(`${id}-rm`, 'RM', 'RM'),
      createTestPlayer(`${id}-st1`, 'ST1', 'ST'),
      createTestPlayer(`${id}-st2`, 'ST2', 'ST'),
    ],
    substitutes: [],
  };
}

const KICK_OFF = createGameDateTime(2025, 8, 15, 14, 0);
const CTX: OccurrenceContext = {};

function makeOccurrence(overrides: Partial<MatchOccurrenceConfig> = {}): MatchOccurrence {
  return new MatchOccurrence({
    id: 'match-1',
    scheduledTime: KICK_OFF,
    homeTeam: createTestTeam('home', 'Home FC'),
    awayTeam: createTestTeam('away', 'Away FC'),
    eventsPerMinute: 2,
    ...overrides,
  });
}

function advanceTicks(occ: MatchOccurrence, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    occ.onTick(createGameDateTime(2025, 8, 15, 14 + Math.floor(i / 60), i % 60), CTX);
  }
}

/** Deterministic PRNG (mulberry32) — varies per call so a shootout always resolves. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tickUntilComplete(occ: MatchOccurrence, maxTicks = 200): number {
  let ticks = 0;
  while (!occ.isComplete(KICK_OFF) && ticks < maxTicks) {
    occ.onTick(createGameDateTime(2025, 8, 15, 14 + Math.floor(ticks / 60), ticks % 60), CTX);
    ticks++;
  }
  return ticks;
}

describe('MatchOccurrence knockout:', () => {
  test('given a knockout occurrence then onComplete always names a winner', () => {
    const occ = makeOccurrence({ knockout: true, rng: mulberry32(7) });
    tickUntilComplete(occ);
    expect(occ.isComplete(KICK_OFF)).toBe(true);
    const [event] = occ.onComplete(CTX);
    expect(['home', 'away']).toContain(event.payload.winnerTeamId);
    expect(['normal', 'extra_time', 'penalties']).toContain(event.payload.decidedBy);
  });

  test('given a knockout occurrence that finishes level then it is decided by penalties with a shootout score', () => {
    // Run several knockout matches; any that reach 120' level must carry a shootout.
    for (let s = 0; s < 8; s++) {
      const occ = makeOccurrence({ id: `cup-${s}`, knockout: true, rng: mulberry32(s + 1) });
      tickUntilComplete(occ);
      const [event] = occ.onComplete(CTX);
      if (event.payload.decidedBy === 'penalties') {
        const shootout = event.payload.shootout as { home: number; away: number };
        expect(event.payload.homeScore).toBe(event.payload.awayScore);
        expect(shootout).toBeDefined();
        expect(shootout.home).not.toBe(shootout.away);
        const winnerIsHome = shootout.home > shootout.away;
        expect(event.payload.winnerTeamId).toBe(winnerIsHome ? 'home' : 'away');
      }
    }
  });

  test('given a non-knockout occurrence then onComplete carries no winnerTeamId', () => {
    const occ = makeOccurrence();
    advanceTicks(occ, 90);
    const [event] = occ.onComplete(CTX);
    expect(event.payload.winnerTeamId).toBeUndefined();
  });
});

describe('MatchOccurrence:', () => {
  describe('properties:', () => {
    test('given a config when constructed then id matches config', () => {
      expect(makeOccurrence({ id: 'cup-final' }).id).toBe('cup-final');
    });

    test('given a config when constructed then scheduledTime matches config', () => {
      expect(makeOccurrence().scheduledTime).toEqual(KICK_OFF);
    });

    test('given a config when constructed then tickResolution is minute', () => {
      expect(makeOccurrence().tickResolution).toBe('minute');
    });
  });

  describe('onStart:', () => {
    test('given a new occurrence when started then returns exactly one event', () => {
      expect(makeOccurrence().onStart(CTX)).toHaveLength(1);
    });

    test('given a new occurrence when started then event type is match.started', () => {
      const [event] = makeOccurrence().onStart(CTX);
      expect(event.eventType).toBe('match.started');
    });

    test('given a new occurrence when started then occurrenceId matches', () => {
      const [event] = makeOccurrence({ id: 'final' }).onStart(CTX);
      expect(event.occurrenceId).toBe('final');
    });

    test('given a new occurrence when started then occurrenceType is match', () => {
      const [event] = makeOccurrence().onStart(CTX);
      expect(event.occurrenceType).toBe('match');
    });

    test('given a new occurrence when started then payload contains team ids', () => {
      const [event] = makeOccurrence().onStart(CTX);
      expect(event.payload.homeTeamId).toBe('home');
      expect(event.payload.awayTeamId).toBe('away');
    });

    test('given a new occurrence when started then payload contains team names', () => {
      const [event] = makeOccurrence().onStart(CTX);
      expect(event.payload.homeTeam).toBe('Home FC');
      expect(event.payload.awayTeam).toBe('Away FC');
    });

    test('given a new occurrence when started then event timestamp matches scheduledTime', () => {
      const [event] = makeOccurrence().onStart(CTX);
      expect(event.timestamp).toEqual(KICK_OFF);
    });
  });

  describe('onTick:', () => {
    test('given an active occurrence when ticked then returns at least one event', () => {
      const occ = makeOccurrence();
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.length).toBeGreaterThan(0);
    });

    test('given an active occurrence when ticked then events have correct occurrenceId', () => {
      const occ = makeOccurrence({ id: 'league-match' });
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.every(e => e.occurrenceId === 'league-match')).toBe(true);
    });

    test('given an active occurrence when ticked then events have correct occurrenceType', () => {
      const occ = makeOccurrence();
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.every(e => e.occurrenceType === 'match')).toBe(true);
    });

    test('given an active occurrence when ticked then events have the provided timestamp', () => {
      const occ = makeOccurrence();
      const ts = createGameDateTime(2025, 8, 15, 14, 5);
      const events = occ.onTick(ts, CTX);
      expect(events.every(e => e.timestamp === ts)).toBe(true);
    });

    test('given an active occurrence when ticked then match state minute advances', () => {
      const occ = makeOccurrence();
      const before = occ.getMatchState().minute;
      occ.onTick(KICK_OFF, CTX);
      expect(occ.getMatchState().minute).toBe(before + 1);
    });

    test('given an active occurrence ticked multiple times then minute advances correctly', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 10);
      expect(occ.getMatchState().minute).toBe(10);
    });

    test('given an occurrence ticked to minute 44 then next tick produces a half_time event', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 44);
      const events = occ.onTick(KICK_OFF, CTX); // minute 44 → 45, half_time
      expect(events.some(e => e.eventType === 'half_time')).toBe(true);
    });

    test('given an occurrence ticked past half_time then second half events are produced', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 45); // through to minute 45 (half_time phase)
      const events = occ.onTick(KICK_OFF, CTX); // minute 45 → 46, kickoff
      expect(events.some(e => e.eventType === 'kickoff')).toBe(true);
    });

    test('given an occurrence ticked 89 times then final tick produces a full_time event', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 89);
      const events = occ.onTick(KICK_OFF, CTX); // minute 89 → 90, full_time
      expect(events.some(e => e.eventType === 'full_time')).toBe(true);
    });

    test('given a tick event when inspecting payload then it contains match minute', () => {
      const occ = makeOccurrence();
      const events = occ.onTick(KICK_OFF, CTX);
      const playEvent = events.find(e => e.eventType !== 'half_time' && e.eventType !== 'full_time');
      if (playEvent) {
        expect(typeof playEvent.payload.minute).toBe('number');
      }
    });

    test('given a tick event when inspecting payload then it contains current score', () => {
      const occ = makeOccurrence();
      const events = occ.onTick(KICK_OFF, CTX);
      events.forEach(e => {
        expect(typeof e.payload.homeScore).toBe('number');
        expect(typeof e.payload.awayScore).toBe('number');
      });
    });
  });

  describe('isComplete:', () => {
    test('given a new occurrence then is not complete', () => {
      expect(makeOccurrence().isComplete(KICK_OFF)).toBe(false);
    });

    test('given an occurrence after 44 ticks then is not complete', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 44);
      expect(occ.isComplete(KICK_OFF)).toBe(false);
    });

    test('given an occurrence after 90 ticks then is complete', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90); // ticks 0–89 advance to minute 90, full_time
      expect(occ.isComplete(KICK_OFF)).toBe(true);
    });
  });

  describe('onComplete:', () => {
    test('given a completed occurrence when completing then returns exactly one event', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90);
      expect(occ.onComplete(CTX)).toHaveLength(1);
    });

    test('given a completed occurrence when completing then event type is match.completed', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90);
      const [event] = occ.onComplete(CTX);
      expect(event.eventType).toBe('match.completed');
    });

    test('given a completed occurrence when completing then payload contains final score', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90);
      const [event] = occ.onComplete(CTX);
      expect(typeof event.payload.homeScore).toBe('number');
      expect(typeof event.payload.awayScore).toBe('number');
    });

    test('given a completed occurrence when completing then payload contains team ids', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90);
      const [event] = occ.onComplete(CTX);
      expect(event.payload.homeTeamId).toBe('home');
      expect(event.payload.awayTeamId).toBe('away');
    });

    test('given a completed occurrence when completing then payload final minute is 90', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90);
      const [event] = occ.onComplete(CTX);
      expect(event.payload.finalMinute).toBe(90);
    });
  });

  describe('getMatchState:', () => {
    test('given a new occurrence then initial phase is first_half', () => {
      expect(makeOccurrence().getMatchState().phase).toBe('first_half');
    });

    test('given an occurrence after 90 ticks then phase is full_time', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 90);
      expect(occ.getMatchState().phase).toBe('full_time');
    });

    test('given an occurrence mid-match then scores are non-negative integers', () => {
      const occ = makeOccurrence();
      advanceTicks(occ, 45);
      const state = occ.getMatchState();
      expect(state.homeScore).toBeGreaterThanOrEqual(0);
      expect(state.awayScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('substitution wiring:', () => {
    function makeTeamWithSub(): { team: Team; sub: Player } {
      const team = createTestTeam('home', 'Home FC');
      const sub = createTestPlayer('home-sub', 'Sub Player', 'CM');
      team.substitutes.push(sub);
      return { team, sub };
    }

    test('given no callback then no substitution events are emitted', () => {
      const occ = makeOccurrence();
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.some(e => e.eventType === 'match.substitution_applied')).toBe(false);
    });

    test('given callback returning same lineup then no substitution events are emitted', () => {
      const { team } = makeTeamWithSub();
      const lineup = [...team.starters];
      const occ = makeOccurrence({
        homeTeam: team,
        playerTeamId: 'home',
        getPlayerTeamLineup: () => lineup,
      });
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.some(e => e.eventType === 'match.substitution_applied')).toBe(false);
    });

    test('given callback with one swap then emits one match.substitution_applied event', () => {
      const { team, sub } = makeTeamWithSub();
      let lineup = [...team.starters];
      const occ = makeOccurrence({
        homeTeam: team,
        playerTeamId: 'home',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...team.starters.slice(1)]; // swap first starter for sub
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.filter(e => e.eventType === 'match.substitution_applied')).toHaveLength(1);
    });

    test('given callback with one swap then substitution event has correct playerOutId and playerInId', () => {
      const { team, sub } = makeTeamWithSub();
      const outPlayer = team.starters[0];
      let lineup = [...team.starters];
      const occ = makeOccurrence({
        homeTeam: team,
        playerTeamId: 'home',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...team.starters.slice(1)];
      const events = occ.onTick(KICK_OFF, CTX);
      const subEvent = events.find(e => e.eventType === 'match.substitution_applied')!;
      expect(subEvent.payload.playerOutId).toBe(outPlayer.id);
      expect(subEvent.payload.playerInId).toBe(sub.id);
    });

    test('given callback with one swap then currentPlayers reflects the new lineup', () => {
      const { team, sub } = makeTeamWithSub();
      const outPlayer = team.starters[0];
      let lineup = [...team.starters];
      const occ = makeOccurrence({
        homeTeam: team,
        playerTeamId: 'home',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...team.starters.slice(1)];
      occ.onTick(KICK_OFF, CTX);
      const homePlayers = occ.getMatchState().currentPlayers.home;
      expect(homePlayers.map(p => p.id)).toContain(sub.id);
      expect(homePlayers.map(p => p.id)).not.toContain(outPlayer.id);
    });

    test('given playerTeamId is away team then substitution applies to away currentPlayers', () => {
      const { team: awayTeam, sub } = makeTeamWithSub();
      awayTeam.id = 'away'; // ensure it matches
      awayTeam.name = 'Away FC';
      let lineup = [...awayTeam.starters];
      const occ = new MatchOccurrence({
        id: 'match-1',
        scheduledTime: KICK_OFF,
        homeTeam: createTestTeam('home', 'Home FC'),
        awayTeam,
        eventsPerMinute: 2,
        playerTeamId: 'away',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...awayTeam.starters.slice(1)];
      occ.onTick(KICK_OFF, CTX);
      const awayPlayers = occ.getMatchState().currentPlayers.away;
      expect(awayPlayers.map(p => p.id)).toContain(sub.id);
    });

    test('given playerTeamId not matching either team then no substitution events', () => {
      const { team, sub } = makeTeamWithSub();
      let lineup = [...team.starters];
      const occ = makeOccurrence({
        homeTeam: team,
        playerTeamId: 'unknown-team',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...team.starters.slice(1)];
      const events = occ.onTick(KICK_OFF, CTX);
      expect(events.some(e => e.eventType === 'match.substitution_applied')).toBe(false);
    });

    test('given same swap requested twice then substitution only fires once', () => {
      const { team, sub } = makeTeamWithSub();
      let lineup = [...team.starters];
      const occ = makeOccurrence({
        homeTeam: team,
        playerTeamId: 'home',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...team.starters.slice(1)]; // first tick: triggers sub
      occ.onTick(KICK_OFF, CTX);
      const events = occ.onTick(KICK_OFF, CTX); // second tick: same lineup, no sub
      expect(events.some(e => e.eventType === 'match.substitution_applied')).toBe(false);
    });

    test('given substitution event then occurrenceId and occurrenceType are correct', () => {
      const { team, sub } = makeTeamWithSub();
      let lineup = [...team.starters];
      const occ = makeOccurrence({
        id: 'cup-final',
        homeTeam: team,
        playerTeamId: 'home',
        getPlayerTeamLineup: () => lineup,
      });
      advanceTicks(occ, 5);
      lineup = [sub, ...team.starters.slice(1)];
      const events = occ.onTick(KICK_OFF, CTX);
      const subEvent = events.find(e => e.eventType === 'match.substitution_applied')!;
      expect(subEvent.occurrenceId).toBe('cup-final');
      expect(subEvent.occurrenceType).toBe('match');
    });
  });

  describe('TickEngine integration:', () => {
    test('given two concurrent match occurrences when both complete then both produce full_time events via onComplete', () => {
      const match1 = makeOccurrence({ id: 'match-1' });
      const match2 = makeOccurrence({ id: 'match-2' });

      advanceTicks(match1, 90);
      advanceTicks(match2, 90);

      expect(match1.isComplete(KICK_OFF)).toBe(true);
      expect(match2.isComplete(KICK_OFF)).toBe(true);

      const [e1] = match1.onComplete(CTX);
      const [e2] = match2.onComplete(CTX);

      expect(e1.occurrenceId).toBe('match-1');
      expect(e2.occurrenceId).toBe('match-2');
    });
  });
});
