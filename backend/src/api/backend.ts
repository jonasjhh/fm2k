import { GameSession } from '../app/session.ts';
import type { GameSnapshot, PlayedMatch } from '../app/session.ts';
import type { EditableCountry } from '../domain/editable-country.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import type { SaveData, SaveType } from '../data/save-data.ts';
import type {
  ClubState, LeagueState, TransferListing, Formation, Player, StadiumSectorConfig,
} from '@fm2k/engine';

/** Write side — mutations. Cheap ones return the affected read-model. */
export interface BackendCommands {
  // lifecycle
  startGame(teamId: string, leagueIds: string[]): boolean;
  saveGame(type: SaveType, activeTab?: string): Promise<void>;
  loadGame(save: SaveData): boolean;
  // simulation
  simulateMatchday(): Promise<void>;
  simulateToEnd(): Promise<void>;
  playMatch(): Promise<PlayedMatch | null>;
  // tactics
  toggleXI(id: string): ClubState | null;
  setStartingXI(ids: string[]): ClubState | null;
  setBench(ids: string[]): ClubState | null;
  setFormation(formation: Formation): ClubState | null;
  // transfers
  buyPlayer(listingId: string): boolean;
  sellPlayer(playerId: string): boolean;
  refreshTransfers(): TransferListing[];
  // facilities
  upgradeFacility(key: 'medical' | 'training' | 'academy'): boolean;
  applyStadiumDesign(sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): boolean;
  // pre-game editor
  setEditableCountries(countries: EditableCountry[]): void;
  updateTeamName(teamId: string, name: string): EditableCountry[];
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
  getTransferListings(): TransferListing[];
  getLastMatchResult(): LastMatchResult | null;
  getCurrentMatchday(): number;
  isSeasonComplete(): boolean;
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
    saveGame: (type, activeTab) => s.saveGame(type, activeTab),
    loadGame: (save) => s.loadGame(save),
    simulateMatchday: () => s.simulateMatchday(),
    simulateToEnd: () => s.simulateToEnd(),
    playMatch: () => s.playMatch(),
    toggleXI: (id) => s.toggleXI(id),
    setStartingXI: (ids) => s.setStartingXI(ids),
    setBench: (ids) => s.setBench(ids),
    setFormation: (f) => s.setFormation(f),
    buyPlayer: (id) => s.buyPlayer(id),
    sellPlayer: (id) => s.sellPlayer(id),
    refreshTransfers: () => s.refreshTransfers(),
    upgradeFacility: (key) => s.upgradeFacility(key),
    applyStadiumDesign: (sectors, cost, cap) => s.applyStadiumDesign(sectors, cost, cap),
    setEditableCountries: (c) => s.setEditableCountries(c),
    updateTeamName: (t, n) => s.updateTeamName(t, n),
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
    getTransferListings: () => s.snapshot().transferListings,
    getLastMatchResult: () => s.snapshot().lastMatchResult,
    getCurrentMatchday: () => s.snapshot().currentMatchday,
    isSeasonComplete: () => s.snapshot().seasonComplete,
  };

  const events: BackendEvents = {
    subscribe: (listener) => s.subscribe(listener),
  };

  return { commands, queries, events };
}
