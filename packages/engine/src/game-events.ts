import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueStanding } from './league/league-types.ts';

export type GameEvents = {
  'match.completed': {
    homeTeamId: string
    awayTeamId: string
    homeScore: number
    awayScore: number
    timestamp: GameDateTime
    homeStanding: LeagueStanding
    awayStanding: LeagueStanding
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
