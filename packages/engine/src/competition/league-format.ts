import { assertDefined } from '@fm2k/state';
import { generateFixtures } from '../league/fixture-generator.ts';
import { selectStartingXIWithSlots } from '@fm2k/lineup';
import type { Player, Team } from '@fm2k/match';
import type {
  CompetitionFormat, FormatContext, MatchOutcome, ScheduledMatch,
} from './competition-format.ts';
import type {
  CompetitionState, CompetitionStanding, CompetitionFixture, LeagueFormatConfig,
} from './competition-types.ts';

/** AI's eager best-fit XI for a team — the default before the human club's own choice
 *  (resolved later, lazily, by CompetitionManager/MatchOccurrence) overrides it. */
function bestXI(team: Team): Player[] {
  return selectStartingXIWithSlots(team.squad, team.formation).starters;
}

const DEFAULTS = { legs: 2, pointsForWin: 3, pointsForDraw: 1 } as const;

/** Round-robin league: config-driven (legs, points) but expressed as the standard format API. */
export class LeagueFormat implements CompetitionFormat {
  readonly kind = 'league' as const;
  private readonly legs: number;
  private readonly pointsForWin: number;
  private readonly pointsForDraw: number;

  constructor(config: Partial<LeagueFormatConfig> = {}) {
    this.legs = config.legs ?? DEFAULTS.legs;
    this.pointsForWin = config.pointsForWin ?? DEFAULTS.pointsForWin;
    this.pointsForDraw = config.pointsForDraw ?? DEFAULTS.pointsForDraw;
  }

  init(ctx: FormatContext): { state: CompetitionState; toSchedule: ScheduledMatch[] } {
    const fixtures = generateFixtures(ctx.teams, ctx.startDate, ctx.competitionId, this.legs);
    const standings: CompetitionStanding[] = ctx.teams.map(t => ({
      teamId: t.id, teamName: t.name,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    }));
    const state: CompetitionState = {
      competitionId: ctx.competitionId,
      kind: 'league',
      name: ctx.name,
      season: ctx.season,
      standings,
      fixtures,
    };
    return { state, toSchedule: this.scheduleFor(fixtures, ctx) };
  }

  apply(draft: CompetitionState, outcome: MatchOutcome): ScheduledMatch[] {
    const fixture = draft.fixtures.find(f => f.id === outcome.fixtureId);
    if (!fixture || fixture.status === 'completed') { return []; }

    fixture.result = { homeScore: outcome.homeScore, awayScore: outcome.awayScore };
    fixture.status = 'completed';

    const home = assertDefined(draft.standings.find(s => s.teamId === outcome.homeTeamId), `unknown team '${outcome.homeTeamId}'`);
    const away = assertDefined(draft.standings.find(s => s.teamId === outcome.awayTeamId), `unknown team '${outcome.awayTeamId}'`);

    home.played++; away.played++;
    home.goalsFor += outcome.homeScore; home.goalsAgainst += outcome.awayScore;
    away.goalsFor += outcome.awayScore; away.goalsAgainst += outcome.homeScore;

    if (outcome.homeScore > outcome.awayScore) {
      home.won++; home.points += this.pointsForWin; away.lost++;
    } else if (outcome.homeScore < outcome.awayScore) {
      away.won++; away.points += this.pointsForWin; home.lost++;
    } else {
      home.drawn++; home.points += this.pointsForDraw;
      away.drawn++; away.points += this.pointsForDraw;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;

    draft.standings.sort((a, b) =>
      b.points !== a.points ? b.points - a.points :
        b.goalDifference !== a.goalDifference ? b.goalDifference - a.goalDifference :
          b.goalsFor - a.goalsFor,
    );

    return [];
  }

  completedRounds(state: CompetitionState): number {
    const total = new Map<number, number>();
    const done = new Map<number, number>();
    for (const f of state.fixtures) {
      total.set(f.matchday, (total.get(f.matchday) ?? 0) + 1);
      if (f.status === 'completed') { done.set(f.matchday, (done.get(f.matchday) ?? 0) + 1); }
    }
    let count = 0;
    for (const [md, n] of total) {
      if (done.get(md) === n) { count++; }
    }
    return count;
  }

  rescheduleFromState(state: CompetitionState, ctx: FormatContext): ScheduledMatch[] {
    return this.scheduleFor(state.fixtures.filter(f => f.status === 'scheduled'), ctx);
  }

  private scheduleFor(fixtures: CompetitionFixture[], ctx: FormatContext): ScheduledMatch[] {
    return fixtures.map(f => {
      const homeTeam = assertDefined(ctx.teamsById.get(f.homeTeamId), `unknown team '${f.homeTeamId}'`);
      const awayTeam = assertDefined(ctx.teamsById.get(f.awayTeamId), `unknown team '${f.awayTeamId}'`);
      return {
        fixtureId: f.id,
        homeTeam, awayTeam,
        homeStarters: bestXI(homeTeam),
        awayStarters: bestXI(awayTeam),
        scheduledTime: f.scheduledTime,
        knockout: false,
      };
    });
  }
}
