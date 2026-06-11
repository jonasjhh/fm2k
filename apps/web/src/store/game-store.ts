import { create } from 'zustand';
import {
  LeagueManager, ClubManager, TransferManager, PlayerGenerator,
  MatchSimulator, EventBus,
  COUNTRY_IDS, COUNTRY_DATA, getAllDivisions, calculateOverall, v4 as uuidv4,
} from '@fm2k/engine';
import type {
  Team, Player, PlayerAttributes, Formation, Position,
  LeagueState, ClubState, TransferListing, TransferState, GameDateTime, MatchEvent,
  StructuredDivision, CountryId, StadiumSectorConfig, GameEvents,
} from '@fm2k/engine';
import {
  BUDGET_START, STADIUM_START, SEASON_START, ALL_POSITIONS,
} from '../constants';
import { DEFAULT_STADIUM_SECTORS, calculateTotalCapacity } from '../utils/stadium';
import { sellPrice } from '../utils/calculations';
import { writeSave, SAVE_VERSION, type SaveData, type SaveType } from './save-data';

// ─── helpers ─────────────────────────────────────────────────────────────────

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function scaleAttributes(attrs: PlayerAttributes, targetOvr: number): PlayerAttributes {
  const currentOvr = calculateOverall(attrs);
  const scale = targetOvr / (currentOvr * 5);
  const result = {} as PlayerAttributes;
  for (const [k, v] of Object.entries(attrs)) {
    (result as unknown as Record<string, number>)[k] = Math.max(40, Math.min(99, Math.round(v * scale * 5)));
  }
  return result;
}

// ─── editable country types ───────────────────────────────────────────────────

export interface EditableCountry {
  id: CountryId;
  name: string;         // display name: "Norway", "England", etc.
  nationality: string;  // demonym: "norwegian", "english", etc.
  divisions: EditableDivision[];
}

export interface EditableDivision extends StructuredDivision {}

// ─── country hierarchy helpers ────────────────────────────────────────────────

function buildEditableCountries(): EditableCountry[] {
  return COUNTRY_IDS.map(id => {
    const data = COUNTRY_DATA[id];
    return {
      id,
      name: data.country,
      nationality: data.nationality,
      divisions: getAllDivisions(data),
    };
  });
}

function mapTeam(
  countries: EditableCountry[],
  teamId: string,
  fn: (t: Team) => Team,
): EditableCountry[] {
  return countries.map(c => ({
    ...c,
    divisions: c.divisions.map(d => ({
      ...d,
      teams: d.teams.map(t => t.id === teamId ? fn(t) : t),
    })),
  }));
}

export function findTeamById(countries: EditableCountry[], teamId: string): Team | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      const t = d.teams.find(t => t.id === teamId);
      if (t) {return t;}
    }
  }
  return null;
}

export function findDivisionForTeam(countries: EditableCountry[], teamId: string): EditableDivision | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      if (d.teams.some(t => t.id === teamId)) {return d;}
    }
  }
  return null;
}

export function findCountryForTeam(countries: EditableCountry[], teamId: string): EditableCountry | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      if (d.teams.some(t => t.id === teamId)) {return c;}
    }
  }
  return null;
}

// ─── types ────────────────────────────────────────────────────────────────────

export type Screen = 'main-menu' | 'team-selection' | 'editor' | 'game';
export type TabId = 'squad' | 'tactics' | 'match' | 'table' | 'fixtures' | 'transfers' | 'facilities' | 'finances';

export interface LastMatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isHome: boolean;
}

export interface SimEvent {
  minute: string;
  text: string;
  type: 'goal' | 'card' | 'phase' | 'normal';
}

// ─── store ────────────────────────────────────────────────────────────────────

interface GameStore {
  // navigation
  screen: Screen;
  activeTab: TabId;

  // pre-game data
  editableCountries: EditableCountry[];
  editingTeamId: string | null;

  // engine instances
  leagueManager: LeagueManager | null;
  leagueManagers: Record<string, LeagueManager>;
  clubManager: ClubManager | null;
  transferManager: TransferManager | null;
  playerGenerator: PlayerGenerator;

  // reactive snapshots
  leagueState: LeagueState | null;
  leagueStates: Record<string, LeagueState>;
  clubState: ClubState | null;
  transferListings: TransferListing[];

  // game state
  playerTeamId: string | null;
  selectedLeagueIds: string[];
  currentMatchday: number;
  lastMatchResult: LastMatchResult | null;
  seasonComplete: boolean;

  // match animation
  matchSimOverlayOpen: boolean;
  matchSimHeader: string;
  matchSimTime: string;
  matchSimVisibleEvents: SimEvent[];
  matchSimAllEvents: SimEvent[];
  matchSimFinished: boolean;
  skipAnimation: boolean;

  // ── navigation ──────────────────────────────────────────────────────────────
  setScreen: (s: Screen) => void;
  setActiveTab: (t: TabId) => void;

  // ── editor actions ──────────────────────────────────────────────────────────
  setEditingTeamId: (id: string | null) => void;
  updateTeamName: (teamId: string, name: string) => void;
  updateTeamFormation: (teamId: string, formation: Formation) => void;
  updatePlayerData: (teamId: string, playerId: string, data: Omit<Player, 'id'>) => void;
  regeneratePlayer: (teamId: string, playerId: string) => void;
  removePlayer: (teamId: string, playerId: string) => void;
  addGeneratedPlayer: (teamId: string) => void;
  addPlayer: (teamId: string, player: Omit<Player, 'id'>) => void;
  generateFullTeam: (teamId: string) => void;

  // ── game lifecycle ──────────────────────────────────────────────────────────
  startGame: (teamId: string, leagueIds?: string[]) => void;
  startNewSeason: () => void;
  simulateMatchday: () => Promise<void>;
  simulateToEnd: () => Promise<void>;
  saveGame: (type: SaveType) => Promise<void>;
  loadGame: (save: SaveData) => void;

  // ── match animation ─────────────────────────────────────────────────────────
  playMatch: () => Promise<void>;
  requestSkip: () => void;
  continueAfterMatch: () => void;
  appendSimEvent: (event: SimEvent) => void;
  updateSimHeader: (header: string, time: string) => void;
  setMatchSimFinished: () => void;

  // ── tactics ─────────────────────────────────────────────────────────────────
  toggleXI: (id: string) => void;
  setStartingXI: (ids: string[]) => void;
  setBench: (ids: string[]) => void;
  setFormation: (formation: Formation) => void;

  // ── transfers ───────────────────────────────────────────────────────────────
  buyPlayer: (listingId: string) => boolean;
  sellPlayer: (playerId: string) => boolean;
  refreshTransfers: () => void;

  // ── facilities ──────────────────────────────────────────────────────────────
  upgradeFacility: (key: string) => boolean;
  applyStadiumDesign: (sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number) => boolean;

}

// ─── manager factory ─────────────────────────────────────────────────────────

let _eventBusCleanup: (() => void) | null = null;

function buildManagers(
  editableCountries: EditableCountry[],
  teamId: string,
  leagueIds: string[],
  playerGenerator: PlayerGenerator,
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  const team = findTeamById(editableCountries, teamId);
  const division = findDivisionForTeam(editableCountries, teamId);
  if (!team || !division) {return { leagueManagers: {}, leagueManager: null, clubManager: null, transferManager: null };}

  // Ensure the player's nation is always included even if not in leagueIds
  const playerCountry = findCountryForTeam(editableCountries, teamId);
  const allLeagueIds = playerCountry && !leagueIds.includes(playerCountry.id)
    ? [...leagueIds, playerCountry.id]
    : leagueIds;

  _eventBusCleanup?.();
  const eventBus = new EventBus<GameEvents>();

  _eventBusCleanup = eventBus.on('match.completed', (payload) => {
    const { playerTeamId } = get();
    const isHome = payload.homeTeamId === playerTeamId;
    const isAway = payload.awayTeamId === playerTeamId;
    if (!isHome && !isAway) {return;}
    set({ lastMatchResult: { homeTeamId: payload.homeTeamId, awayTeamId: payload.awayTeamId, homeScore: payload.homeScore, awayScore: payload.awayScore, isHome } });
  });

  // Create a LeagueManager for every division across all selected nations
  const leagueManagers: Record<string, LeagueManager> = {};
  for (const countryId of allLeagueIds) {
    const country = editableCountries.find(c => c.id === countryId);
    if (!country) {continue;}
    for (const div of country.divisions) {
      leagueManagers[div.id] = new LeagueManager({
        teams: div.teams,
        startDate: SEASON_START as GameDateTime,
        eventsPerMinute: 3,
        // Only wire the EventBus to the player's own division
        eventBus: div.id === division.id ? eventBus : undefined,
      });
    }
  }
  const leagueManager = leagueManagers[division.id];

  const defaultSectors = DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>;
  const clubManager = new ClubManager({
    clubId: team.id,
    clubName: team.name,
    divisionId: division.id,
    squad: [...team.starters, ...team.substitutes],
    budget: BUDGET_START,
    formation: team.formation,
    startingXI: team.starters.slice(0, 11).map(p => p.id),
    benchPlayers: team.substitutes.map(p => p.id),
    stadiumCapacity: calculateTotalCapacity(defaultSectors) || STADIUM_START,
    stadiumSectors: defaultSectors,
    eventBus,
  });

  const transferManager = new TransferManager({
    marketSize: 15,
    playerFactory: () => {
      const pos = ALL_POSITIONS[Math.floor(Math.random() * ALL_POSITIONS.length)] as Position;
      const gen = playerGenerator.generatePlayer(pos, 1, 20);
      return { ...gen, id: uuidv4(), attributes: scaleAttributes(gen.attributes, 65) };
    },
  });

  return { leagueManagers, leagueManager, clubManager, transferManager };
}

// ─── sync helper ─────────────────────────────────────────────────────────────

function syncEngineState(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  const { leagueManager, leagueManagers, clubManager, transferManager, currentMatchday } = get();
  const leagueStates: Record<string, LeagueState> = {};
  for (const [id, mgr] of Object.entries(leagueManagers)) {
    leagueStates[id] = mgr.getState();
  }
  set({
    leagueState: leagueManager?.getState() ?? null,
    leagueStates,
    clubState: clubManager?.getState() ?? null,
    transferListings: transferManager?.getActiveListings(currentMatchday) ?? [],
  });
}

// ─── store creation ───────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'main-menu',
  activeTab: 'squad',

  editableCountries: deepCopy(buildEditableCountries()),
  editingTeamId: null,

  leagueManager: null,
  leagueManagers: {},
  clubManager: null,
  transferManager: null,
  playerGenerator: new PlayerGenerator(),

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

  // ── navigation ──────────────────────────────────────────────────────────────

  setScreen: (screen) => set({ screen }),
  setActiveTab: (activeTab) => set({ activeTab }),

  // ── editor ──────────────────────────────────────────────────────────────────

  setEditingTeamId: (id) => set({ editingTeamId: id }),

  updateTeamName: (teamId, name) =>
    set(s => ({
      editableCountries: mapTeam(s.editableCountries, teamId,
        t => ({ ...t, name: name.trim() || t.name })),
    })),

  updateTeamFormation: (teamId, formation) =>
    set(s => ({
      editableCountries: mapTeam(s.editableCountries, teamId,
        t => ({ ...t, formation })),
    })),

  updatePlayerData: (teamId, playerId, data) =>
    set(s => ({
      editableCountries: mapTeam(s.editableCountries, teamId, t => {
        const upd = (list: Player[]) =>
          list.map(p => p.id === playerId ? { ...p, ...data } : p);
        return { ...t, starters: upd(t.starters), substitutes: upd(t.substitutes) };
      }),
    })),

  regeneratePlayer: (teamId, playerId) =>
    set(s => {
      const { playerGenerator } = s;
      return {
        editableCountries: mapTeam(s.editableCountries, teamId, t => {
          const upd = (list: Player[]) =>
            list.map(p => {
              if (p.id !== playerId) {return p;}
              const q = Math.round(calculateOverall(p.attributes));
              const gen = playerGenerator.generatePlayer(p.position, 1, 20);
              return { ...p, name: gen.name, attributes: scaleAttributes(gen.attributes, q) };
            });
          return { ...t, starters: upd(t.starters), substitutes: upd(t.substitutes) };
        }),
      };
    }),

  removePlayer: (teamId, playerId) =>
    set(s => ({
      editableCountries: mapTeam(s.editableCountries, teamId, t => ({
        ...t,
        starters: t.starters.filter(p => p.id !== playerId),
        substitutes: t.substitutes.filter(p => p.id !== playerId),
      })),
    })),

  addGeneratedPlayer: (teamId) =>
    set(s => {
      const { playerGenerator, editableCountries } = s;
      const nationality = findCountryForTeam(editableCountries, teamId)?.nationality ?? 'unknown';
      const pos = ALL_POSITIONS[Math.floor(Math.random() * ALL_POSITIONS.length)] as Position;
      const gen = playerGenerator.generatePlayer(pos, 1, 20);
      const newPlayer: Player = { ...gen, id: uuidv4(), nationality, attributes: scaleAttributes(gen.attributes, 70) };
      return {
        editableCountries: mapTeam(editableCountries, teamId, t => ({
          ...t, starters: [...t.starters, newPlayer],
        })),
      };
    }),

  addPlayer: (teamId, player) =>
    set(s => ({
      editableCountries: mapTeam(s.editableCountries, teamId, t => ({
        ...t, starters: [...t.starters, { ...player, id: uuidv4() }],
      })),
    })),

  generateFullTeam: (teamId) =>
    set(s => {
      const { playerGenerator, editableCountries } = s;
      const nationality = findCountryForTeam(editableCountries, teamId)?.nationality ?? 'unknown';
      const make = (position: Position, quality: number): Player => {
        const gen = playerGenerator.generatePlayer(position, 1, 20);
        return { ...gen, id: uuidv4(), nationality, attributes: scaleAttributes(gen.attributes, quality) };
      };
      return {
        editableCountries: mapTeam(editableCountries, teamId, t => ({
          ...t,
          starters: (['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] as Position[])
            .map(pos => make(pos, 70)),
          substitutes: (['GK', 'CB', 'CM', 'ST'] as Position[])
            .map(pos => make(pos, 60)),
        })),
      };
    }),

  // ── game lifecycle ──────────────────────────────────────────────────────────

  startGame: (teamId, leagueIds) => {
    const { editableCountries, playerGenerator, selectedLeagueIds: storedIds } = get();
    const resolvedLeagueIds = leagueIds ?? storedIds;
    const { leagueManagers, leagueManager, clubManager, transferManager } = buildManagers(
      editableCountries, teamId, resolvedLeagueIds, playerGenerator, get, set,
    );
    if (!leagueManager || !clubManager || !transferManager) {return;}

    const leagueStates: Record<string, LeagueState> = {};
    for (const [id, mgr] of Object.entries(leagueManagers)) {
      leagueStates[id] = mgr.getState();
    }

    set({
      playerTeamId: teamId,
      selectedLeagueIds: resolvedLeagueIds,
      currentMatchday: 0,
      seasonComplete: false,
      lastMatchResult: null,
      activeTab: 'squad',
      leagueManager,
      leagueManagers,
      clubManager,
      transferManager,
      leagueState: leagueManager.getState(),
      leagueStates,
      clubState: clubManager.getState(),
      transferListings: transferManager.getActiveListings(0),
      screen: 'game',
    });
  },

  startNewSeason: () => {
    const { playerTeamId, selectedLeagueIds } = get();
    if (playerTeamId) {get().startGame(playerTeamId, selectedLeagueIds);}
  },

  saveGame: async (type) => {
    const s = get();
    if (!s.playerTeamId || !s.leagueState || !s.clubState) {return;}
    await writeSave({
      version: SAVE_VERSION,
      type,
      savedAt: new Date().toISOString(),
      teamName: s.clubState.clubName,
      matchday: s.currentMatchday,
      playerTeamId: s.playerTeamId,
      selectedLeagueIds: s.selectedLeagueIds,
      editableCountries: (() => {
        const keep = new Set(s.selectedLeagueIds ?? []);
        const playerCountry = findCountryForTeam(s.editableCountries, s.playerTeamId!);
        if (playerCountry) {keep.add(playerCountry.id);}
        return s.editableCountries.filter(c => keep.has(c.id));
      })(),
      currentMatchday: s.currentMatchday,
      seasonComplete: s.seasonComplete,
      activeTab: s.activeTab,
      lastMatchResult: s.lastMatchResult,
      leagueState: s.leagueState,
      leagueStates: s.leagueStates,
      clubState: s.clubState,
      transferListings: s.transferListings,
    });
  },

  loadGame: (save) => {
    const { playerGenerator } = get();
    // Merge saved (partial) editableCountries with fresh defaults so all countries are available
    const savedCountryMap = new Map(save.editableCountries.map(c => [c.id, c]));
    const mergedCountries = buildEditableCountries().map(c => savedCountryMap.get(c.id) ?? c);
    // Backward compat: old saves without selectedLeagueIds fall back to just the player's nation
    const leagueIds = save.selectedLeagueIds
      ?? [findCountryForTeam(mergedCountries, save.playerTeamId)?.id].filter(Boolean) as string[];
    const { leagueManagers, leagueManager, clubManager, transferManager } = buildManagers(
      mergedCountries, save.playerTeamId, leagueIds, playerGenerator, get, set,
    );
    if (!leagueManager || !clubManager || !transferManager) {return;}

    leagueManager.loadState(save.leagueState);
    // Load other division states if present (new saves); otherwise leave them at initial state
    if (save.leagueStates) {
      const playerDivId = findDivisionForTeam(mergedCountries, save.playerTeamId)?.id;
      for (const [id, state] of Object.entries(save.leagueStates)) {
        if (id !== playerDivId && leagueManagers[id]) {
          leagueManagers[id].loadState(state);
        }
      }
    }
    // Migrate old saves that predate stadiumSectors
    const savedClubState = save.clubState;
    if (!savedClubState.stadiumSectors) {
      savedClubState.stadiumSectors = DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>;
    }
    clubManager.loadState(savedClubState);
    const transferState: TransferState = {
      listings: save.transferListings,
      refreshedOnMatchday: save.currentMatchday,
    };
    transferManager.loadState(transferState);

    const leagueStates: Record<string, LeagueState> = {};
    for (const [id, mgr] of Object.entries(leagueManagers)) {
      leagueStates[id] = mgr.getState();
    }

    set({
      screen: 'game',
      activeTab: save.activeTab as TabId,
      playerTeamId: save.playerTeamId,
      selectedLeagueIds: leagueIds,
      editableCountries: mergedCountries,
      currentMatchday: save.currentMatchday,
      seasonComplete: save.seasonComplete,
      lastMatchResult: save.lastMatchResult,
      leagueManager,
      leagueManagers,
      clubManager,
      transferManager,
      leagueState: leagueManager.getState(),
      leagueStates,
      clubState: clubManager.getState(),
      transferListings: transferManager.getActiveListings(save.currentMatchday),
    });
  },

  simulateMatchday: async () => {
    const { leagueManager, leagueManagers, clubManager, transferManager } = get();
    if (!leagueManager || !leagueManager.hasMoreMatchdays()) {return;}

    set({ lastMatchResult: null });
    // Simulate all divisions in parallel
    const otherManagers = Object.values(leagueManagers).filter(m => m !== leagueManager);
    await Promise.all([
      leagueManager.simulateNextMatchday(),
      ...otherManagers.filter(m => m.hasMoreMatchdays()).map(m => m.simulateNextMatchday()),
    ]);

    const newMatchday = leagueManager.getCompletedMatchdays();
    clubManager?.handleMatchdayComplete();

    if (newMatchday > 0 && newMatchday % 3 === 0) {transferManager?.refreshMarket(newMatchday);}

    const seasonComplete = !leagueManager.hasMoreMatchdays();
    set({ currentMatchday: newMatchday, seasonComplete });
    syncEngineState(get, set);
  },

  simulateToEnd: async () => {
    const { leagueManager } = get();
    if (!leagueManager) {return;}
    while (leagueManager.hasMoreMatchdays()) {await get().simulateMatchday();}
  },

  // ── match animation ─────────────────────────────────────────────────────────

  playMatch: async () => {
    const { leagueManager, playerTeamId, editableCountries } = get();
    if (!leagueManager || !playerTeamId) {return;}

    const scheduled = leagueManager.getState().fixtures.filter(f => f.status === 'scheduled');
    if (!scheduled.length) {return;}
    const nextMd = scheduled.reduce((min, f) => Math.min(min, f.matchday), scheduled[0].matchday);
    const fixture = leagueManager.getState().fixtures.find(
      f => f.matchday === nextMd && (f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId),
    );
    if (!fixture) {return;}

    const homeTeam = findTeamById(editableCountries, fixture.homeTeamId);
    const awayTeam = findTeamById(editableCountries, fixture.awayTeamId);
    if (!homeTeam || !awayTeam) {return;}

    const displaySim = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 4, homeTeam, awayTeam });
    const displayResult = displaySim.simulate();

    const important = new Set(['goal', 'yellow_card', 'red_card', 'save', 'half_time', 'full_time']);
    const keyEvents = displayResult.events.filter((e: MatchEvent) => important.has(e.type));

    const allSimEvents: SimEvent[] = keyEvents.map((e: MatchEvent) => ({
      minute: `${e.minute}'`,
      text: `[${e.team === 'home' ? homeTeam.name : awayTeam.name}] ${e.description}`,
      type: e.type === 'goal' ? 'goal'
        : (e.type === 'yellow_card' || e.type === 'red_card') ? 'card'
        : (e.type === 'half_time' || e.type === 'full_time') ? 'phase'
        : 'normal',
    }));

    set({
      matchSimOverlayOpen: true,
      matchSimHeader: `${homeTeam.name}  0 – 0  ${awayTeam.name}`,
      matchSimTime: 'Kick off',
      matchSimVisibleEvents: [],
      matchSimAllEvents: allSimEvents,
      matchSimFinished: false,
      skipAnimation: false,
    });

    await Promise.all([
      get().simulateMatchday(),
      new Promise<void>((resolve) => {
        let idx = 0;
        const step = () => {
          const { skipAnimation } = get();
          if (skipAnimation || idx >= keyEvents.length) { resolve(); return; }
          const e = keyEvents[idx++];
          const s = e.resultingState;
          get().appendSimEvent(allSimEvents[idx - 1]);
          get().updateSimHeader(
            `${homeTeam.name}  ${s.homeScore} – ${s.awayScore}  ${awayTeam.name}`,
            `${e.minute}'`,
          );
          setTimeout(step, 200);
        };
        step();
      }),
    ]);

    const result = get().lastMatchResult;
    if (result) {
      get().appendSimEvent({
        minute: '',
        text: `FULL TIME — ${homeTeam.name} ${result.homeScore}–${result.awayScore} ${awayTeam.name}`,
        type: 'phase',
      });
      get().updateSimHeader(
        `${homeTeam.name}  ${result.homeScore} – ${result.awayScore}  ${awayTeam.name}`,
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

  toggleXI: (id) => {
    const { clubManager, clubState } = get();
    if (!clubManager || !clubState) {return;}
    const inXI = clubState.startingXI.includes(id);
    if (inXI) {
      clubManager.setStartingXI(clubState.startingXI.filter(x => x !== id));
    } else {
      if (clubState.startingXI.length >= 11) {return;}
      clubManager.setStartingXI([...clubState.startingXI, id]);
    }
    set({ clubState: clubManager.getState() });
  },

  setStartingXI: (ids) => {
    const { clubManager } = get();
    if (!clubManager) {return;}
    clubManager.setStartingXI(ids);
    set({ clubState: clubManager.getState() });
  },

  setBench: (ids) => {
    const { clubManager } = get();
    if (!clubManager) {return;}
    clubManager.setBenchPlayers(ids);
    set({ clubState: clubManager.getState() });
  },

  setFormation: (formation) => {
    const { clubManager } = get();
    if (!clubManager) {return;}
    clubManager.setFormation(formation);
    set({ clubState: clubManager.getState() });
  },

  // ── transfers ───────────────────────────────────────────────────────────────

  buyPlayer: (listingId) => {
    const { transferManager, clubManager } = get();
    if (!transferManager || !clubManager) {return false;}
    const ok = transferManager.purchase(listingId, clubManager);
    if (ok) {syncEngineState(get, set);}
    return ok;
  },

  sellPlayer: (playerId) => {
    const { clubManager } = get();
    if (!clubManager) {return false;}
    const cs = clubManager.getState();
    const player = cs.squad.find(p => p.id === playerId);
    if (!player) {return false;}
    const price = sellPrice(player.attributes);
    const ok = clubManager.sellPlayer(playerId, price);
    if (ok) {set({ clubState: clubManager.getState() });}
    return ok;
  },

  refreshTransfers: () => {
    const { transferManager, currentMatchday } = get();
    if (!transferManager) {return;}
    transferManager.refreshMarket(currentMatchday);
    set({ transferListings: transferManager.getActiveListings(currentMatchday) });
  },

  // ── facilities ──────────────────────────────────────────────────────────────

  upgradeFacility: (key) => {
    const { clubManager } = get();
    if (!clubManager) {return false;}
    const ok = clubManager.upgradeFacility(key as 'medical' | 'training' | 'academy');
    if (ok) {set({ clubState: clubManager.getState() });}
    return ok;
  },

  applyStadiumDesign: (sectors, cost, newCapacity) => {
    const { clubManager } = get();
    if (!clubManager) {return false;}
    const ok = clubManager.applyStadiumDesign(sectors, cost, newCapacity);
    if (ok) {set({ clubState: clubManager.getState() });}
    return ok;
  },

}));
