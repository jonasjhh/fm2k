/** Summary of the player's most recently played match (for post-match display). */
export interface LastMatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isHome: boolean;
}
