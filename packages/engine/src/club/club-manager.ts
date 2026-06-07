import { StateManager } from '../state/state-manager.ts';
import type { Player, Formation } from '../shared/types.ts';
import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueStanding } from '../league/league-types.ts';
import type {
  ClubState,
  ClubPlayer,
  FacilityLevel,
  FacilityLevels,
  FinancialTransaction,
} from './club-types.ts';

const FACILITY_UPGRADE_COSTS: Record<number, number> = {
  1: 50_000,
  2: 150_000,
  3: 500_000,
};

const STADIUM_COST_PER_SEAT = 100;
const TICKET_PRICE = 20;
const INJURY_TYPES = ['muscle_strain', 'ankle_sprain', 'knee_injury', 'hamstring_pull'] as const;

export interface ClubManagerConfig {
  readonly clubId: string
  readonly clubName: string
  readonly divisionId: string
  readonly squad: Player[]
  readonly budget: number
  readonly formation: Formation
  readonly startingXI: string[]
  readonly benchPlayers: string[]
  readonly stadiumCapacity: number
  readonly rng?: () => number
}

export class ClubManager {
  private readonly stateManager: StateManager<ClubState>;
  private readonly rng: () => number;

  constructor(config: ClubManagerConfig) {
    this.rng = config.rng ?? Math.random.bind(Math);
    const squad: ClubPlayer[] = config.squad.map(p => ({ ...p, fitness: 100 }));

    this.stateManager = new StateManager<ClubState>({
      clubId: config.clubId,
      clubName: config.clubName,
      divisionId: config.divisionId,
      budget: config.budget,
      squad,
      formation: config.formation,
      startingXI: config.startingXI,
      benchPlayers: config.benchPlayers,
      pendingSubstitutions: [],
      facilities: { medical: 1, training: 1, academy: 1 },
      stadiumCapacity: config.stadiumCapacity,
      financialLog: [],
    });
  }

  getState(): ClubState {
    return this.stateManager.getState();
  }

  subscribe(listener: (state: ClubState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  setFormation(formation: Formation): void {
    this.stateManager.updateState(state => { state.formation = formation; });
  }

  setStartingXI(playerIds: string[]): void {
    this.stateManager.updateState(state => { state.startingXI = playerIds; });
  }

  setBenchPlayers(playerIds: string[]): void {
    this.stateManager.updateState(state => { state.benchPlayers = playerIds; });
  }

  queueSubstitution(playerOutId: string, playerInId: string): void {
    this.stateManager.updateState(state => {
      state.pendingSubstitutions.push({ playerOutId, playerInId });
    });
  }

  clearPendingSubstitutions(): void {
    this.stateManager.updateState(state => { state.pendingSubstitutions = []; });
  }

  getActiveLineup(): Player[] {
    const state = this.stateManager.getState();
    const squadMap = new Map(state.squad.map(p => [p.id, p]));
    const activeIds = new Set(state.startingXI);

    for (const sub of state.pendingSubstitutions) {
      activeIds.delete(sub.playerOutId);
      activeIds.add(sub.playerInId);
    }

    return [...activeIds]
      .map(id => squadMap.get(id))
      .filter((p): p is ClubPlayer => p !== undefined);
  }

  buyPlayer(player: Player, price: number): boolean {
    const state = this.stateManager.getState();
    if (state.budget < price) {return false;}

    const clubPlayer: ClubPlayer = { ...player, fitness: 100 };
    const tx: FinancialTransaction = {
      type: 'transfer_in',
      amount: -price,
      description: `Signed ${player.name}`,
    };

    this.stateManager.updateState(s => {
      s.budget -= price;
      s.squad.push(clubPlayer);
      s.financialLog.push(tx);
    });

    return true;
  }

  sellPlayer(playerId: string, salePrice: number): boolean {
    const state = this.stateManager.getState();
    const player = state.squad.find(p => p.id === playerId);
    if (!player) {return false;}

    const tx: FinancialTransaction = {
      type: 'transfer_out',
      amount: salePrice,
      description: `Sold ${player.name}`,
    };

    this.stateManager.updateState(s => {
      s.budget += salePrice;
      s.squad = s.squad.filter(p => p.id !== playerId);
      s.startingXI = s.startingXI.filter(id => id !== playerId);
      s.benchPlayers = s.benchPlayers.filter(id => id !== playerId);
      s.financialLog.push(tx);
    });

    return true;
  }

  upgradeFacility(facility: keyof FacilityLevels): boolean {
    const state = this.stateManager.getState();
    const currentLevel = state.facilities[facility];
    if (currentLevel >= 4) {return false;}

    const cost = FACILITY_UPGRADE_COSTS[currentLevel];
    if (state.budget < cost) {return false;}

    const tx: FinancialTransaction = {
      type: 'facility_upgrade',
      amount: -cost,
      description: `Upgraded ${facility} to level ${currentLevel + 1}`,
    };

    this.stateManager.updateState(s => {
      s.budget -= cost;
      s.facilities[facility] = (currentLevel + 1) as FacilityLevel;
      s.financialLog.push(tx);
    });

    return true;
  }

  expandStadium(newCapacity: number): boolean {
    const state = this.stateManager.getState();
    if (newCapacity <= state.stadiumCapacity) {return false;}

    const cost = (newCapacity - state.stadiumCapacity) * STADIUM_COST_PER_SEAT;
    if (state.budget < cost) {return false;}

    const tx: FinancialTransaction = {
      type: 'facility_upgrade',
      amount: -cost,
      description: `Expanded stadium to ${newCapacity} capacity`,
    };

    this.stateManager.updateState(s => {
      s.budget -= cost;
      s.stadiumCapacity = newCapacity;
      s.financialLog.push(tx);
    });

    return true;
  }

  // Attendance scales with opponent win rate; returns gate receipt amount
  calculateHomeReceipt(opponentStanding: LeagueStanding): number {
    const { stadiumCapacity } = this.stateManager.getState();
    const winRate = opponentStanding.played > 0
      ? opponentStanding.won / opponentStanding.played
      : 0.5;
    const attendance = Math.floor(stadiumCapacity * (0.4 + 0.4 * winRate));
    return Math.min(attendance, stadiumCapacity) * TICKET_PRICE;
  }

  recordGateReceipt(amount: number, opponentId: string, timestamp: GameDateTime): void {
    this.stateManager.updateState(state => {
      state.budget += amount;
      state.financialLog.push({
        type: 'gate_receipt',
        amount,
        description: `Gate receipt vs ${opponentId}`,
        timestamp,
      });
    });
  }

  handleMatchCompleted(payload: {
    homeTeamId: string
    awayTeamId: string
    homeScore: number
    awayScore: number
    timestamp: GameDateTime
  }): void {
    const state = this.stateManager.getState();
    const isOurMatch =
      payload.homeTeamId === state.clubId || payload.awayTeamId === state.clubId;
    if (!isOurMatch) {return;}

    this.stateManager.updateState(s => {
      const medicalLevel = s.facilities.medical;

      for (const player of s.squad) {
        if (!s.startingXI.includes(player.id)) {continue;}

        // Fitness drain (higher stamina = smaller drain)
        const drain = Math.max(5, 25 - Math.floor(player.attributes.stamina / 2));
        player.fitness = Math.max(0, player.fitness - drain);

        // Injury check (only if currently healthy)
        if (!player.injury) {
          const injuryChance = Math.max(2, 15 - Math.floor(player.attributes.stamina / 2));
          if (this.rng() * 100 < injuryChance) {
            const baseDuration = Math.ceil(this.rng() * 3);
            player.injury = {
              type: INJURY_TYPES[Math.floor(this.rng() * INJURY_TYPES.length)],
              matchesRemaining: Math.max(1, baseDuration - (medicalLevel - 1)),
            };
          }
        }
      }

      // Clear substitutions now that the match is over
      s.pendingSubstitutions = [];
    });
  }

  // Call once per matchday end to tick down injuries, suspensions, and recover fitness
  handleMatchdayComplete(): void {
    this.stateManager.updateState(state => {
      for (const player of state.squad) {
        if (player.injury) {
          player.injury.matchesRemaining--;
          if (player.injury.matchesRemaining <= 0) {
            delete player.injury;
          }
        }

        if (player.suspension) {
          player.suspension.matchesRemaining--;
          if (player.suspension.matchesRemaining <= 0) {
            delete player.suspension;
          }
        }

        // Between-matchday fitness recovery
        player.fitness = Math.min(100, player.fitness + 15);
      }
    });
  }
}
