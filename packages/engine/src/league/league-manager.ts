import { CompetitionManager } from '../competition/competition-manager.ts';
import { LeagueFormat } from '../competition/league-format.ts';
import type { Team } from '../shared/types.ts';
import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueState, LeagueStanding } from './league-types.ts';
import type { EventBus } from '@fm2k/state';
import type { GameEvents } from '../game-events.ts';

export interface MatchCompletedPayload {
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  timestamp: GameDateTime
  homeStanding: LeagueStanding
  awayStanding: LeagueStanding
}

export interface LeagueManagerConfig {
  readonly teams: Team[]
  readonly startDate: GameDateTime
  readonly name?: string
  readonly season?: string
  readonly competitionId?: string
  readonly eventsPerMinute?: number
  readonly eventBus?: EventBus<GameEvents>
}

/**
 * Backwards-compatible facade over {@link CompetitionManager} running a
 * {@link LeagueFormat}. Preserves the historical method names so existing callers
 * and tests are unaffected by the competition-abstraction migration.
 */
export class LeagueManager {
  private readonly manager: CompetitionManager;

  constructor(config: LeagueManagerConfig) {
    this.manager = new CompetitionManager({
      format: new LeagueFormat(),
      teams: config.teams,
      startDate: config.startDate,
      competitionId: config.competitionId ?? config.name ?? 'league',
      name: config.name ?? 'Division One',
      season: config.season ?? '2025/26',
      eventsPerMinute: config.eventsPerMinute,
      eventBus: config.eventBus,
    });
  }

  loadState(state: LeagueState): void { this.manager.loadState(state); }

  getState(): LeagueState { return this.manager.getState(); }

  subscribe(listener: (state: LeagueState) => void): () => void {
    return this.manager.subscribe(listener);
  }

  hasMoreMatchdays(): boolean { return this.manager.hasNext(); }

  getCompletedMatchdays(): number { return this.manager.completedRounds(); }

  async simulateNextMatchday(): Promise<void> { return this.manager.simulateNextRound(); }

  async simulateFullSeason(): Promise<void> { return this.manager.simulateFullSeason(); }
}
