import { StateManager } from '@fm2k/state';
import type { Player, Formation, Position } from '@fm2k/match';
import type { TeamTacticsIntent, TacticalStyleId, TacticalSliders } from '@fm2k/match';
import { defaultIntent } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueStanding } from '../league/league-types.ts';
import type {
  ClubState,
  ClubPlayer,
  FacilityLevel,
  FacilityLevels,
  FinancialTransaction,
  StadiumSectorConfig,
} from './club-types.ts';
import type { EventBus } from '@fm2k/state';
import type { GameEvents } from '../game-events.ts';
import {
  trainOnMatch, DEFAULT_REGIMENT, type RegimentId,
} from '../player/progression.ts';
import {
  churnSquad, attributeDelta, generatorYouthFactory, type YouthFactory, type PlayerDelta,
} from '../world/world-churn.ts';

const FACILITY_UPGRADE_COSTS: Record<number, number> = {
  1: 50_000,
  2: 150_000,
  3: 500_000,
};

const TICKET_PRICE = 20;

export interface ClubManagerConfig {
  readonly clubId: string
  readonly clubName: string
  readonly divisionId: string
  readonly squad: Player[]
  readonly budget: number
  readonly formation: Formation
  readonly tactics?: TeamTacticsIntent
  readonly startingXI: string[]
  readonly benchPlayers: string[]
  readonly stadiumCapacity: number
  readonly stadiumSectors: Record<string, StadiumSectorConfig>
  readonly rng?: () => number
  readonly eventBus?: EventBus<GameEvents>
  /** Club nationality, used when generating academy youth at season end. */
  readonly nationality?: string
  /** Injected youth factory; falls back to a default `PlayerGenerator`-backed one. */
  readonly youthFactory?: YouthFactory
  /** Facility levels; defaults to all-level-1 (a brand-new club). Pass the previous season's
   *  levels directly here for a season rollover — there's no post-construction setter. */
  readonly facilities?: FacilityLevels
  /** Carried-over finance/development history (a season rollover); defaults to empty (a
   *  brand-new club has no history yet). */
  readonly financialLog?: FinancialTransaction[]
  readonly recentDevelopment?: PlayerDelta[]
}

export class ClubManager {
  private readonly stateManager: StateManager<ClubState>;
  private readonly rng: () => number;
  private readonly eventBus?: EventBus<GameEvents>;
  private readonly nationality: string;
  private readonly youthFactory: YouthFactory;

  constructor(config: ClubManagerConfig) {
    this.rng = config.rng ?? Math.random.bind(Math);
    this.eventBus = config.eventBus;
    this.nationality = config.nationality ?? 'unknown';
    this.youthFactory = config.youthFactory ?? generatorYouthFactory(this.rng);
    config.eventBus?.on('match.completed', payload => this.processMatchResult(payload));
    const squad: ClubPlayer[] = config.squad.map(p => ({ ...p, fitness: 100 }));

    this.stateManager = new StateManager<ClubState>({
      clubId: config.clubId,
      clubName: config.clubName,
      divisionId: config.divisionId,
      budget: config.budget,
      squad,
      formation: config.formation,
      tactics: config.tactics ?? defaultIntent(config.formation),
      startingXI: config.startingXI,
      benchPlayers: config.benchPlayers,
      pendingSubstitutions: [],
      facilities: config.facilities ?? { medical: 1, training: 1, academy: 1 },
      stadiumCapacity: config.stadiumCapacity,
      stadiumSectors: config.stadiumSectors,
      financialLog: config.financialLog ?? [],
      recentDevelopment: config.recentDevelopment ?? [],
      seasonStartSnapshot: Object.fromEntries(squad.map(p => [p.id, p.attributes])),
    });
  }

  loadState(state: ClubState): void {
    this.stateManager.setState(state);
  }

  getState(): ClubState {
    return this.stateManager.getState();
  }

  subscribe(listener: (state: ClubState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  setFormation(formation: Formation): void {
    this.stateManager.updateState(state => {
      state.formation = formation;
      state.tactics = { ...state.tactics, formation };
    });
  }

  setTactics(tactics: TeamTacticsIntent): void {
    this.stateManager.updateState(state => {
      state.tactics = tactics;
      state.formation = tactics.formation;
    });
  }

  setStyle(style: TacticalStyleId): void {
    this.stateManager.updateState(state => {
      state.tactics = { ...state.tactics, style };
    });
  }

  setSliders(sliders: Partial<TacticalSliders>): void {
    this.stateManager.updateState(state => {
      state.tactics = { ...state.tactics, sliders: { ...state.tactics.sliders, ...sliders } };
    });
  }

  setStartingXI(playerIds: string[]): void {
    this.stateManager.updateState(state => { state.startingXI = playerIds; });
  }

  setBenchPlayers(playerIds: string[]): void {
    this.stateManager.updateState(state => { state.benchPlayers = playerIds; });
  }

  /** Set a squad player's training focus (drives their development). */
  setTraining(playerId: string, regiment: RegimentId): void {
    this.stateManager.updateState(state => {
      const player = state.squad.find(p => p.id === playerId);
      if (player) { player.training = regiment; }
    });
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

  /** Sell a player: removes them, credits the fee, and returns the removed player (or null). */
  sellPlayer(playerId: string, salePrice: number): ClubPlayer | null {
    const state = this.stateManager.getState();
    const player = state.squad.find(p => p.id === playerId);
    if (!player) {return null;}

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

    return player;
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

  applyStadiumDesign(
    sectors: Record<string, StadiumSectorConfig>,
    cost: number,
    newCapacity: number,
  ): boolean {
    const state = this.stateManager.getState();
    if (state.budget < cost) {return false;}

    const tx: FinancialTransaction = {
      type: 'facility_upgrade',
      amount: -cost,
      description: `Stadium renovation (${newCapacity.toLocaleString()} seats)`,
    };

    this.stateManager.updateState(s => {
      s.budget -= cost;
      s.stadiumCapacity = newCapacity;
      s.stadiumSectors = sectors;
      s.financialLog.push(tx);
    });

    return true;
  }

  // Attendance scales with both teams' league positions; returns gate receipt amount.
  calculateHomeReceipt(
    opponentStanding?: LeagueStanding,
    positions?: { ownPosition?: number; opponentPosition?: number; leagueSize?: number },
  ): number {
    const { stadiumCapacity } = this.stateManager.getState();
    const n = positions?.leagueSize ?? 16;
    const norm = Math.max(1, n - 1);

    let opponentFactor: number;
    if (positions?.opponentPosition !== undefined) {
      opponentFactor = (n - positions.opponentPosition) / norm;
    } else if (opponentStanding && opponentStanding.played > 0) {
      opponentFactor = opponentStanding.won / opponentStanding.played;
    } else {
      opponentFactor = 0.5;
    }

    const ownFactor = positions?.ownPosition !== undefined
      ? (n - positions.ownPosition) / norm
      : 0.5;

    const fillRate = Math.min(0.95, 0.4 + 0.4 * opponentFactor + 0.2 * ownFactor);
    return Math.floor(stadiumCapacity * fillRate) * TICKET_PRICE;
  }

  recordGateReceipt(amount: number, opponent: string, timestamp: GameDateTime): void {
    this.stateManager.updateState(state => {
      state.budget += amount;
      state.financialLog.push({
        type: 'gate_receipt',
        amount,
        description: `Gate receipt vs ${opponent}`,
        timestamp,
      });
    });
  }

  private processMatchResult(payload: GameEvents['match.completed']): void {
    const clubId = this.stateManager.getState().clubId;
    const isOurMatch = payload.homeTeamId === clubId || payload.awayTeamId === clubId;
    if (!isOurMatch) {return;}

    const newInjuries: GameEvents['player.injured'][] = [];

    // Energy our players ended the match on (in-match fatigue), if reported. Drain
    // fitness by the energy actually spent; fall back to a stamina-based estimate.
    const ourEnergy = payload.homeTeamId === clubId ? payload.homeEnergy
      : payload.awayTeamId === clubId ? payload.awayEnergy
        : undefined;
    // Injuries are generated by the match (from stamina/workload); the club only applies
    // medical-facility mitigation to their duration.
    const ourInjuries = payload.homeTeamId === clubId ? payload.homeInjuries
      : payload.awayTeamId === clubId ? payload.awayInjuries
        : undefined;

    this.stateManager.updateState(s => {
      const medicalLevel = s.facilities.medical;
      const trainingLevel = s.facilities.training;

      for (const player of s.squad) {
        if (!s.startingXI.includes(player.id)) {continue;}

        const energySpent = ourEnergy?.[player.id] !== undefined
          ? 100 - ourEnergy[player.id]
          : Math.max(5, 25 - Math.floor(player.attributes.stamina / 2));
        player.fitness = Math.max(0, player.fitness - Math.max(0, energySpent));

        // A played match carries a tiny chance of attribute growth (the per-match training tick).
        player.attributes = trainOnMatch(player, player.training ?? DEFAULT_REGIMENT, trainingLevel, this.rng);
      }

      for (const inj of ourInjuries ?? []) {
        const player = s.squad.find(p => p.id === inj.playerId);
        if (!player || player.injury) { continue; }
        player.injury = {
          type: inj.type,
          matchesRemaining: Math.max(1, inj.baseDuration - (medicalLevel - 1)),
        };
        newInjuries.push({
          playerId: player.id,
          playerName: player.name,
          injuryType: player.injury.type,
          matchesRemaining: player.injury.matchesRemaining,
        });
      }

      s.pendingSubstitutions = [];
    });

    for (const inj of newInjuries) {
      this.eventBus?.emit('player.injured', inj);
    }

    if (payload.homeTeamId === clubId) {
      const receipt = this.calculateHomeReceipt(payload.awayStanding, {
        ownPosition: payload.homePosition,
        opponentPosition: payload.awayPosition,
        leagueSize: payload.leagueSize,
      });
      this.recordGateReceipt(receipt, payload.awayTeamName ?? payload.awayTeamId, payload.timestamp);
      this.eventBus?.emit('gate.receipt', { amount: receipt, opponentId: payload.awayTeamId, timestamp: payload.timestamp });
    }
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

  // Call once when a season ends: the whole squad develops (a bigger step than per-match) and ages,
  // veterans may retire, and a *small* academy intake (1–2) joins directly. Emits player.developed
  // for each net change and player.retired (ownClub) for each departure. Returns the retiree
  // positions NOT backfilled in-club (overflow) so the caller can mint them into the free-agent pool.
  handleSeasonComplete(): Position[] {
    const state = this.stateManager.getState();
    const result = churnSquad(state.squad, {
      rng: this.rng,
      youthFactory: this.youthFactory,
      nationality: this.nationality,
      trainingLevel: state.facilities.training,
      academyLevel: state.facilities.academy,
      regimentOf: p => (p as ClubPlayer).training ?? DEFAULT_REGIMENT,
    });

    const retiredIds = new Set(result.retired.map(p => p.id));
    // Youth join as fresh ClubPlayers; carry survivors' club-specific fields as-is.
    const newSquad: ClubPlayer[] = result.squad.map(p => {
      const existing = state.squad.find(s => s.id === p.id);
      return existing ? { ...existing, attributes: p.attributes, age: p.age } : { ...p, fitness: 100 };
    });

    // The full season's development: per-match training (already baked into `state.squad` by
    // `processMatchResult` throughout the season) plus this season-end batch — diffed against the
    // snapshot taken at the start of the season, not just churnSquad's narrower pre-batch delta.
    const fullSeasonDevelopment: PlayerDelta[] = [];
    for (const p of result.squad) {
      const before = state.seasonStartSnapshot[p.id];
      if (!before) { continue; } // joined mid-season (transfer/youth intake) — no baseline to diff against
      const deltas = attributeDelta(before, p.attributes);
      if (Object.keys(deltas).length > 0) {
        fullSeasonDevelopment.push({ playerId: p.id, playerName: p.name, age: p.age, deltas });
      }
    }

    this.stateManager.updateState(s => {
      s.squad = newSquad;
      s.startingXI = s.startingXI.filter(id => !retiredIds.has(id));
      s.benchPlayers = s.benchPlayers.filter(id => !retiredIds.has(id));
      s.recentDevelopment = fullSeasonDevelopment;
      s.seasonStartSnapshot = Object.fromEntries(newSquad.map(p => [p.id, p.attributes]));
    });

    for (const ev of fullSeasonDevelopment) {
      this.eventBus?.emit('player.developed', ev);
    }
    for (const r of result.retired) {
      this.eventBus?.emit('player.retired', { playerId: r.id, playerName: r.name, age: r.age, ownClub: true });
    }
    return result.overflow;
  }
}
