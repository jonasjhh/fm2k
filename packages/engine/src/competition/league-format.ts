import { generateFixtures } from '../league/fixture-generator.ts';
import type {
  CompetitionFormat, FormatContext, MatchOutcome, ScheduledMatch,
} from './competition-format.ts';
import type {
  CompetitionState, CompetitionStanding, CompetitionFixture, LeagueFormatConfig,
} from './competition-types.ts';

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

    const home = draft.standings.find(s => s.teamId === outcome.homeTeamId)!;
    const away = draft.standings.find(s => s.teamId === outcome.awayTeamId)!;

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
    return fixtures.map(f => ({
      fixtureId: f.id,
      homeTeam: ctx.teamsById.get(f.homeTeamId)!,
      awayTeam: ctx.teamsById.get(f.awayTeamId)!,
      scheduledTime: f.scheduledTime,
      knockout: false,
    }));
  }
}
