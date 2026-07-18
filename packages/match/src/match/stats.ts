import type { MatchEvent, MatchStatistics, DuelTally } from './types.ts';
import type { DuelType } from './duel/duels.ts';

/** The contested outfield actions tracked in `MatchStatistics.actionBreakdown` (shots are
 *  covered by the shots/shotsOnTarget counters instead — they're resolved by the keeper,
 *  not an outfield contest). */
export const CONTESTED_ACTION_TYPES = ['short_pass', 'long_pass', 'through_ball', 'cross', 'dribble'] as const;
export type ContestedActionType = (typeof CONTESTED_ACTION_TYPES)[number];

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

/** How far back (in recorded events) to look for the turnover that started a break. */
const FAST_BREAK_WINDOW = 4;
/** How quickly (in match minutes) that turnover must have been converted to still count as "fast". */
const FAST_BREAK_MAX_MINUTES = 2;
/** Winning the ball back via one of these counts as the possible start of a break. */
const TURNOVER_EVENT_TYPES = new Set(['tackle', 'interception', 'clearance']);
/** The kind of forward action that carries a break from the turnover to the box. */
const BREAK_CARRIER_TYPES = new Set(['long_pass', 'through_ball']);

interface SideCounters {
  events: number;
  shots: number;
  goals: number;
  lateGoals: number;
  fastBreakGoals: number;
  saves: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  passesCompleted: number;
  passesAttempted: number;
  actions: ActionBreakdown;
  duelsWon: DuelTally;
}

function emptyDuelTally(): DuelTally {
  return { speed: 0, strength: 0, dribble: 0, pass: 0, shot: 0 };
}

function emptySide(): SideCounters {
  return {
    events: 0, shots: 0, goals: 0, lateGoals: 0, fastBreakGoals: 0, saves: 0, corners: 0, fouls: 0, yellow: 0, red: 0,
    passesCompleted: 0, passesAttempted: 0, actions: emptyBreakdown(), duelsWon: emptyDuelTally(),
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
  /** Bounded tail of recently recorded events, for the fast-break-goal look-back
   *  (persists across `record()` calls since live matches feed one minute at a time). */
  private readonly recentEvents: MatchEvent[] = [];

  record(events: MatchEvent[]): void {
    for (const e of events) {
      const side = e.team === 'home' ? this.home : this.away;
      side.events++;
      switch (e.type) {
      case 'shot': side.shots++; break;
      case 'goal':
        side.goals++;
        if (e.minute >= LATE_GOAL_MINUTE) { side.lateGoals++; }
        if (this.isFastBreakGoal(e)) { side.fastBreakGoals++; }
        break;
      case 'save': side.saves++; break;
      case 'corner': side.corners++; break;
      case 'foul': side.fouls++; break;
      case 'yellow_card': side.yellow++; break;
      case 'red_card': side.red++; break;
      }

      // Duels won by type: every contested event carries the duel that resolved it
      // (v2 metadata) — the post-match "who won the football" stat.
      const duel = e.metadata?.duel as { duelType?: DuelType; winnerSide?: 'home' | 'away' } | undefined;
      if (duel?.duelType && duel.winnerSide) {
        (duel.winnerSide === 'home' ? this.home : this.away).duelsWon[duel.duelType]++;
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

      this.recentEvents.push(e);
      if (this.recentEvents.length > FAST_BREAK_WINDOW + 1) { this.recentEvents.shift(); }
    }
  }

  private bumpRating(playerId: string, delta: number): void {
    this.ratingDeltas.set(playerId, (this.ratingDeltas.get(playerId) ?? 0) + delta);
  }

  /** A goal counts as a fast break if, within the last few events, the scoring side won
   *  the ball back (tackle/interception/clearance) and carried it forward with a long
   *  pass or through ball, all within a couple of match minutes of the turnover. */
  private isFastBreakGoal(goal: MatchEvent): boolean {
    const window = this.recentEvents.slice(-FAST_BREAK_WINDOW);
    let turnoverIndex = -1;
    for (let i = window.length - 1; i >= 0; i--) {
      if (TURNOVER_EVENT_TYPES.has(window[i].type) && window[i].team === goal.team) {
        turnoverIndex = i;
        break;
      }
    }
    if (turnoverIndex === -1) { return false; }
    const turnover = window[turnoverIndex];
    if (goal.minute - turnover.minute > FAST_BREAK_MAX_MINUTES) { return false; }
    return window
      .slice(turnoverIndex + 1)
      .some(e => BREAK_CARRIER_TYPES.has(e.type) && e.team === goal.team);
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
      fastBreakGoals: { home: this.home.fastBreakGoals, away: this.away.fastBreakGoals },
      actionBreakdown: { home: this.home.actions, away: this.away.actions },
      duelsWon: { home: { ...this.home.duelsWon }, away: { ...this.away.duelsWon } },
      playerRatings,
    };
  }
}
