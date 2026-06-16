import { StateManager } from '@fm2k/state';
import { LeagueManager } from '../league/league-manager.ts';
import type { Team } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueState } from '../league/league-types.ts';
import type { SeasonState, DivisionConfig, SeasonHistoryEntry } from './season-types.ts';

export interface SeasonManagerConfig {
  readonly currentSeason: number
  readonly divisions: DivisionConfig[]   // ordered top to bottom
  readonly teamMap: Record<string, Team> // teamId → full Team object
  readonly startDate: GameDateTime
  readonly eventsPerMinute?: number
}

export class SeasonManager {
  private readonly stateManager: StateManager<SeasonState>;
  private leagueManagers: Map<string, LeagueManager>;
  private readonly teamMap: Map<string, Team>;
  private readonly eventsPerMinute: number;

  constructor(config: SeasonManagerConfig) {
    this.eventsPerMinute = config.eventsPerMinute ?? 3;
    this.teamMap = new Map(Object.entries(config.teamMap));

    const clubDivisionMap: Record<string, string> = {};
    for (const div of config.divisions) {
      for (const teamId of div.teamIds) {
        clubDivisionMap[teamId] = div.id;
      }
    }

    this.stateManager = new StateManager<SeasonState>({
      currentSeason: config.currentSeason,
      divisions: config.divisions,
      clubDivisionMap,
      seasonHistory: [],
      phase: 'in_season',
    });

    this.leagueManagers = this.buildLeagueManagers(config.divisions, config.startDate);
  }

  getState(): SeasonState {
    return this.stateManager.getState();
  }

  subscribe(listener: (state: SeasonState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  getLeagueManager(divisionId: string): LeagueManager | undefined {
    return this.leagueManagers.get(divisionId);
  }

  hasMoreMatchdays(): boolean {
    return [...this.leagueManagers.values()].some(lm => lm.hasMoreMatchdays());
  }

  async simulateNextMatchday(): Promise<void> {
    await Promise.all([...this.leagueManagers.values()].map(lm => lm.simulateNextMatchday()));
  }

  async simulateFullSeason(): Promise<void> {
    while (this.hasMoreMatchdays()) {
      await this.simulateNextMatchday();
    }
  }

  endSeason(playerClubId?: string): { promotions: string[]; relegations: string[] } {
    const state = this.stateManager.getState();
    const allPromotions: string[] = [];
    const allRelegations: string[] = [];

    // Archive final standings before computing movements
    const divisionResults: Record<string, LeagueState> = {};
    for (const div of state.divisions) {
      divisionResults[div.id] = this.leagueManagers.get(div.id)!.getState();
    }

    // Process each adjacent pair (div[i] relegates to div[i+1], div[i+1] promotes to div[i])
    const divisions = state.divisions;
    for (let i = 0; i < divisions.length - 1; i++) {
      const upper = divisions[i];
      const lower = divisions[i + 1];

      const upperStandings = divisionResults[upper.id].standings;
      const lowerStandings = divisionResults[lower.id].standings;

      // Bottom N from upper → lower
      const relegated = upperStandings.slice(-upper.relegationSpots).map(s => s.teamId);
      // Top N from lower → upper
      const promoted = lowerStandings.slice(0, lower.promotionSpots).map(s => s.teamId);

      allRelegations.push(...relegated);
      allPromotions.push(...promoted);
    }

    const playerClubDivision = playerClubId
      ? (state.clubDivisionMap[playerClubId] ?? '')
      : '';

    const historyEntry: SeasonHistoryEntry = {
      season: state.currentSeason,
      divisionResults,
      promotions: allPromotions,
      relegations: allRelegations,
      playerClubDivision,
    };

    this.stateManager.updateState(s => {
      // Update clubDivisionMap with movements
      for (const divPair of this.buildMovements(s.divisions, divisionResults)) {
        s.clubDivisionMap[divPair.teamId] = divPair.newDivisionId;
      }
      s.seasonHistory.push(historyEntry);
      s.currentSeason++;
      s.phase = 'post_season';
    });

    return { promotions: allPromotions, relegations: allRelegations };
  }

  startNextSeason(startDate: GameDateTime): void {
    const state = this.stateManager.getState();

    // Rebuild each division's teamIds from the updated clubDivisionMap
    const updatedDivisions: DivisionConfig[] = state.divisions.map(div => ({
      ...div,
      teamIds: Object.entries(state.clubDivisionMap)
        .filter(([, divId]) => divId === div.id)
        .map(([teamId]) => teamId),
    }));

    this.stateManager.updateState(s => {
      s.divisions = updatedDivisions;
      s.phase = 'in_season';
    });

    this.leagueManagers = this.buildLeagueManagers(updatedDivisions, startDate);
  }

  private buildLeagueManagers(divisions: DivisionConfig[], startDate: GameDateTime): Map<string, LeagueManager> {
    const managers = new Map<string, LeagueManager>();
    for (const div of divisions) {
      const teams = div.teamIds.map(id => {
        const team = this.teamMap.get(id);
        if (!team) {throw new Error(`Team ${id} not found in teamMap`);}
        return team;
      });
      managers.set(div.id, new LeagueManager({
        teams,
        startDate,
        name: div.name,
        eventsPerMinute: this.eventsPerMinute,
      }));
    }
    return managers;
  }

  private buildMovements(
    divisions: DivisionConfig[],
    results: Record<string, LeagueState>,
  ): Array<{ teamId: string; newDivisionId: string }> {
    const movements: Array<{ teamId: string; newDivisionId: string }> = [];

    for (let i = 0; i < divisions.length - 1; i++) {
      const upper = divisions[i];
      const lower = divisions[i + 1];

      const upperStandings = results[upper.id].standings;
      const lowerStandings = results[lower.id].standings;

      for (const s of upperStandings.slice(-upper.relegationSpots)) {
        movements.push({ teamId: s.teamId, newDivisionId: lower.id });
      }
      for (const s of lowerStandings.slice(0, lower.promotionSpots)) {
        movements.push({ teamId: s.teamId, newDivisionId: upper.id });
      }
    }

    return movements;
  }
}
