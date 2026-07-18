import type { Player, Team } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';
import { resolveMatchParameters } from '../tactics/resolve.ts';
import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import type { MatchEvent, MatchStatistics, MatchState } from './types.ts';
import type { InjuryReport } from './injury.ts';

/** One side's full match input: a squad + the manager's tactical intent. `starters` must
 *  already be the resolved XI (exactly 11, in slot order for `intent.formation`) —
 *  selection happens upstream of the simulator, never inside it. */
export interface SideInput {
  team: Team;
  starters: Player[];
  intent: TeamTacticsIntent;
  /** Starting energy 0..100 per player id (e.g. from fitness); default fresh. */
  fitness?: Record<string, number>;
}

export interface SimulateMatchInput {
  home: SideInput;
  away: SideInput;
  matchDuration?: number;
  eventsPerMinute?: number;
  /** Knockout: extra time + shootout to force a winner. */
  knockout?: boolean;
  /** Injected rng for a deterministic match. */
  rng?: () => number;
}

/** What happened to one player over the match — the consumer applies these to its world. */
export interface PlayerMatchUpdate {
  playerId: string;
  yellowCards: number;
  redCard: boolean;
  /** Pre-mitigation injury, if any (the club layer applies medical-facility mitigation). */
  injury?: InjuryReport;
  minutesPlayed: number;
  endEnergy: number;
}

/** A self-describing match outcome: the events, the score they imply, stats, and player updates. */
export interface SimulateMatchResult {
  events: MatchEvent[];
  score: { home: number; away: number };
  statistics: MatchStatistics;
  playerUpdates: { home: PlayerMatchUpdate[]; away: PlayerMatchUpdate[] };
  finalState: MatchState;
}

/**
 * Standalone match simulation: two teams + their tactical intent in, a full result out.
 * Resolves each side's tactics (with the *opponent's* XI, for the asymmetric suitability
 * rule), runs the simulator, and assembles per-player updates (cards, injuries, minutes,
 * energy) from the events/final state.
 */
export function simulateMatch(input: SimulateMatchInput): SimulateMatchResult {
  const homeTeam: Team = { ...input.home.team, formation: input.home.intent.formation };
  const awayTeam: Team = { ...input.away.team, formation: input.away.intent.formation };

  const homeXI = input.home.starters;
  const awayXI = input.away.starters;

  const homeParams = resolveMatchParameters(input.home.intent, homeXI, awayXI);
  const awayParams = resolveMatchParameters(input.away.intent, awayXI, homeXI);

  const sim = new DuelMatchSimulator({
    matchDuration: input.matchDuration ?? 90,
    eventsPerMinute: input.eventsPerMinute ?? 3,
    homeTeam, awayTeam,
    homeStarters: homeXI, awayStarters: awayXI,
    homeParams, awayParams,
    homeFitness: input.home.fitness,
    awayFitness: input.away.fitness,
    extraTimeIfDrawn: input.knockout,
    rng: input.rng,
  });

  const result = sim.simulate();
  const fs = result.finalState;

  const buildUpdates = (side: 'home' | 'away', xi: Player[]): PlayerMatchUpdate[] => {
    const energy = fs.energy?.[side] ?? {};
    const injBy = new Map(result.injuries[side].map(i => [i.playerId, i] as const));
    const redMinByPlayer = new Map(
      fs.bookings.red.filter(b => b.team === side).map(b => [b.playerId, b.minute] as const));
    return xi.map(p => {
      const redMin = redMinByPlayer.get(p.id);
      return {
        playerId: p.id,
        yellowCards: fs.bookings.yellow.filter(b => b.team === side && b.playerId === p.id).length,
        redCard: redMin !== undefined,
        injury: injBy.get(p.id),
        minutesPlayed: redMin ?? fs.minute,
        endEnergy: energy[p.id] ?? 100,
      };
    });
  };

  return {
    events: result.events,
    score: { home: fs.homeScore, away: fs.awayScore },
    statistics: result.statistics,
    playerUpdates: { home: buildUpdates('home', homeXI), away: buildUpdates('away', awayXI) },
    finalState: fs,
  };
}
