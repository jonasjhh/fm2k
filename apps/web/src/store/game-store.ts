import { create } from 'zustand';
import { createBackend, findTeamById, findDivisionForTeam, findCountryForTeam } from '@fm2k/backend';
import type { SaveData, SaveType, EditableCountry, EditableDivision, LastMatchResult } from '@fm2k/backend';
import type {
  LeagueState, ClubState, TransferListing, Formation, Player, StadiumSectorConfig, MatchEvent,
} from '@fm2k/engine';

// Re-exported so existing '../store/game-store' imports keep resolving.
export { findTeamById, findDivisionForTeam, findCountryForTeam };
export type { EditableCountry, EditableDivision, LastMatchResult };

// ─── types ────────────────────────────────────────────────────────────────────

export type Screen = 'main-menu' | 'team-selection' | 'editor' | 'game';
export type TabId = 'squad' | 'tactics' | 'match' | 'table' | 'fixtures' | 'transfers' | 'facilities' | 'finances';

export interface SimEvent {
  minute: string;
  text: string;
  type: 'goal' | 'card' | 'phase' | 'normal';
}

// ─── the backend (one instance; runs in-browser) ───────────────────────────────

const backend = createBackend();

// ─── store ────────────────────────────────────────────────────────────────────

interface GameStore {
  // navigation (pure UI)
  screen: Screen;
  activeTab: TabId;
  editingTeamId: string | null;

  // cached read-models (mirrors backend.queries.getSnapshot())
  editableCountries: EditableCountry[];
  leagueState: LeagueState | null;
  leagueStates: Record<string, LeagueState>;
  clubState: ClubState | null;
  transferListings: TransferListing[];
  playerTeamId: string | null;
  selectedLeagueIds: string[];
  currentMatchday: number;
  lastMatchResult: LastMatchResult | null;
  seasonComplete: boolean;

  // match animation (pure UI)
  matchSimOverlayOpen: boolean;
  matchSimHeader: string;
  matchSimTime: string;
  matchSimVisibleEvents: SimEvent[];
  matchSimAllEvents: SimEvent[];
  matchSimFinished: boolean;
  skipAnimation: boolean;

  // navigation
  setScreen: (s: Screen) => void;
  setActiveTab: (t: TabId) => void;

  // editor
  setEditingTeamId: (id: string | null) => void;
  updateTeamName: (teamId: string, name: string) => void;
  updateTeamFormation: (teamId: string, formation: Formation) => void;
  updatePlayerData: (teamId: string, playerId: string, data: Omit<Player, 'id'>) => void;
  regeneratePlayer: (teamId: string, playerId: string) => void;
  removePlayer: (teamId: string, playerId: string) => void;
  addGeneratedPlayer: (teamId: string) => void;
  addPlayer: (teamId: string, player: Omit<Player, 'id'>) => void;
  generateFullTeam: (teamId: string) => void;

  // game lifecycle
  startGame: (teamId: string, leagueIds?: string[]) => void;
  startNewSeason: () => void;
  simulateMatchday: () => Promise<void>;
  simulateToEnd: () => Promise<void>;
  saveGame: (type: SaveType) => Promise<void>;
  loadGame: (save: SaveData) => void;

  // match animation
  playMatch: () => Promise<void>;
  requestSkip: () => void;
  continueAfterMatch: () => void;
  appendSimEvent: (event: SimEvent) => void;
  updateSimHeader: (header: string, time: string) => void;
  setMatchSimFinished: () => void;

  // tactics
  toggleXI: (id: string) => void;
  setStartingXI: (ids: string[]) => void;
  setBench: (ids: string[]) => void;
  setFormation: (formation: Formation) => void;

  // transfers
  buyPlayer: (listingId: string) => boolean;
  sellPlayer: (playerId: string) => boolean;
  refreshTransfers: () => void;

  // facilities
  upgradeFacility: (key: string) => boolean;
  applyStadiumDesign: (sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number) => boolean;
}

function simEventsFromMatch(events: MatchEvent[], homeName: string, awayName: string): SimEvent[] {
  return events.map((e) => ({
    minute: `${e.minute}'`,
    text: `[${e.team === 'home' ? homeName : awayName}] ${e.description}`,
    type: e.type === 'goal' ? 'goal'
      : (e.type === 'yellow_card' || e.type === 'red_card') ? 'card'
      : (e.type === 'half_time' || e.type === 'full_time') ? 'phase'
      : 'normal',
  }));
}

export const useGameStore = create<GameStore>((set, get) => {
  // Copy the backend read-model snapshot into the cached store fields.
  const refresh = () => {
    const s = backend.queries.getSnapshot();
    set({
      editableCountries: s.editableCountries,
      leagueState: s.leagueState,
      leagueStates: s.leagueStates,
      clubState: s.clubState,
      transferListings: s.transferListings,
      playerTeamId: s.playerTeamId,
      selectedLeagueIds: s.selectedLeagueIds,
      currentMatchday: s.currentMatchday,
      lastMatchResult: s.lastMatchResult,
      seasonComplete: s.seasonComplete,
    });
  };
  // Any backend state change fans out a cache refresh (eventual consistency).
  backend.events.subscribe(refresh);

  return {
    screen: 'main-menu',
    activeTab: 'squad',
    editingTeamId: null,

    editableCountries: backend.queries.getEditableCountries(),
    leagueState: null,
    leagueStates: {},
    clubState: null,
    transferListings: [],
    playerTeamId: null,
    selectedLeagueIds: [],
    currentMatchday: 0,
    lastMatchResult: null,
    seasonComplete: false,

    matchSimOverlayOpen: false,
    matchSimHeader: '',
    matchSimTime: '',
    matchSimVisibleEvents: [],
    matchSimAllEvents: [],
    matchSimFinished: false,
    skipAnimation: false,

    // ── navigation ────────────────────────────────────────────────────────────
    setScreen: (screen) => set({ screen }),
    setActiveTab: (activeTab) => set({ activeTab }),

    // ── editor ──────────────────────────────────────────────────────────────────
    setEditingTeamId: (id) => set({ editingTeamId: id }),
    updateTeamName: (teamId, name) => { backend.commands.updateTeamName(teamId, name); },
    updateTeamFormation: (teamId, formation) => { backend.commands.updateTeamFormation(teamId, formation); },
    updatePlayerData: (teamId, playerId, data) => { backend.commands.updatePlayerData(teamId, playerId, data); },
    regeneratePlayer: (teamId, playerId) => { backend.commands.regeneratePlayer(teamId, playerId); },
    removePlayer: (teamId, playerId) => { backend.commands.removePlayer(teamId, playerId); },
    addGeneratedPlayer: (teamId) => { backend.commands.addGeneratedPlayer(teamId); },
    addPlayer: (teamId, player) => { backend.commands.addPlayer(teamId, player); },
    generateFullTeam: (teamId) => { backend.commands.generateFullTeam(teamId); },

    // ── game lifecycle ──────────────────────────────────────────────────────────
    startGame: (teamId, leagueIds) => {
      const resolved = leagueIds ?? get().selectedLeagueIds;
      if (backend.commands.startGame(teamId, resolved)) {
        set({ screen: 'game', activeTab: 'squad' });
        refresh();
      }
    },

    startNewSeason: () => {
      if (backend.commands.startNewSeason()) { refresh(); }
    },

    saveGame: async (type) => { await backend.commands.saveGame(type, get().activeTab); },

    loadGame: (save) => {
      if (backend.commands.loadGame(save)) {
        set({ screen: 'game', activeTab: save.activeTab as TabId });
        refresh();
      }
    },

    simulateMatchday: async () => { await backend.commands.simulateMatchday(); },
    simulateToEnd: async () => { await backend.commands.simulateToEnd(); },

    // ── match animation ─────────────────────────────────────────────────────────
    playMatch: async () => {
      const played = await backend.commands.playMatch();
      if (!played) { return; }
      const { homeTeamName, awayTeamName, keyEvents } = played;
      const allSimEvents = simEventsFromMatch(keyEvents, homeTeamName, awayTeamName);

      set({
        matchSimOverlayOpen: true,
        matchSimHeader: `${homeTeamName}  0 – 0  ${awayTeamName}`,
        matchSimTime: 'Kick off',
        matchSimVisibleEvents: [],
        matchSimAllEvents: allSimEvents,
        matchSimFinished: false,
        skipAnimation: false,
      });

      await new Promise<void>((resolve) => {
        let idx = 0;
        const step = () => {
          if (get().skipAnimation || idx >= keyEvents.length) { resolve(); return; }
          const e = keyEvents[idx++];
          const rs = e.resultingState;
          get().appendSimEvent(allSimEvents[idx - 1]);
          get().updateSimHeader(`${homeTeamName}  ${rs.homeScore} – ${rs.awayScore}  ${awayTeamName}`, `${e.minute}'`);
          setTimeout(step, 200);
        };
        step();
      });

      const result = get().lastMatchResult;
      if (result) {
        get().appendSimEvent({
          minute: '',
          text: `FULL TIME — ${homeTeamName} ${result.homeScore}–${result.awayScore} ${awayTeamName}`,
          type: 'phase',
        });
        get().updateSimHeader(
          `${homeTeamName}  ${result.homeScore} – ${result.awayScore}  ${awayTeamName}`,
          'Full Time',
        );
      }
      set({ matchSimFinished: true });
    },

    requestSkip: () => set({ skipAnimation: true }),
    continueAfterMatch: () => set({ matchSimOverlayOpen: false }),
    appendSimEvent: (event) => set(s => ({ matchSimVisibleEvents: [...s.matchSimVisibleEvents, event] })),
    updateSimHeader: (header, time) => set({ matchSimHeader: header, matchSimTime: time }),
    setMatchSimFinished: () => set({ matchSimFinished: true }),

    // ── tactics ─────────────────────────────────────────────────────────────────
    toggleXI: (id) => { backend.commands.toggleXI(id); },
    setStartingXI: (ids) => { backend.commands.setStartingXI(ids); },
    setBench: (ids) => { backend.commands.setBench(ids); },
    setFormation: (formation) => { backend.commands.setFormation(formation); },

    // ── transfers ───────────────────────────────────────────────────────────────
    buyPlayer: (listingId) => backend.commands.buyPlayer(listingId),
    sellPlayer: (playerId) => backend.commands.sellPlayer(playerId),
    refreshTransfers: () => { backend.commands.refreshTransfers(); },

    // ── facilities ────────────────────────────────────────────────────────────��
    upgradeFacility: (key) => backend.commands.upgradeFacility(key as 'medical' | 'training' | 'academy'),
    applyStadiumDesign: (sectors, cost, newCapacity) => backend.commands.applyStadiumDesign(sectors, cost, newCapacity),
  };
});
