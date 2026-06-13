/** Summary of the player's most recently played match (for post-match display). */
export interface LastMatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isHome: boolean;
  /** Competition + knockout outcome context (cup matches). */
  competitionId?: string;
  roundLabel?: string;
  decidedBy?: 'normal' | 'extra_time' | 'penalties';
  shootout?: { home: number; away: number };
  winnerTeamId?: string;
}
