import type { LeagueState } from '../league/league-types.ts';

export interface DivisionConfig {
  id: string
  name: string
  teamIds: string[]
  promotionSpots: number   // top N promoted to the division above (0 for top division)
  relegationSpots: number  // bottom N relegated to the division below (0 for bottom division)
}

export interface SeasonHistoryEntry {
  season: number
  divisionResults: Record<string, LeagueState>  // divisionId → final standings + fixtures
  promotions: string[]   // team IDs promoted
  relegations: string[]  // team IDs relegated
  playerClubDivision: string
}

export interface SeasonState {
  currentSeason: number
  divisions: DivisionConfig[]        // ordered top to bottom; index 0 = top tier
  clubDivisionMap: Record<string, string>  // clubId → divisionId
  seasonHistory: SeasonHistoryEntry[]
  phase: 'pre_season' | 'in_season' | 'post_season'
}
