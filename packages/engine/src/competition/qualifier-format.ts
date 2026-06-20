import { selectStartingXIWithSlots } from '@fm2k/lineup';
import type { Player, Team } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import type {
  CompetitionFormat, FormatContext, MatchOutcome, ScheduledMatch,
} from './competition-format.ts';
import type { CompetitionFixture, CompetitionState } from './competition-types.ts';

function bestXI(team: Team): Player[] {
  return selectStartingXIWithSlots(team.squad, team.formation).starters;
}

export interface QualifierFormatOptions {
  /** Lower-division challenger — plays at home, per spec. */
  readonly homeTeam: Team;
  /** Upper-division defender — plays away. */
  readonly awayTeam: Team;
  readonly scheduledTime: GameDateTime;
}

/**
 * A single one-off promotion/relegation playoff match between the upper division's
 * 3rd-from-bottom team and the lower division's 3rd-place team. Unlike `LeagueFormat`/
 * `KnockoutFormat`, both participants are already known when this is constructed (the
 * caller resolves them from final league standings), so there's no seeding to do —
 * `init` just materialises the one fixture.
 */
export class QualifierFormat implements CompetitionFormat {
  readonly kind = 'knockout' as const;
  private readonly options: QualifierFormatOptions;

  constructor(options: QualifierFormatOptions) {
    this.options = options;
  }

  init(ctx: FormatContext): { state: CompetitionState; toSchedule: ScheduledMatch[] } {
    const { homeTeam, awayTeam, scheduledTime } = this.options;
    const fixture: CompetitionFixture = {
      id: `${ctx.competitionId}-1`,
      matchday: 1,
      competitionId: ctx.competitionId,
      roundLabel: 'Qualifier',
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      scheduledTime,
      result: null,
      status: 'scheduled',
    };
    const state: CompetitionState = {
      competitionId: ctx.competitionId,
      kind: 'knockout',
      name: ctx.name,
      season: ctx.season,
      standings: [],
      fixtures: [fixture],
    };
    return { state, toSchedule: [this.toScheduledMatch(fixture)] };
  }

  apply(draft: CompetitionState, outcome: MatchOutcome): ScheduledMatch[] {
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
    return [];
  }

  completedRounds(state: CompetitionState): number {
    return state.fixtures[0]?.status === 'completed' ? 1 : 0;
  }

  rescheduleFromState(state: CompetitionState): ScheduledMatch[] {
    return state.fixtures.filter(f => f.status === 'scheduled').map(f => this.toScheduledMatch(f));
  }

  private toScheduledMatch(fixture: CompetitionFixture): ScheduledMatch {
    const { homeTeam, awayTeam } = this.options;
    return {
      fixtureId: fixture.id,
      homeTeam,
      awayTeam,
      homeStarters: bestXI(homeTeam),
      awayStarters: bestXI(awayTeam),
      scheduledTime: fixture.scheduledTime,
      knockout: true,
    };
  }
}
