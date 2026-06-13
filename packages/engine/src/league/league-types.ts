// The league read-model is now the `kind: 'league'` case of the unified competition
// model. These aliases keep the historical names working across the codebase.
export type {
  CompetitionStanding as LeagueStanding,
  CompetitionFixture as Fixture,
  CompetitionState as LeagueState,
} from '../competition/competition-types.ts';
