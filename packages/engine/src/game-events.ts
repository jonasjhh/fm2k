import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueStanding } from './league/league-types.ts';

export type GameEvents = {
  'match.completed': {
    homeTeamId: string
    awayTeamId: string
    homeTeamName?: string
    awayTeamName?: string
    homeScore: number
    awayScore: number
    timestamp: GameDateTime
    // League matches carry both standings; knockout matches omit them.
    homeStanding?: LeagueStanding
    awayStanding?: LeagueStanding
    // Competition context + knockout outcome details.
    competitionId?: string
    roundLabel?: string
    winnerTeamId?: string
    decidedBy?: 'normal' | 'extra_time' | 'penalties'
    shootout?: { home: number; away: number }
  }
  'player.injured': {
    playerId: string
    playerName: string
    injuryType: string
    matchesRemaining: number
  }
  'player.recovered': {
    playerId: string
    playerName: string
  }
  'gate.receipt': {
    amount: number
    opponentId: string
    timestamp: GameDateTime
  }
}
