import type { GameDateTime } from '../timeline/game-date-time.js'

export interface LeagueStanding {
  teamId: string
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export interface Fixture {
  readonly id: string
  readonly matchday: number
  readonly homeTeamId: string
  readonly awayTeamId: string
  readonly homeTeamName: string
  readonly awayTeamName: string
  readonly scheduledTime: GameDateTime
  result: { homeScore: number; awayScore: number } | null
  status: 'scheduled' | 'completed'
}

export interface LeagueState {
  name: string
  season: string
  standings: LeagueStanding[]
  fixtures: Fixture[]
}
