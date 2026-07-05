import type { MatchEvent, MatchStatistics } from './types.ts';
import type { ActionType } from './action-selector.ts';

/** The contested outfield actions tracked in `MatchStatistics.actionBreakdown` (shots are
 *  covered by the shots/shotsOnTarget counters instead — they're resolved by the keeper,
 *  not an outfield contest). */
export const CONTESTED_ACTION_TYPES = ['short_pass', 'long_pass', 'through_ball', 'cross', 'dribble'] as const;
export type ContestedActionType = Extract<ActionType, (typeof CONTESTED_ACTION_TYPES)[number]>;

/** Which contested actions count toward the pass-completion stat. */
const PASS_ACTION_TYPES = new Set<string>(['short_pass', 'long_pass', 'through_ball']);

export interface ActionTally { attempts: number; successes: number }
export type ActionBreakdown = Record<ContestedActionType, ActionTally>;

function emptyBreakdown(): ActionBreakdown {
  return Object.fromEntries(
    CONTESTED_ACTION_TYPES.map(t => [t, { attempts: 0, successes: 0 }]),
  ) as ActionBreakdown;
}

/** Goals from this minute on count as "late" (fade/fitness signal). */
const LATE_GOAL_MINUTE = 70;

interface SideCounters {
  events: number;
  shots: number;
  goals: number;
  lateGoals: number;
  saves: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  passesCompleted: number;
  passesAttempted: number;
  actions: ActionBreakdown;
}

function emptySide(): SideCounters {
  return {
    events: 0, shots: 0, goals: 0, lateGoals: 0, saves: 0, corners: 0, fouls: 0, yellow: 0, red: 0,
    passesCompleted: 0, passesAttempted: 0, actions: emptyBreakdown(),
  };
}

// Per-player rating contributions. Everyone starts at the neutral baseline and moves
// with what they actually did; the result is clamped to a familiar 10-point scale.
const RATING_BASE = 6.5;
const RATING_MIN = 5.0;
const RATING_MAX = 9.9;
const RATING_DELTA: Record<string, number> = {
  goal: 1.0,
  save: 0.2,
  tackle: 0.08,
  interception: 0.08,
  clearance: 0.08,
  short_pass: 0.02,
  long_pass: 0.05,
  through_ball: 0.08,
  cross: 0.05,
  dribble: 0.05,
  foul: -0.1,
  yellow_card: -0.3,
  red_card: -1.0,
};
const RATING_TURNOVER = -0.05; // the attacker who lost a contested action

function isContested(type: string): type is ContestedActionType {
  return (CONTESTED_ACTION_TYPES as readonly string[]).includes(type);
}

/**
 * Running match-statistics counters, fed one minute's (flattened) events at a time —
 * the live-match path never runs a whole match in one call, so statistics must be
 * accumulated as the match ticks rather than derived from a final event array.
 * Purely counting: consumes no randomness, so recording is determinism-safe.
 */
export class StatsAccumulator {
  private readonly home = emptySide();
  private readonly away = emptySide();
  private readonly ratingDeltas = new Map<string, number>();

  record(events: MatchEvent[]): void {
    for (const e of events) {
      const side = e.team === 'home' ? this.home : this.away;
      side.events++;
      switch (e.type) {
      case 'shot': side.shots++; break;
      case 'goal':
        side.goals++;
        if (e.minute >= LATE_GOAL_MINUTE) { side.lateGoals++; }
        break;
      case 'save': side.saves++; break;
      case 'corner': side.corners++; break;
      case 'foul': side.fouls++; break;
      case 'yellow_card': side.yellow++; break;
      case 'red_card': side.red++; break;
      }

      if (e.playerId && RATING_DELTA[e.type] !== undefined) {
        this.bumpRating(e.playerId, RATING_DELTA[e.type]);
      }

      // A contested action that the defender resolved: the attempt failed. The event
      // itself belongs to whichever side the outcome credits (tackle → defender,
      // foul → fouler), so the attempted action + attacking side ride on metadata
      // (tagged in ActionSelector, where the chosen action is still known).
      const contested = e.metadata?.contestedAction as string | undefined;
      const attackingTeam = e.metadata?.attackingTeam as 'home' | 'away' | undefined;
      if (contested && attackingTeam && isContested(contested)) {
        const atk = attackingTeam === 'home' ? this.home : this.away;
        atk.actions[contested].attempts++;
        if (PASS_ACTION_TYPES.has(contested)) { atk.passesAttempted++; }
        const attackerId = e.metadata?.attackerId as string | undefined;
        if (attackerId) { this.bumpRating(attackerId, RATING_TURNOVER); }
        continue;
      }

      // The success path: the offensive generator's own event (short_pass, dribble, …).
      if (isContested(e.type)) {
        side.actions[e.type].attempts++;
        side.actions[e.type].successes++;
        if (PASS_ACTION_TYPES.has(e.type)) {
          side.passesAttempted++;
          side.passesCompleted++;
        }
      }
    }
  }

  private bumpRating(playerId: string, delta: number): void {
    this.ratingDeltas.set(playerId, (this.ratingDeltas.get(playerId) ?? 0) + delta);
  }

  build(): MatchStatistics {
    const total = this.home.events + this.away.events;
    const homePossession = total === 0 ? 50 : Math.round((this.home.events / total) * 100);
    const playerRatings: Record<string, number> = {};
    for (const [id, delta] of this.ratingDeltas) {
      playerRatings[id] = Math.round(
        Math.min(RATING_MAX, Math.max(RATING_MIN, RATING_BASE + delta)) * 10,
      ) / 10;
    }
    return {
      possession: { home: homePossession, away: 100 - homePossession },
      // A converted shot appears as both its `shot` event and the chained `goal`, so the
      // historical shots stat is shot-events + goals (kept for continuity).
      shots: { home: this.home.shots + this.home.goals, away: this.away.shots + this.away.goals },
      shotsOnTarget: {
        home: this.home.goals + this.away.saves,
        away: this.away.goals + this.home.saves,
      },
      corners: { home: this.home.corners, away: this.away.corners },
      fouls: { home: this.home.fouls, away: this.away.fouls },
      cards: {
        yellow: { home: this.home.yellow, away: this.away.yellow },
        red: { home: this.home.red, away: this.away.red },
      },
      passes: {
        home: { attempted: this.home.passesAttempted, completed: this.home.passesCompleted },
        away: { attempted: this.away.passesAttempted, completed: this.away.passesCompleted },
      },
      lateGoals: { home: this.home.lateGoals, away: this.away.lateGoals },
      actionBreakdown: { home: this.home.actions, away: this.away.actions },
      playerRatings,
    };
  }
}
