import type { Player, Team } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import { cupRoundDates } from './cup-scheduling.ts';
import { drawBracket, recordWinner, roundComplete, slotsInRound } from './knockout-bracket.ts';
import { selectStartingXIWithSlots } from '../squad/lineup-selection.ts';
import type {
  CompetitionFormat, FormatContext, MatchOutcome, ScheduledMatch,
} from './competition-format.ts';
import type {
  BracketState, BracketSlot, CompetitionFixture, CompetitionState, KnockoutFormatConfig,
} from './competition-types.ts';

const DEFAULT_LEAGUE_MATCHDAYS = 30;

/** AI's eager best-fit XI for a team — the default before the human club's own choice
 *  (resolved later, lazily, by CompetitionManager/MatchOccurrence) overrides it. */
function bestXI(team: Team): Player[] {
  return selectStartingXIWithSlots(team.squad, team.formation).starters;
}

export interface KnockoutFormatOptions extends KnockoutFormatConfig {
  /** League season length the cup rounds are spread across. */
  readonly leagueMatchdays?: number;
}

/** Single-elimination knockout: a fixed bracket drawn once, midweek rounds. */
export class KnockoutFormat implements CompetitionFormat {
  readonly kind = 'knockout' as const;
  private readonly cfg: KnockoutFormatConfig;
  private readonly leagueMatchdays: number;

  constructor(options: KnockoutFormatOptions) {
    this.cfg = options;
    this.leagueMatchdays = options.leagueMatchdays ?? DEFAULT_LEAGUE_MATCHDAYS;
  }

  init(ctx: FormatContext): { state: CompetitionState; toSchedule: ScheduledMatch[] } {
    const bracket = drawBracket(this.cfg, this.teamsByLevel(ctx), ctx.rng);
    const dates = this.roundDates(ctx, bracket.rounds);

    const state: CompetitionState = {
      competitionId: ctx.competitionId,
      kind: 'knockout',
      name: ctx.name,
      season: ctx.season,
      standings: [],
      fixtures: [],
      bracket,
    };

    // Only round 1 has both participants known up front.
    const toSchedule: ScheduledMatch[] = [];
    for (const slot of slotsInRound(bracket, 1)) {
      const sched = this.materialise(slot, bracket, state, dates, ctx);
      if (sched) { toSchedule.push(sched); }
    }
    return { state, toSchedule };
  }

  apply(draft: CompetitionState, outcome: MatchOutcome, ctx: FormatContext): ScheduledMatch[] {
    const bracket = draft.bracket!;
    const fixture = draft.fixtures.find(f => f.id === outcome.fixtureId);
    if (!fixture || fixture.status === 'completed') { return []; }

    fixture.result = {
      homeScore: outcome.homeScore,
      awayScore: outcome.awayScore,
      decidedBy: outcome.decidedBy,
      shootout: outcome.shootout,
      winnerTeamId: outcome.winnerTeamId,
    };
    fixture.status = 'completed';

    const winnerId = outcome.winnerTeamId
      ?? (outcome.homeScore >= outcome.awayScore ? outcome.homeTeamId : outcome.awayTeamId);
    const winnerName = ctx.teamsById.get(winnerId)?.name ?? winnerId;

    const slot = bracket.slots.find(s => s.fixtureId === outcome.fixtureId);
    if (!slot) { return []; }

    const { nextTieId } = recordWinner(bracket, slot.tieId, winnerId, winnerName);
    if (nextTieId === null) { return []; }

    const next = bracket.slots.find(s => s.tieId === nextTieId)!;
    const dates = this.roundDates(ctx, bracket.rounds);
    const sched = this.materialise(next, bracket, draft, dates, ctx);
    return sched ? [sched] : [];
  }

  completedRounds(state: CompetitionState): number {
    const bracket = state.bracket;
    if (!bracket) { return 0; }
    let count = 0;
    for (let round = 1; round <= bracket.rounds; round++) {
      if (roundComplete(bracket, round)) { count++; }
    }
    return count;
  }

  rescheduleFromState(state: CompetitionState, ctx: FormatContext): ScheduledMatch[] {
    return state.fixtures
      .filter(f => f.status === 'scheduled')
      .map(f => this.toScheduledMatch(f, ctx));
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private teamsByLevel(ctx: FormatContext): Map<number, Team[]> {
    const byLevel = new Map<number, Team[]>();
    for (const team of ctx.teams) {
      const level = ctx.levelByTeamId.get(team.id);
      if (level === undefined) { continue; }
      const list = byLevel.get(level) ?? [];
      list.push(team);
      byLevel.set(level, list);
    }
    return byLevel;
  }

  private roundDates(ctx: FormatContext, rounds: number): GameDateTime[] {
    return cupRoundDates(ctx.seasonStart, this.leagueMatchdays, rounds);
  }

  /** Create a tie's fixture + occurrence once both participants are known. */
  private materialise(
    slot: BracketSlot,
    bracket: BracketState,
    state: CompetitionState,
    dates: GameDateTime[],
    ctx: FormatContext,
  ): ScheduledMatch | null {
    if (slot.fixtureId !== null) { return null; }
    if (slot.homeTeamId === null || slot.awayTeamId === null) { return null; }

    const fixture: CompetitionFixture = {
      id: `${ctx.competitionId}-${slot.tieId}`,
      matchday: slot.round,
      competitionId: ctx.competitionId,
      roundLabel: bracket.roundNames[slot.round - 1],
      homeTeamId: slot.homeTeamId,
      awayTeamId: slot.awayTeamId,
      homeTeamName: slot.homeTeamName!,
      awayTeamName: slot.awayTeamName!,
      scheduledTime: dates[slot.round - 1],
      result: null,
      status: 'scheduled',
    };
    state.fixtures.push(fixture);
    slot.fixtureId = fixture.id;
    return this.toScheduledMatch(fixture, ctx);
  }

  private toScheduledMatch(fixture: CompetitionFixture, ctx: FormatContext): ScheduledMatch {
    const homeTeam = ctx.teamsById.get(fixture.homeTeamId)!;
    const awayTeam = ctx.teamsById.get(fixture.awayTeamId)!;
    return {
      fixtureId: fixture.id,
      homeTeam, awayTeam,
      homeStarters: bestXI(homeTeam),
      awayStarters: bestXI(awayTeam),
      scheduledTime: fixture.scheduledTime,
      knockout: true,
    };
  }
}
