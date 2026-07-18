import { StateManager } from '@fm2k/state';
import type { Player, Formation, PlayerPosition, PlayerGeometry, TeamShapes, Band } from '@fm2k/match';
import type { TeamTacticsIntent, TacticalStyleId, TacticalSliders } from '@fm2k/match';
import {
  defaultIntent, MAX_BAND_SIZE,
  seedShapesFromFormation, effectiveFormationLabel as effectiveFormationLabelOf,
  canonicalGeometry, buildSlotAssignments,
} from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import type { LeagueStanding } from '../league/league-types.ts';
import type {
  ClubState,
  ClubPlayer,
  FinancialTransaction,
  StadiumSectorConfig,
} from './club-types.ts';
import type { EventBus } from '@fm2k/state';
import type { GameEvents } from '../game-events.ts';
import {
  trainOnMatch, DEFAULT_REGIMENT, RECOVERY_REGIMENT_MULT, type RegimentId,
} from '../player/progression.ts';
import {
  churnSquad, attributeDelta, generatorYouthFactory, type YouthFactory, type PlayerDelta,
} from '../world/world-churn.ts';
import { FacilityManager } from './facilities/facility-manager.ts';
import { FACILITY_CATALOGUE } from './facilities/facility-catalogue.ts';
import { createEmptyFacilities } from './facilities/facility-types.ts';
import type {
  ClubFacilities, FacilityGroupId, MaintenanceEvent, OperatingMode, WingId,
} from './facilities/facility-types.ts';

const TICKET_PRICE = 20;

/** Maximum substitutions a club may make in one match. */
export const MAX_SUBS_PER_MATCH = 5;

/** Maximum named substitutes on the bench. Naming subs is optional — 0..9 are all valid. */
export const MAX_BENCH_SIZE = 9;

/** Apply queued substitutions to a slot-ordered XI: each incoming player takes the
 *  outgoing player's slot. Pure — shared by ClubManager.getActiveLineup and the UI
 *  (which renders the on-pitch lineup from ClubState without a manager instance). */
export function applySubstitutions(
  startingXI: readonly (string | null)[],
  subs: readonly { playerOutId: string; playerInId: string }[],
): (string | null)[] {
  const slots = [...startingXI];
  for (const sub of subs) {
    const i = slots.indexOf(sub.playerOutId);
    if (i !== -1) { slots[i] = sub.playerInId; }
  }
  return slots;
}

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
  /** Facilities (wings/staffing); defaults to nothing built (a brand-new club). Pass the
   *  previous season's facilities directly here for a season rollover. */
  readonly facilities?: ClubFacilities
  /** Carried-over finance/development history (a season rollover); defaults to empty (a
   *  brand-new club has no history yet). */
  readonly financialLog?: FinancialTransaction[]
  readonly recentDevelopment?: PlayerDelta[]
  /** Consecutive weekly maintenance ticks the club's budget has ended negative; defaults to 0
   *  (a brand-new club, or a season rollover, starts with no deficit streak). */
  readonly facilityDeficitStreak?: number
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
    this.nationality = config.nationality ?? 'Unknown';
    this.youthFactory = config.youthFactory ?? generatorYouthFactory(this.rng);
    config.eventBus?.on('match.completed', payload => this.processMatchResult(payload));
    const squad: ClubPlayer[] = config.squad.map(p => ({ ...p, fitness: 1000 }));

    this.stateManager = new StateManager<ClubState>({
      clubId: config.clubId,
      clubName: config.clubName,
      divisionId: config.divisionId,
      budget: config.budget,
      squad,
      formation: config.formation,
      tactics: config.tactics ?? defaultIntent(config.formation),
      startingXI: config.startingXI,
      // Pre-cap saves/configs may carry an oversized bench (it used to be unbounded).
      benchPlayers: config.benchPlayers.slice(0, MAX_BENCH_SIZE),
      pendingSubstitutions: [],
      facilities: config.facilities ?? createEmptyFacilities(),
      facilityDeficitStreak: config.facilityDeficitStreak ?? 0,
      stadiumCapacity: config.stadiumCapacity,
      stadiumSectors: config.stadiumSectors,
      financialLog: config.financialLog ?? [],
      recentDevelopment: config.recentDevelopment ?? [],
      seasonStartSnapshot: Object.fromEntries(squad.map(p => [p.id, p.attributes])),
      shapes: null,
    });
  }

  /** Pre-existing saves persisted `startingXI` as a flat, compacted roster (no positional
   *  meaning, no holes). Rebuild it into the slot-ordered, hole-preserving 11-array this
   *  class now relies on throughout — a one-time, idempotent migration (a save already in the
   *  new shape has `startingXI.length === 11` and is left untouched). */
  private migrateStartingXI(state: ClubState): void {
    if (state.startingXI.length === 11) { return; }
    const xiIds = state.startingXI.filter((id): id is string => id !== null);
    state.startingXI = buildSlotAssignments(xiIds, state.benchPlayers, state.squad, state.formation).slice(0, 11);
  }

  loadState(state: ClubState): void {
    this.migrateStartingXI(state);
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
      state.shapes = null;
    });
  }

  setTactics(tactics: TeamTacticsIntent): void {
    this.stateManager.updateState(state => {
      state.tactics = tactics;
      state.formation = tactics.formation;
      state.shapes = null;
    });
  }

  /** The club's shapes, seeding both from the current predefined formation (one anchor per
   *  outfield XI member, in slot order) if not already custom. `fallback`, if given, is
   *  used as the seed instead of recomputing it — callers that already computed the seed
   *  once (to validate before this update) pass it through so it isn't derived twice for
   *  the same state. */
  private ensureShapes(state: ClubState, fallback?: TeamShapes): TeamShapes {
    state.shapes ??= fallback ?? seedShapesFromFormation(state.formation, state.startingXI);
    return state.shapes;
  }

  /** Drop any shape entries for players no longer in the (new) starting XI, and seed
   *  canonical-slot anchors (in both shapes) for any newly assigned outfielder — keeps the
   *  anchor maps exactly in sync with the XI: no ghost entries for players who were
   *  benched/dropped/sold/retired, no missing entries for new arrivals (the match build
   *  derives fielded positions solely from the defending shape's entries). No-op if
   *  `shapes` is null. */
  private syncShapesToXI(state: ClubState): void {
    if (!state.shapes) { return; }
    const canon = canonicalGeometry(state.formation);
    for (const key of ['attacking', 'defending'] as const) {
      const shape = state.shapes[key];
      const next: Record<string, PlayerGeometry> = {};
      state.startingXI.forEach((id, i) => {
        if (!id || i === 0) { return; } // unfilled, or the GK slot (never has an anchor)
        next[id] = shape[id] ?? (canon[i - 1] ? { ...canon[i - 1] } : { band: 'MID', lateral: 0 });
      });
      state.shapes[key] = next;
    }
  }

  /** How many members `shape` has in `band`, excluding `playerId`. */
  private bandCount(shape: Record<string, PlayerGeometry>, band: Exclude<Band, 'GK'>, playerId: string): number {
    return Object.entries(shape).filter(([id, g]) => g.band === band && id !== playerId).length;
  }

  /** Move a starting-XI player's anchor in one shape to a new band/lateral position.
   *  Rejects (returns false, no state change) a move that would push the destination
   *  band's headcount over MAX_BAND_SIZE. The player's effective role label is derived
   *  from the resulting geometry (deriveRolesForShape), never stored. Seeds both shapes
   *  from the current predefined formation on first use. No-op (returns false) if the
   *  player isn't in the starting XI. */
  setPlayerGeometry(shape: keyof TeamShapes, playerId: string, geometry: PlayerGeometry): boolean {
    const state = this.stateManager.getState();
    if (!state.startingXI.includes(playerId)) { return false; }

    const currentShapes = state.shapes ?? seedShapesFromFormation(state.formation, state.startingXI);
    if (this.bandCount(currentShapes[shape], geometry.band, playerId) + 1 > MAX_BAND_SIZE) { return false; }

    this.stateManager.updateState(s => {
      this.ensureShapes(s, currentShapes)[shape][playerId] = { ...geometry };
    });
    return true;
  }

  /** Which predefined Formation (if any) the current layout matches — `shapes` if set
   *  (custom whenever the two shapes differ anywhere), else `formation` as-is. Display-only
   *  (drives UI pill highlighting); never affects how a match is actually built. */
  effectiveFormationLabel(): Formation | 'custom' {
    const state = this.stateManager.getState();
    return effectiveFormationLabelOf(state.formation, state.startingXI, state.shapes);
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

  /** Replace the 11 slot-ordered starting-XI entries (slot 0 = GK; `null` = deliberately
   *  unfilled), then resync the shapes: departures lose their anchors, new arrivals get
   *  their slot's canonical anchor in both shapes (see syncShapesToXI). */
  setStartingXI(slots: (string | null)[]): void {
    this.stateManager.updateState(state => {
      state.startingXI = slots;
      this.syncShapesToXI(state);
    });
  }

  setBenchPlayers(playerIds: string[]): void {
    // Naming subs is optional (an empty bench is valid), but never more than the cap.
    this.stateManager.updateState(state => { state.benchPlayers = playerIds.slice(0, MAX_BENCH_SIZE); });
  }

  /** Set a squad player's training focus (drives their development). */
  setTraining(playerId: string, regiment: RegimentId): void {
    this.stateManager.updateState(state => {
      const player = state.squad.find(p => p.id === playerId);
      if (player) { player.training = regiment; }
    });
  }

  /** Queue an in-match substitution. Enforces the per-match limit and eligibility:
   *  the incoming player must be a fit, unsuspended bench player who hasn't already
   *  been used or taken off; the outgoing player must currently be on the pitch. */
  queueSubstitution(playerOutId: string, playerInId: string): boolean {
    const state = this.stateManager.getState();
    if (state.pendingSubstitutions.length >= MAX_SUBS_PER_MATCH) { return false; }

    const activeIds = new Set(this.getActiveLineup().map(p => p.id));
    if (!activeIds.has(playerOutId) || activeIds.has(playerInId)) { return false; }
    if (!state.benchPlayers.includes(playerInId)) { return false; }
    // A player who already came off cannot return.
    if (state.pendingSubstitutions.some(sub => sub.playerOutId === playerInId)) { return false; }
    const playerIn = state.squad.find(p => p.id === playerInId);
    if (!playerIn || playerIn.injury || playerIn.suspension) { return false; }

    this.stateManager.updateState(s => {
      s.pendingSubstitutions.push({ playerOutId, playerInId });
    });
    return true;
  }

  clearPendingSubstitutions(): void {
    this.stateManager.updateState(state => { state.pendingSubstitutions = []; });
  }

  /** Substitutions remaining this match. */
  subsRemaining(): number {
    return MAX_SUBS_PER_MATCH - this.stateManager.getState().pendingSubstitutions.length;
  }

  /** The XI currently on the pitch, slot-ordered: each substitution replaces the
   *  outgoing player in their startingXI slot, so formation positions carry over. */
  getActiveLineup(): Player[] {
    const state = this.stateManager.getState();
    const squadMap = new Map(state.squad.map(p => [p.id, p]));
    return applySubstitutions(state.startingXI, state.pendingSubstitutions)
      .filter((id): id is string => id !== null)
      .map(id => squadMap.get(id))
      .filter((p): p is ClubPlayer => p !== undefined);
  }

  buyPlayer(player: Player, price: number): boolean {
    const state = this.stateManager.getState();
    if (state.budget < price) {return false;}

    const clubPlayer: ClubPlayer = { ...player, fitness: 1000 };
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
      s.startingXI = s.startingXI.map(id => id === playerId ? null : id);
      s.benchPlayers = s.benchPlayers.filter(id => id !== playerId);
      this.syncShapesToXI(s);
      s.financialLog.push(tx);
    });

    return player;
  }

  /** Build a new wing in a facility group, at tier-1 staffing and full_staff mode. Fails if
   *  already built or the club can't afford `buildCost`. */
  buildWing(group: FacilityGroupId, wingId: WingId): boolean {
    const state = this.stateManager.getState();
    if (state.facilities[group].wings[wingId]) {return false;}

    const def = FACILITY_CATALOGUE[group][wingId];
    if (state.budget < def.buildCost) {return false;}

    const tx: FinancialTransaction = {
      type: 'facility_build',
      amount: -def.buildCost,
      description: `Built ${def.name}`,
    };

    this.stateManager.updateState(s => {
      s.budget -= def.buildCost;
      s.facilities[group].wings[wingId] = {
        mothballed: false, forcedMothball: false,
        mode: 'full_staff', staffTier: 1,
      };
      s.financialLog.push(tx);
    });

    return true;
  }

  /** Tear down a built wing entirely — no refund, mirrors the old facility system having no
   *  downgrade path. Must be rebuilt from scratch (full buildCost) if wanted again. */
  demolishWing(group: FacilityGroupId, wingId: WingId): boolean {
    const state = this.stateManager.getState();
    if (!state.facilities[group].wings[wingId]) {return false;}

    this.stateManager.updateState(s => {
      delete s.facilities[group].wings[wingId];
    });
    return true;
  }

  setWingMode(group: FacilityGroupId, wingId: WingId, mode: OperatingMode): boolean {
    const state = this.stateManager.getState();
    const wing = state.facilities[group].wings[wingId];
    if (!wing) {return false;}

    this.stateManager.updateState(s => {
      const w = s.facilities[group].wings[wingId];
      if (w) { w.mode = mode; }
    });
    return true;
  }

  setWingStaffTier(group: FacilityGroupId, wingId: WingId, staffTier: 1 | 2 | 3): boolean {
    const state = this.stateManager.getState();
    const wing = state.facilities[group].wings[wingId];
    if (!wing) {return false;}

    this.stateManager.updateState(s => {
      const w = s.facilities[group].wings[wingId];
      if (w) { w.staffTier = staffTier; }
    });
    return true;
  }

  /** Voluntarily pause a wing — zero cost, zero effect, staff let go. */
  mothballWing(group: FacilityGroupId, wingId: WingId): boolean {
    const state = this.stateManager.getState();
    const wing = state.facilities[group].wings[wingId];
    if (!wing) {return false;}

    this.stateManager.updateState(s => {
      const w = s.facilities[group].wings[wingId];
      if (w) { w.mothballed = true; }
    });
    return true;
  }

  /** Resume a mothballed wing. If the maintenance system (not the player) had mothballed it,
   *  the next tickFacilityMaintenance call clears its forced-mothball/demolition countdown. */
  unmothballWing(group: FacilityGroupId, wingId: WingId): boolean {
    const state = this.stateManager.getState();
    const wing = state.facilities[group].wings[wingId];
    if (!wing) {return false;}

    this.stateManager.updateState(s => {
      const w = s.facilities[group].wings[wingId];
      if (w) { w.mothballed = false; }
    });
    return true;
  }

  /** Weekly maintenance tick: bills upkeep (budget allowed to go negative), and force-mothballs
   *  every built wing club-wide if the budget has been negative two consecutive ticks — see
   *  FacilityManager.tickMaintenance. */
  tickFacilityMaintenance(): MaintenanceEvent[] {
    const state = this.stateManager.getState();
    const result = FacilityManager.tickMaintenance(state.facilities, state.budget, state.facilityDeficitStreak);

    const tx: FinancialTransaction = {
      type: 'facility_maintenance',
      amount: -result.totalUpkeep,
      description: 'Weekly facility upkeep',
    };

    this.stateManager.updateState(s => {
      s.facilities = result.facilities;
      s.budget -= result.totalUpkeep;
      s.facilityDeficitStreak = result.deficitStreak;
      if (result.totalUpkeep > 0) { s.financialLog.push(tx); }
    });

    return result.events;
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

  /** Credit end-of-season prize money (league placement or cup run) to the budget. */
  recordPrizeMoney(type: 'league_prize' | 'cup_prize', amount: number, description: string, timestamp: GameDateTime): void {
    this.stateManager.updateState(state => {
      state.budget += amount;
      state.financialLog.push({ type, amount, description, timestamp });
    });
  }

  private processMatchResult(payload: GameEvents['match.completed']): void {
    const clubId = this.stateManager.getState().clubId;
    const isOurMatch = payload.homeTeamId === clubId || payload.awayTeamId === clubId;
    if (!isOurMatch) {return;}

    const newInjuries: GameEvents['player.injured'][] = [];
    const clearedInjuries: GameEvents['player.injuryCleared'][] = [];

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
      // Everyone who saw the pitch: the starting XI plus any substitutes who came on.
      const played = new Set<string>(s.startingXI.filter((id): id is string => id !== null));
      for (const sub of s.pendingSubstitutions) { played.add(sub.playerInId); }
      for (const player of s.squad) {
        if (!played.has(player.id)) {continue;}

        const energySpent = ourEnergy?.[player.id] !== undefined
          ? 100 - ourEnergy[player.id]
          : Math.max(5, 25 - Math.floor(player.attributes.stamina / 2));
        player.fitness = Math.max(0, player.fitness - Math.max(0, energySpent) * 10);

        // A played match carries a tiny chance of attribute growth (the per-match training tick).
        const trainingAxes = FacilityManager.trainingAxes(s.facilities, player);
        player.attributes = trainOnMatch(
          player, player.training ?? DEFAULT_REGIMENT, trainingAxes.growthBonus, trainingAxes.ceilingBonus, this.rng,
        );
      }

      for (const inj of ourInjuries ?? []) {
        const player = s.squad.find(p => p.id === inj.playerId);
        if (!player || player.injury) { continue; }
        const medicalAxes = FacilityManager.medicalAxes(s.facilities, player);
        // Medical staff can catch/treat an injury before it ever takes hold — a clean
        // clearance (originalDuration 0), not a distinct "averted" event of its own.
        if (this.rng() >= medicalAxes.injuryChanceMult) {
          clearedInjuries.push({
            playerId: player.id, playerName: player.name, injuryType: inj.type, originalDuration: 0,
          });
          continue;
        }
        const originalDuration = Math.max(1, Math.round(inj.baseDuration - medicalAxes.injuryDurationReduction));
        player.injury = { type: inj.type, matchesRemaining: originalDuration, originalDuration };
        newInjuries.push({
          playerId: player.id,
          playerName: player.name,
          injuryType: player.injury.type,
          matchesRemaining: player.injury.matchesRemaining,
        });
        // The lineup itself is deliberately left untouched: the manager keeps their
        // picked XI, and starting the next match is blocked by validation until the
        // injured starter is replaced (or recovers).
      }

      s.pendingSubstitutions = [];
    });

    for (const inj of newInjuries) {
      this.eventBus?.emit('player.injured', inj);
    }
    for (const cleared of clearedInjuries) {
      this.eventBus?.emit('player.injuryCleared', cleared);
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

  // Call once per matchday end to tick down injuries and suspensions (these count down per
  // match missed, not per calendar day — see recoverFitness() for the time-based counterpart).
  handleMatchdayComplete(): void {
    const cleared: GameEvents['player.injuryCleared'][] = [];
    this.stateManager.updateState(state => {
      for (const player of state.squad) {
        if (player.injury) {
          player.injury.matchesRemaining--;
          if (player.injury.matchesRemaining <= 0) {
            cleared.push({
              playerId: player.id, playerName: player.name,
              injuryType: player.injury.type, originalDuration: player.injury.originalDuration,
            });
            delete player.injury;
          }
        }

        if (player.suspension) {
          player.suspension.matchesRemaining--;
          if (player.suspension.matchesRemaining <= 0) {
            delete player.suspension;
          }
        }
      }
    });
    for (const c of cleared) {
      this.eventBus?.emit('player.injuryCleared', c);
    }
  }

  // Tenths-of-a-point/day; matches the old +15/week baseline at neutral (50) stamina.
  private static readonly FITNESS_RECOVERY_PER_DAY = 150 / 7;

  /** Passive fitness recovery scaled by actual elapsed game-calendar days, and very slightly
   *  by the player's own stamina (fitter players shake off fatigue marginally faster) — a
   *  congested run of fixtures recovers proportionally less than a normal week, a long gap
   *  recovers more. Medical wings (Hydrotherapy, Cryotherapy, etc.) drive the recovery bonus. */
  recoverFitness(days: number): void {
    if (days <= 0) { return; }
    this.stateManager.updateState(state => {
      for (const player of state.squad) {
        const recoveryMult = FacilityManager.medicalAxes(state.facilities, player).recoveryMult;
        // 0.9–1.1x across the stamina range — deliberately tiny, not a tactical decision.
        const staminaMult = 0.9 + 0.2 * Math.max(0, Math.min(1, player.attributes.stamina / 99));
        const regimentMult = player.training === 'recovery' ? RECOVERY_REGIMENT_MULT : 1;
        const recovered = ClubManager.FITNESS_RECOVERY_PER_DAY * days * staminaMult * recoveryMult * regimentMult;
        player.fitness = Math.min(1000, player.fitness + recovered);
      }
    });
  }

  // Call once when a season ends: the whole squad develops (a bigger step than per-match) and ages,
  // veterans may retire, and a *small* academy intake (1–2) joins directly. Emits player.developed
  // for each net change and player.retired (ownClub) for each departure. Returns the retiree
  // positions NOT backfilled in-club (overflow) so the caller can mint them into the free-agent pool.
  handleSeasonComplete(): PlayerPosition[] {
    const state = this.stateManager.getState();
    // Season-end batch development isn't per-player here (unlike the per-match tick above), so
    // GK-only/youth-only training bonuses aren't applied at this granularity yet — a generic
    // outfield, non-youth reference player gives the squad-wide growth/ceiling bonus instead.
    const referencePlayer: Player = {
      id: '', name: '', nationality: this.nationality, age: 99, position: 'CM', potential: 0,
      attributes: state.squad[0]?.attributes ?? {
        speed: 0, strength: 0, stamina: 0, passing: 0, technique: 0,
        finishing: 0, defending: 0, goalkeeping: 0,
      },
    };
    const trainingAxes = FacilityManager.trainingAxes(state.facilities, referencePlayer);
    const result = churnSquad(state.squad, {
      rng: this.rng,
      youthFactory: this.youthFactory,
      nationality: this.nationality,
      growthBonus: trainingAxes.growthBonus,
      ceilingBonus: trainingAxes.ceilingBonus,
      academyBias: FacilityManager.academyBias(state.facilities),
      regimentOf: p => (p as ClubPlayer).training ?? DEFAULT_REGIMENT,
    });

    const retiredIds = new Set(result.retired.map(p => p.id));
    // Youth join as fresh ClubPlayers; carry survivors' club-specific fields as-is.
    const newSquad: ClubPlayer[] = result.squad.map(p => {
      const existing = state.squad.find(s => s.id === p.id);
      return existing ? { ...existing, attributes: p.attributes, age: p.age } : { ...p, fitness: 1000 };
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
      s.startingXI = s.startingXI.map(id => id && retiredIds.has(id) ? null : id);
      s.benchPlayers = s.benchPlayers.filter(id => !retiredIds.has(id));
      this.syncShapesToXI(s);
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
