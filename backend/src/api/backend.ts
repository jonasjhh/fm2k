import { GameSession } from '../app/session.ts';
import type { GameSnapshot, AdvanceResult, GameNotification } from '../app/session.ts';
import type { EditableCountry } from '../domain/editable-country.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import type { SaveData, SaveType } from '../data/save-data.ts';
import type {
  ClubState, LeagueState, CompetitionState, LiveMatch, TransferListing, Formation, Player,
  StadiumSectorConfig, GameDateTime, TeamColors, TeamTacticsIntent, MatchInsight, RegimentId,
  TransferWindow, PlayerGeometry, TeamShapes, FacilityGroupId, WingId, OperatingMode, FormationPosition,
} from '@fm2k/engine';

/** Write side — mutations. Cheap ones return the affected read-model. */
export interface BackendCommands {
  // lifecycle
  startGame(teamId: string, leagueIds: string[]): boolean;
  startNewSeason(): boolean;
  saveGame(type: SaveType, activeTab?: string): Promise<void>;
  loadGame(save: SaveData): boolean;
  /** Discard the current game (if any) and any pre-game edits, returning to a fresh
   *  default world — call when the player returns to the main menu. */
  resetSession(): void;
  // simulation (the game clock)
  advanceToNextStop(opts?: { maxMinutes?: number }): Promise<AdvanceResult>;
  skipToFullTime(): Promise<AdvanceResult>;
  nextMatch(): void;
  simulateToEnd(): Promise<void>;
  // tactics
  toggleXI(id: string): ClubState | null;
  setStartingXI(slots: (string | null)[]): ClubState | null;
  setBench(ids: string[]): ClubState | null;
  setFormation(formation: Formation): ClubState | null;
  setTactics(intent: TeamTacticsIntent): ClubState | null;
  setTraining(playerId: string, regiment: RegimentId): ClubState | null;
  /** Move a starting-XI player to a new band/lateral position (free positioning). */
  setPlayerGeometry(shape: keyof TeamShapes, playerId: string, geometry: PlayerGeometry): ClubState | null;
  /** Pin a player's role label (e.g. LW playing as ST). Pass null to remove the override. */
  setRoleOverride(playerId: string, role: FormationPosition | null): ClubState | null;
  /** Queue an in-match substitution (validated: per-match limit, bench eligibility, fitness). */
  queueSubstitution(playerOutId: string, playerInId: string): boolean;
  // transfers
  buyPlayer(listingId: string): boolean;
  sellPlayer(playerId: string): boolean;
  bidForPlayer(teamId: string, playerId: string, amount: number): boolean;
  /** One-click signing of any player in the world (free agent or club player) at the asking price. */
  signPlayer(playerId: string): boolean;
  refreshTransfers(): TransferListing[];
  // facilities
  buildWing(group: FacilityGroupId, wingId: WingId): boolean;
  demolishWing(group: FacilityGroupId, wingId: WingId): boolean;
  setWingMode(group: FacilityGroupId, wingId: WingId, mode: OperatingMode): boolean;
  setWingStaffTier(group: FacilityGroupId, wingId: WingId, staffTier: 1 | 2 | 3): boolean;
  mothballWing(group: FacilityGroupId, wingId: WingId): boolean;
  unmothballWing(group: FacilityGroupId, wingId: WingId): boolean;
  applyStadiumDesign(sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): boolean;
  // pre-game editor
  setEditableCountries(countries: EditableCountry[]): void;
  updateTeamName(teamId: string, name: string): EditableCountry[];
  updateTeamColors(teamId: string, colors: TeamColors): EditableCountry[];
  updateTeamFormation(teamId: string, formation: Formation): EditableCountry[];
  updatePlayerData(teamId: string, playerId: string, data: Partial<Player>): EditableCountry[];
  regeneratePlayer(teamId: string, playerId: string): EditableCountry[];
  removePlayer(teamId: string, playerId: string): EditableCountry[];
  addGeneratedPlayer(teamId: string): EditableCountry[];
  addPlayer(teamId: string, player: Omit<Player, 'id'>): EditableCountry[];
  generateFullTeam(teamId: string): EditableCountry[];
}

/** Read side — never mutates. */
export interface BackendQueries {
  getSnapshot(): GameSnapshot;
  getEditableCountries(): EditableCountry[];
  getClubState(): ClubState | null;
  getLeagueState(): LeagueState | null;
  getLeagueStates(): Record<string, LeagueState>;
  getCupStates(): Record<string, CompetitionState>;
  getCupState(nationId: string): CompetitionState | null;
  getNow(): GameDateTime;
  getLiveMatches(): LiveMatch[];
  getTransferListings(): TransferListing[];
  /** The free-agent pool (browsable as part of the whole playerbase). */
  getFreeAgents(): Player[];
  getLastMatchResult(): LastMatchResult | null;
  getLastMatchInsights(): MatchInsight[];
  getCurrentMatchday(): number;
  isSeasonComplete(): boolean;
  getNotifications(): GameNotification[];
  /** Fee another club would demand for a player (null if not found). */
  getAskingPrice(teamId: string, playerId: string): number | null;
  getTransferWindow(): TransferWindow;
}

/** Domain event stream — subscribe to refresh read-models after any change. */
export interface BackendEvents {
  subscribe(listener: () => void): () => void;
}

export interface Backend {
  commands: BackendCommands;
  queries: BackendQueries;
  events: BackendEvents;
}

/** Create a backend instance (owns a single GameSession). */
export function createBackend(): Backend {
  const s = new GameSession();

  const commands: BackendCommands = {
    startGame: (teamId, leagueIds) => s.startGame(teamId, leagueIds),
    startNewSeason: () => s.startNewSeason(),
    saveGame: (type, activeTab) => s.saveGame(type, activeTab),
    loadGame: (save) => s.loadGame(save),
    resetSession: () => s.resetSession(),
    advanceToNextStop: (...args) => s.advanceToNextStop(...args),
    skipToFullTime: () => s.skipToFullTime(),
    nextMatch: () => s.nextMatch(),
    simulateToEnd: () => s.simulateToEnd(),
    toggleXI: (id) => s.toggleXI(id),
    setStartingXI: (slots) => s.setStartingXI(slots),
    setBench: (ids) => s.setBench(ids),
    setFormation: (f) => s.setFormation(f),
    setTactics: (intent) => s.setTactics(intent),
    setTraining: (playerId, regiment) => s.setTraining(playerId, regiment),
    setPlayerGeometry: (shape: keyof TeamShapes, playerId: string, geometry: PlayerGeometry) => s.setPlayerGeometry(shape, playerId, geometry),
    setRoleOverride: (playerId: string, role: FormationPosition | null) => s.setRoleOverride(playerId, role),
    queueSubstitution: (playerOutId, playerInId) => s.queueSubstitution(playerOutId, playerInId),
    buyPlayer: (id) => s.buyPlayer(id),
    sellPlayer: (id) => s.sellPlayer(id),
    bidForPlayer: (teamId, playerId, amount) => s.bidForPlayer(teamId, playerId, amount),
    signPlayer: (playerId) => s.signPlayer(playerId),
    refreshTransfers: () => s.refreshTransfers(),
    buildWing: (group, wingId) => s.buildWing(group, wingId),
    demolishWing: (group, wingId) => s.demolishWing(group, wingId),
    setWingMode: (group, wingId, mode) => s.setWingMode(group, wingId, mode),
    setWingStaffTier: (group, wingId, staffTier) => s.setWingStaffTier(group, wingId, staffTier),
    mothballWing: (group, wingId) => s.mothballWing(group, wingId),
    unmothballWing: (group, wingId) => s.unmothballWing(group, wingId),
    applyStadiumDesign: (sectors, cost, cap) => s.applyStadiumDesign(sectors, cost, cap),
    setEditableCountries: (c) => s.setEditableCountries(c),
    updateTeamName: (t, n) => s.updateTeamName(t, n),
    updateTeamColors: (t, c) => s.updateTeamColors(t, c),
    updateTeamFormation: (t, f) => s.updateTeamFormation(t, f),
    updatePlayerData: (t, p, d) => s.updatePlayerData(t, p, d),
    regeneratePlayer: (t, p) => s.regeneratePlayer(t, p),
    removePlayer: (t, p) => s.removePlayer(t, p),
    addGeneratedPlayer: (t) => s.addGeneratedPlayer(t),
    addPlayer: (t, p) => s.addPlayer(t, p),
    generateFullTeam: (t) => s.generateFullTeam(t),
  };

  const queries: BackendQueries = {
    getSnapshot: () => s.snapshot(),
    getEditableCountries: () => s.getEditableCountries(),
    getClubState: () => s.snapshot().clubState,
    getLeagueState: () => s.snapshot().leagueState,
    getLeagueStates: () => s.snapshot().leagueStates,
    getCupStates: () => s.snapshot().cupStates,
    getCupState: (nationId) => s.snapshot().cupStates[`${nationId}-cup`] ?? null,
    getNow: () => s.getNow(),
    getLiveMatches: () => s.liveMatches(),
    getTransferListings: () => s.snapshot().transferListings,
    getFreeAgents: () => s.getFreeAgents(),
    getLastMatchResult: () => s.snapshot().lastMatchResult,
    getLastMatchInsights: () => s.snapshot().lastMatchInsights,
    getCurrentMatchday: () => s.snapshot().currentMatchday,
    isSeasonComplete: () => s.snapshot().seasonComplete,
    getNotifications: () => s.snapshot().notifications,
    getAskingPrice: (teamId, playerId) => s.askingPriceFor(teamId, playerId),
    getTransferWindow: () => s.getTransferWindow(),
  };

  const events: BackendEvents = {
    subscribe: (listener) => s.subscribe(listener),
  };

  return { commands, queries, events };
}
