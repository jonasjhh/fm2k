import { StateManager } from '../state/state-manager.ts';
import { TickEngine, EventLog } from '@fm2k/timeline';
import type { GameDateTime, OccurrenceEvent } from '@fm2k/timeline';
import { MatchOccurrence } from '../match/match-occurrence.ts';
import { generateFixtures } from './fixture-generator.ts';
import type { Team } from '../shared/types.ts';
import type { LeagueState, LeagueStanding, Fixture } from './league-types.ts';

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
  readonly eventsPerMinute?: number
  // Called after standings are updated for each completed match
  readonly onMatchCompleted?: (payload: MatchCompletedPayload) => void
}

export class LeagueManager {
  private readonly engine: TickEngine;
  private readonly stateManager: StateManager<LeagueState>;
  private readonly eventsPerMinute: number;
  private readonly fixturesPerMatchday: number;
  private readonly onMatchCompleted?: (payload: MatchCompletedPayload) => void;

  loadState(state: LeagueState): void {
    this.stateManager.setState(state);
  }

  constructor(config: LeagueManagerConfig) {
    this.eventsPerMinute = config.eventsPerMinute ?? 3;
    this.fixturesPerMatchday = config.teams.length / 2;
    this.onMatchCompleted = config.onMatchCompleted;
    const fixtures = generateFixtures(config.teams, config.startDate);
    const teamMap = new Map(config.teams.map(t => [t.id, t]));

    this.stateManager = new StateManager<LeagueState>({
      name: config.name ?? 'Division One',
      season: config.season ?? '2025/26',
      standings: config.teams.map(t => ({
        teamId: t.id,
        teamName: t.name,
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      })),
      fixtures,
    });

    this.engine = new TickEngine({
      startTime: config.startDate,
      eventLog: new EventLog(),
      onEvents: async (events) => this.handleEvents(events),
    });

    for (const fixture of fixtures) {
      this.engine.schedule(new MatchOccurrence({
        id: fixture.id,
        scheduledTime: fixture.scheduledTime,
        homeTeam: teamMap.get(fixture.homeTeamId)!,
        awayTeam: teamMap.get(fixture.awayTeamId)!,
        eventsPerMinute: this.eventsPerMinute,
      }));
    }
  }

  getState(): LeagueState {
    return this.stateManager.getState();
  }

  subscribe(listener: (state: LeagueState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  hasMoreMatchdays(): boolean {
    return this.engine.hasNext();
  }

  getCompletedMatchdays(): number {
    return Math.floor(
      this.stateManager.getState().fixtures.filter(f => f.status === 'completed').length / this.fixturesPerMatchday,
    );
  }

  async simulateNextMatchday(): Promise<void> {
    const completedBefore = this.getCompletedMatchdays();
    while (this.engine.hasNext()) {
      await this.engine.tickToNext();
      if (this.getCompletedMatchdays() > completedBefore) {break;}
    }
  }

  async simulateFullSeason(): Promise<void> {
    while (this.engine.hasNext()) {
      await this.engine.tickToNext();
    }
  }

  private handleEvents(events: readonly OccurrenceEvent[]): void {
    for (const event of events) {
      if (event.eventType !== 'match.completed') {continue;}

      const { homeTeamId, awayTeamId, homeScore, awayScore } = event.payload as {
        homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number
      };

      let alreadyCompleted = false;
      this.stateManager.updateState(state => {
        const fixtureIdx = state.fixtures.findIndex(f => f.id === event.occurrenceId);
        if (fixtureIdx === -1) {return;}

        // Skip fixtures already marked complete (e.g. state loaded from a save)
        if ((state.fixtures[fixtureIdx] as Fixture).status === 'completed') {
          alreadyCompleted = true;
          return;
        }

        (state.fixtures[fixtureIdx] as Fixture).result = { homeScore, awayScore };
        (state.fixtures[fixtureIdx] as Fixture).status = 'completed';

        const home = state.standings.find(s => s.teamId === homeTeamId)!;
        const away = state.standings.find(s => s.teamId === awayTeamId)!;

        home.played++; away.played++;
        home.goalsFor += homeScore; home.goalsAgainst += awayScore;
        away.goalsFor += awayScore; away.goalsAgainst += homeScore;

        if (homeScore > awayScore) {
          home.won++; home.points += 3; away.lost++;
        } else if (homeScore < awayScore) {
          away.won++; away.points += 3; home.lost++;
        } else {
          home.drawn++; home.points++; away.drawn++; away.points++;
        }

        home.goalDifference = home.goalsFor - home.goalsAgainst;
        away.goalDifference = away.goalsFor - away.goalsAgainst;

        state.standings.sort((a: LeagueStanding, b: LeagueStanding) =>
          b.points !== a.points ? b.points - a.points :
            b.goalDifference !== a.goalDifference ? b.goalDifference - a.goalDifference :
              b.goalsFor - a.goalsFor,
        );
      });

      if (alreadyCompleted) {continue;}

      if (this.onMatchCompleted) {
        const { standings } = this.stateManager.getState();
        this.onMatchCompleted({
          homeTeamId,
          awayTeamId,
          homeScore,
          awayScore,
          timestamp: event.timestamp,
          homeStanding: standings.find(s => s.teamId === homeTeamId)!,
          awayStanding: standings.find(s => s.teamId === awayTeamId)!,
        });
      }
    }
  }
}
