import { create } from 'zustand';
import { showToast } from '@fm2k/toast';
import { createBackend, findTeamById, findDivisionForTeam, findCountryForTeam } from '@fm2k/backend';
import type { SaveData, SaveType, EditableCountry, EditableDivision, LastMatchResult, AnimEvent, PauseReason } from '@fm2k/backend';
import type {
  LeagueState, CompetitionState, CompetitionFixture, LiveMatch, ClubState, TransferListing,
  Formation, Player, StadiumSectorConfig, GameDateTime, TeamColors,
  TeamTacticsIntent, TacticalStyleId, TacticalSliders, RegimentId, TransferWindow,
  FormationPosition, Band, FacilityGroupId, WingId, OperatingMode,
  MatchInsight, MatchStatistics,
} from '@fm2k/engine';
import type { Article } from '@fm2k/newspaper';

// Re-exported so existing '../store/game-store' imports keep resolving.
export { findTeamById, findDivisionForTeam, findCountryForTeam };
export type { EditableCountry, EditableDivision, LastMatchResult };

// ─── types ────────────────────────────────────────────────────────────────────

export type Screen = 'main-menu' | 'team-selection' | 'editor' | 'game';
export type TabId = 'squad' | 'tactics' | 'training' | 'match' | 'table' | 'fixtures' | 'transfers' | 'club' | 'finances' | 'newspaper';

const TAB_IDS: readonly TabId[] = ['squad', 'tactics', 'training', 'match', 'table', 'fixtures', 'transfers', 'club', 'finances', 'newspaper'];
const toTabId = (s: string): TabId => (TAB_IDS as readonly string[]).includes(s) ? s as TabId : 'squad';

export interface SimEvent {
  minute: string;
  text: string;
  type: 'goal' | 'card' | 'penalty' | 'phase' | 'normal';
}

export const SIM_DELAY_MIN = 0;
export const SIM_DELAY_MAX = 250;
export const SIM_DELAY_DEFAULT = 220;

const SIM_DELAY_KEY = 'fm2k-sim-delay';

/** Streaming chunk length (game minutes): the granularity at which a user pause lands. */
const STREAM_CHUNK_MINUTES = 5;

/** User-initiated pauses allowed per match (half-time and red-card stops don't count). */
export const MAX_PAUSES_PER_MATCH = 3;

const clampDelay = (ms: number) => Math.min(SIM_DELAY_MAX, Math.max(SIM_DELAY_MIN, ms));

function loadSimDelay(): number {
  if (typeof window === 'undefined') { return SIM_DELAY_DEFAULT; }
  const v = Number(window.localStorage.getItem(SIM_DELAY_KEY));
  return Number.isFinite(v) && window.localStorage.getItem(SIM_DELAY_KEY) !== null
    ? clampDelay(v) : SIM_DELAY_DEFAULT;
}

function simEventFromAnim(e: AnimEvent, homeName: string, awayName: string): SimEvent {
  return {
    minute: `${e.minute}'`,
    text: `[${e.team === 'home' ? homeName : awayName}] ${e.description}`,
    type: e.type === 'goal' ? 'goal'
      : (e.type === 'yellow_card' || e.type === 'red_card') ? 'card'
      : e.type === 'penalty' ? 'penalty'
      : (e.type === 'half_time' || e.type === 'full_time') ? 'phase'
      : 'normal',
  };
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
  cupStates: Record<string, CompetitionState>;
  liveMatches: LiveMatch[];
  focusFixture: CompetitionFixture | null;
  focusLive: LiveMatch | null;
  now: GameDateTime | null;
  clubState: ClubState | null;
  transferListings: TransferListing[];
  freeAgents: Player[];
  transferWindow: TransferWindow;
  playerTeamId: string | null;
  selectedLeagueIds: string[];
  currentMatchday: number;
  lastMatchResult: LastMatchResult | null;
  /** Ranked post-match insights for the player's most recent match (strongest first). */
  lastMatchInsights: MatchInsight[];
  /** Full statistics of the player's most recent completed match (post-match stat sheet). */
  lastMatchStatistics: MatchStatistics | null;
  /** Tactical read at the interval of the current live match (cleared on resume). */
  halfTimeInsights: MatchInsight[];
  seasonComplete: boolean;
  /** Newspaper articles still within their retention window (the backend already prunes expired ones). */
  headlines: Article[];

  // match centre (pure UI)
  matchEvents: SimEvent[];        // newest-first ticker for the focus match
  isStreaming: boolean;
  /** Set by the Pause button while streaming; the chunk loop stops at the next boundary. */
  pauseRequested: boolean;
  /** User-initiated pauses spent on the current match (budget: MAX_PAUSES_PER_MATCH). */
  pausesUsed: number;
  /** Why the last advance segment stopped (drives the "Paused — red card" style banner). */
  lastPauseReason: PauseReason | null;
  streamHome: number;
  streamAway: number;
  streamMinute: number;
  simDelayMs: number;

  // navigation
  setScreen: (s: Screen) => void;
  setActiveTab: (t: TabId) => void;
  /** Return to the main menu, discarding the current game (if any) and any pre-game
   *  edits — the menu always implies fresh default data. */
  goToMainMenu: () => void;

  // editor
  setEditingTeamId: (id: string | null) => void;
  updateTeamName: (teamId: string, name: string) => void;
  updateTeamColors: (teamId: string, colors: TeamColors) => void;
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
  simulateToEnd: () => Promise<void>;
  saveGame: (type: SaveType) => Promise<void>;
  loadGame: (save: SaveData) => void;

  // match centre (the game clock)
  advanceMatch: () => Promise<void>;   // auto-stream to the next intermission
  pauseMatch: () => void;              // stop streaming at the next chunk boundary
  skipMatch: () => Promise<void>;      // skip current match to full time
  goToNextMatch: () => void;           // focus the next fixture
  setSimDelay: (ms: number) => void;

  // tactics
  toggleXI: (id: string) => void;
  setStartingXI: (slots: (string | null)[]) => void;
  setBench: (ids: string[]) => void;
  setFormation: (formation: Formation) => void;
  setTactics: (intent: TeamTacticsIntent) => void;
  setStyle: (style: TacticalStyleId) => void;
  setSliders: (sliders: Partial<TacticalSliders>) => void;
  setTraining: (playerId: string, regiment: RegimentId) => void;
  setPlayerGeometry: (playerId: string, geometry: { band: Exclude<Band, 'GK'>; lateral: number }) => void;
  setPlayerRole: (playerId: string, role: FormationPosition) => void;
  setEmptySlotRole: (slotIndex: number, role: FormationPosition) => void;
  /** Queue an in-match substitution; false when rejected (limit reached, ineligible). */
  queueSubstitution: (playerOutId: string, playerInId: string) => boolean;

  // transfers
  buyPlayer: (listingId: string) => boolean;
  sellPlayer: (playerId: string) => boolean;
  bidForPlayer: (teamId: string, playerId: string, amount: number) => boolean;
  signPlayer: (playerId: string) => boolean;
  getAskingPrice: (teamId: string, playerId: string) => number | null;
  refreshTransfers: () => void;

  // facilities
  buildWing: (group: FacilityGroupId, wingId: WingId) => boolean;
  demolishWing: (group: FacilityGroupId, wingId: WingId) => boolean;
  setWingMode: (group: FacilityGroupId, wingId: WingId, mode: OperatingMode) => boolean;
  setWingStaffTier: (group: FacilityGroupId, wingId: WingId, staffTier: 1 | 2 | 3) => boolean;
  mothballWing: (group: FacilityGroupId, wingId: WingId) => boolean;
  unmothballWing: (group: FacilityGroupId, wingId: WingId) => boolean;
  applyStadiumDesign: (sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number) => boolean;
}

// Track which backend notifications have already been shown as toasts.
let lastSeenNotificationId = 0;

export const useGameStore = create<GameStore>((set, get) => {
  // Copy the backend read-model snapshot into the cached store fields.
  const refresh = () => {
    const s = backend.queries.getSnapshot();
    for (const n of s.notifications) {
      if (n.id > lastSeenNotificationId) {
        lastSeenNotificationId = n.id;
        showToast(n.message, n.type);
      }
    }
    set({
      editableCountries: s.editableCountries,
      leagueState: s.leagueState,
      leagueStates: s.leagueStates,
      cupStates: s.cupStates,
      liveMatches: s.liveMatches,
      focusFixture: s.focusFixture,
      focusLive: s.focusLive,
      now: s.now,
      clubState: s.clubState,
      transferListings: s.transferListings,
      freeAgents: s.freeAgents,
      transferWindow: backend.queries.getTransferWindow(),
      playerTeamId: s.playerTeamId,
      selectedLeagueIds: s.selectedLeagueIds,
      currentMatchday: s.currentMatchday,
      lastMatchResult: s.lastMatchResult,
      lastMatchInsights: s.lastMatchInsights,
      lastMatchStatistics: s.lastMatchStatistics,
      seasonComplete: s.seasonComplete,
      headlines: s.headlines,
    });
  };
  // Any backend state change fans out a cache refresh (eventual consistency).
  backend.events.subscribe(refresh);

  // Reveal one match's animation events newest-first, pacing by sim speed and
  // updating the live scoreboard as goals land.
  const animate = async (events: AnimEvent[], homeName: string, awayName: string) => {
    const delay = get().simDelayMs;
    for (const e of events) {
      set(st => ({
        matchEvents: [simEventFromAnim(e, homeName, awayName), ...st.matchEvents],
        streamHome: e.homeScore,
        streamAway: e.awayScore,
        streamMinute: e.minute,
      }));
      if (delay > 0) { await new Promise(r => setTimeout(r, delay)); }
    }
  };

  return {
    screen: 'main-menu',
    activeTab: 'squad',
    editingTeamId: null,

    editableCountries: backend.queries.getEditableCountries(),
    leagueState: null,
    leagueStates: {},
    cupStates: {},
    liveMatches: [],
    focusFixture: null,
    focusLive: null,
    now: null,
    clubState: null,
    transferListings: [],
    freeAgents: [],
    transferWindow: { open: false, kind: null, closesOnMatchday: null },
    playerTeamId: null,
    selectedLeagueIds: [],
    currentMatchday: 0,
    lastMatchResult: null,
    lastMatchInsights: [],
    lastMatchStatistics: null,
    halfTimeInsights: [],
    seasonComplete: false,
    headlines: [],

    matchEvents: [],
    isStreaming: false,
    pauseRequested: false,
    pausesUsed: 0,
    lastPauseReason: null,
    streamHome: 0,
    streamAway: 0,
    streamMinute: 0,
    simDelayMs: loadSimDelay(),

    // ── navigation ────────────────────────────────────────────────────────────
    setScreen: (screen) => set({ screen }),
    setActiveTab: (activeTab) => set({ activeTab }),
    goToMainMenu: () => {
      backend.commands.resetSession();
      set({ screen: 'main-menu' });
      refresh();
    },

    // ── editor ──────────────────────────────────────────────────────────────────
    setEditingTeamId: (id) => set({ editingTeamId: id }),
    updateTeamName: (teamId, name) => { backend.commands.updateTeamName(teamId, name); },
    updateTeamColors: (teamId, colors) => { backend.commands.updateTeamColors(teamId, colors); },
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
        set({ screen: 'game', activeTab: toTabId(save.activeTab) });
        refresh();
      }
    },

    simulateToEnd: async () => {
      set({ isStreaming: true });
      await backend.commands.simulateToEnd();
      set({ isStreaming: false, matchEvents: [] });
    },

    // ── match centre (the game clock) ─────────────────────────────────────────────
    advanceMatch: async () => {
      if (get().isStreaming) { return; }
      // Starting a fresh match clears the previous ticker and restores the pause budget.
      if (get().focusLive === null && get().focusFixture?.status !== 'completed') {
        set({ matchEvents: [], streamHome: 0, streamAway: 0, streamMinute: 0, pausesUsed: 0 });
      }
      set({ isStreaming: true, pauseRequested: false, lastPauseReason: null, halfTimeInsights: [] });
      // Advance in short chunks so a user pause takes effect at the next boundary.
      // Chunk boundaries never interrupt a simulated minute, so where the pauses fall
      // has no effect on the rng stream (same seed ⇒ same match).
      let r = await backend.commands.advanceToNextStop({ maxMinutes: STREAM_CHUNK_MINUTES });
      await animate(r.events, r.homeTeamName, r.awayTeamName);
      while (r.pauseReason === 'chunk' && !get().pauseRequested) {
        r = await backend.commands.advanceToNextStop({ maxMinutes: STREAM_CHUNK_MINUTES });
        await animate(r.events, r.homeTeamName, r.awayTeamName);
      }
      set({
        isStreaming: false,
        pauseRequested: false,
        lastPauseReason: r.pauseReason,
        halfTimeInsights: r.halfTimeInsights ?? [],
        streamHome: r.homeScore,
        streamAway: r.awayScore,
      });
    },

    pauseMatch: () => {
      const st = get();
      if (st.pauseRequested || st.pausesUsed >= MAX_PAUSES_PER_MATCH) { return; }
      set({ pauseRequested: true, pausesUsed: st.pausesUsed + 1 });
    },

    skipMatch: async () => {
      if (get().isStreaming) { return; }
      set({ isStreaming: true });
      const r = await backend.commands.skipToFullTime();
      // Show the resulting events without pacing.
      const evs = r.events.map(e => simEventFromAnim(e, r.homeTeamName, r.awayTeamName)).reverse();
      set({ isStreaming: false, matchEvents: evs, streamHome: r.homeScore, streamAway: r.awayScore });
    },

    goToNextMatch: () => {
      backend.commands.nextMatch();
      set({ matchEvents: [], streamHome: 0, streamAway: 0, streamMinute: 0, pausesUsed: 0 });
    },

    setSimDelay: (ms) => {
      const simDelayMs = clampDelay(ms);
      if (typeof window !== 'undefined') { window.localStorage.setItem(SIM_DELAY_KEY, String(simDelayMs)); }
      set({ simDelayMs });
    },

    // ── tactics ─────────────────────────────────────────────────────────────────
    toggleXI: (id) => { backend.commands.toggleXI(id); },
    setStartingXI: (slots) => { backend.commands.setStartingXI(slots); },
    setBench: (ids) => { backend.commands.setBench(ids); },
    setFormation: (formation) => { backend.commands.setFormation(formation); },
    setTactics: (intent) => { backend.commands.setTactics(intent); },
    setPlayerGeometry: (playerId, geometry) => { backend.commands.setPlayerGeometry(playerId, geometry); },
    setPlayerRole: (playerId, role) => { backend.commands.setPlayerRole(playerId, role); },
    setEmptySlotRole: (slotIndex, role) => { backend.commands.setEmptySlotRole(slotIndex, role); },
    queueSubstitution: (playerOutId, playerInId) => backend.commands.queueSubstitution(playerOutId, playerInId),
    setTraining: (playerId, regiment) => { backend.commands.setTraining(playerId, regiment); },
    setStyle: (style) => {
      const cs = get().clubState;
      if (cs) { backend.commands.setTactics({ ...cs.tactics, style }); }
    },
    setSliders: (sliders) => {
      const cs = get().clubState;
      if (cs) { backend.commands.setTactics({ ...cs.tactics, sliders: { ...cs.tactics.sliders, ...sliders } }); }
    },

    // ── transfers ───────────────────────────────────────────────────────────────
    buyPlayer: (listingId) => backend.commands.buyPlayer(listingId),
    sellPlayer: (playerId) => backend.commands.sellPlayer(playerId),
    bidForPlayer: (teamId, playerId, amount) => backend.commands.bidForPlayer(teamId, playerId, amount),
    signPlayer: (playerId) => backend.commands.signPlayer(playerId),
    getAskingPrice: (teamId, playerId) => backend.queries.getAskingPrice(teamId, playerId),
    refreshTransfers: () => { backend.commands.refreshTransfers(); },

    // ── facilities ────────────────────────────────────────────────────────────��
    buildWing: (group, wingId) => backend.commands.buildWing(group, wingId),
    demolishWing: (group, wingId) => backend.commands.demolishWing(group, wingId),
    setWingMode: (group, wingId, mode) => backend.commands.setWingMode(group, wingId, mode),
    setWingStaffTier: (group, wingId, staffTier) => backend.commands.setWingStaffTier(group, wingId, staffTier),
    mothballWing: (group, wingId) => backend.commands.mothballWing(group, wingId),
    unmothballWing: (group, wingId) => backend.commands.unmothballWing(group, wingId),
    applyStadiumDesign: (sectors, cost, newCapacity) => backend.commands.applyStadiumDesign(sectors, cost, newCapacity),
  };
});
