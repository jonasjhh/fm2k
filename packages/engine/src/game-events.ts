import type { GameDateTime } from '@fm2k/timeline';
import type { InjuryReport } from '@fm2k/match';
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
    // Final per-player energy 0..100 (in-match fatigue); used to drain post-match fitness.
    homeEnergy?: Record<string, number>
    awayEnergy?: Record<string, number>
    // Injuries picked up in the match (pre-mitigation); the club applies medical mitigation.
    homeInjuries?: InjuryReport[]
    awayInjuries?: InjuryReport[]
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
  // Emitted at season end for each player whose attributes changed through training/ageing.
  'player.developed': {
    playerId: string
    playerName: string
    age: number
    // Net per-attribute change this season (only non-zero deltas).
    deltas: Partial<Record<keyof import('@fm2k/match').PlayerAttributes, number>>
  }
  // Emitted at season end when a player retires (for the manager's own club → a user message).
  'player.retired': {
    playerId: string
    playerName: string
    age: number
    ownClub: boolean
  }
  // Emitted when a player changes club (direct bid or AI market activity).
  'player.transferred': {
    playerId: string
    playerName: string
    fromTeamId: string
    toTeamId: string
    fee: number
  }
  // Emitted when a transfer window opens or closes (→ a user notification).
  'transfer.window': {
    open: boolean
    kind: 'pre_season' | 'mid_season'
    timestamp: GameDateTime
  }
  'gate.receipt': {
    amount: number
    opponentId: string
    timestamp: GameDateTime
  }
}
