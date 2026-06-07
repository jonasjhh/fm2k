import { create } from 'zustand';
import {
  LeagueManager, ClubManager, TransferManager, PlayerGenerator,
  MatchSimulator,
  COUNTRY_IDS, COUNTRY_DATA, getAllDivisions, calculateOverall, v4 as uuidv4,
} from '@fm2k/engine';
import type {
  Team, Player, PlayerAttributes, Formation, Position,
  LeagueState, ClubState, TransferListing, GameDateTime, MatchEvent,
  StructuredDivision, CountryId,
} from '@fm2k/engine';
import {
  BUDGET_START, STADIUM_START, SEASON_START, ALL_POSITIONS,
} from '../constants';
import { sellPrice } from '../utils/calculations';

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

function ovrToAttributes(ovr: number, position: Position): PlayerAttributes {
  const emphasis: Record<string, Partial<Record<keyof PlayerAttributes, number>>> = {
    GK:  { agility: 8, composure: 6, awareness: 6, finishing: -25 },
    CB:  { defending: 10, strength: 8, finishing: -10 },
    LB:  { speed: 6, defending: 6, stamina: 6 },
    RB:  { speed: 6, defending: 6, stamina: 6 },
    CDM: { defending: 8, passing: 4, strength: 6 },
    CM:  { passing: 8, stamina: 6, technique: 4 },
    CAM: { passing: 8, technique: 8, composure: 4 },
    LM:  { speed: 8, agility: 4, stamina: 6, passing: 4 },
    RM:  { speed: 8, agility: 4, stamina: 6, passing: 4 },
    LW:  { speed: 10, agility: 6, technique: 4 },
    RW:  { speed: 10, agility: 6, technique: 4 },
    ST:  { finishing: 12, composure: 6, speed: 4 },
    CF:  { finishing: 8, technique: 8, composure: 6 },
  };
  const e = emphasis[position] ?? {};
  const result = {} as PlayerAttributes;
  const keys: (keyof PlayerAttributes)[] = [
    'speed', 'strength', 'agility', 'passing', 'finishing',
    'technique', 'defending', 'stamina', 'awareness', 'composure',
  ];
  for (const k of keys) {
    result[k] = Math.max(40, Math.min(99, ovr + (e[k] ?? 0)));
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
      if (t) return t;
    }
  }
  return null;
}

export function findDivisionForTeam(countries: EditableCountry[], teamId: string): EditableDivision | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      if (d.teams.some(t => t.id === teamId)) return d;
    }
  }
  return null;
}

export function findCountryForTeam(countries: EditableCountry[], teamId: string): EditableCountry | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      if (d.teams.some(t => t.id === teamId)) return c;
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
  clubManager: ClubManager | null;
  transferManager: TransferManager | null;
  playerGenerator: PlayerGenerator;

  // reactive snapshots
  leagueState: LeagueState | null;
  clubState: ClubState | null;
  transferListings: TransferListing[];

  // game state
  playerTeamId: string | null;
  currentMatchday: number;
  lastMatchResult: LastMatchResult | null;
  seasonComplete: boolean;
  showAllFixtures: boolean;

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
  startGame: (teamId: string) => void;
  startNewSeason: () => void;
  simulateMatchday: () => Promise<void>;
  simulateToEnd: () => Promise<void>;

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

  // ── transfers ───────────────────────────────────────────────────────────────
  buyPlayer: (listingId: string) => boolean;
  sellPlayer: (playerId: string) => boolean;
  refreshTransfers: () => void;

  // ── facilities ──────────────────────────────────────────────────────────────
  upgradeFacility: (key: string) => boolean;
  expandStadium: () => boolean;

  // ── fixtures ────────────────────────────────────────────────────────────────
  toggleFixtureView: () => void;
}

// ─── sync helper ─────────────────────────────────────────────────────────────

function syncEngineState(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  const { leagueManager, clubManager, transferManager, currentMatchday } = get();
  set({
    leagueState: leagueManager?.getState() ?? null,
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
  clubManager: null,
  transferManager: null,
  playerGenerator: new PlayerGenerator(),

  leagueState: null,
  clubState: null,
  transferListings: [],

  playerTeamId: null,
  currentMatchday: 0,
  lastMatchResult: null,
  seasonComplete: false,
  showAllFixtures: false,

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
              if (p.id !== playerId) return p;
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

  startGame: (teamId) => {
    const { editableCountries, playerGenerator } = get();
    const team = findTeamById(editableCountries, teamId);
    const division = findDivisionForTeam(editableCountries, teamId);
    if (!team || !division) return;

    const leagueManager = new LeagueManager({
      teams: division.teams,
      startDate: SEASON_START as GameDateTime,
      eventsPerMinute: 3,
      onMatchCompleted: (payload) => {
        const { clubManager, playerTeamId } = get();
        const { homeTeamId, awayTeamId, homeScore, awayScore, timestamp, awayStanding } = payload;
        const isHome = homeTeamId === playerTeamId;
        const isAway = awayTeamId === playerTeamId;
        if (!isHome && !isAway) return;

        set({ lastMatchResult: { homeTeamId, awayTeamId, homeScore, awayScore, isHome } });
        clubManager?.handleMatchCompleted({ homeTeamId, awayTeamId, homeScore, awayScore, timestamp });

        if (isHome && awayStanding) {
          const receipt = clubManager?.calculateHomeReceipt(awayStanding);
          if (receipt) clubManager?.recordGateReceipt(receipt, awayTeamId, timestamp);
        }
      },
    });

    const clubManager = new ClubManager({
      clubId: team.id,
      clubName: team.name,
      divisionId: division.id,
      squad: [...team.starters, ...team.substitutes],
      budget: BUDGET_START,
      formation: team.formation,
      startingXI: team.starters.slice(0, 11).map(p => p.id),
      benchPlayers: team.substitutes.map(p => p.id),
      stadiumCapacity: STADIUM_START,
    });

    const transferManager = new TransferManager({
      marketSize: 15,
      playerFactory: () => {
        const pos = ALL_POSITIONS[Math.floor(Math.random() * ALL_POSITIONS.length)] as Position;
        const gen = playerGenerator.generatePlayer(pos, 1, 20);
        return { ...gen, id: uuidv4(), attributes: scaleAttributes(gen.attributes, 65) };
      },
    });

    set({
      playerTeamId: teamId,
      currentMatchday: 0,
      seasonComplete: false,
      lastMatchResult: null,
      showAllFixtures: false,
      activeTab: 'squad',
      leagueManager,
      clubManager,
      transferManager,
      leagueState: leagueManager.getState(),
      clubState: clubManager.getState(),
      transferListings: transferManager.getActiveListings(0),
      screen: 'game',
    });
  },

  startNewSeason: () => {
    const { playerTeamId } = get();
    if (playerTeamId) get().startGame(playerTeamId);
  },

  simulateMatchday: async () => {
    const { leagueManager, clubManager, transferManager, currentMatchday } = get();
    if (!leagueManager || !leagueManager.hasMoreMatchdays()) return;

    set({ lastMatchResult: null });
    await leagueManager.simulateNextMatchday();

    const newMatchday = leagueManager.getCompletedMatchdays();
    clubManager?.handleMatchdayComplete();

    if (newMatchday > 0 && newMatchday % 3 === 0) transferManager?.refreshMarket(newMatchday);

    const seasonComplete = !leagueManager.hasMoreMatchdays();
    set({ currentMatchday: newMatchday, seasonComplete });
    syncEngineState(get, set);
  },

  simulateToEnd: async () => {
    const { leagueManager } = get();
    if (!leagueManager) return;
    while (leagueManager.hasMoreMatchdays()) await get().simulateMatchday();
  },

  // ── match animation ─────────────────────────────────────────────────────────

  playMatch: async () => {
    const { leagueManager, playerTeamId, editableCountries } = get();
    if (!leagueManager || !playerTeamId) return;

    const scheduled = leagueManager.getState().fixtures.filter(f => f.status === 'scheduled');
    if (!scheduled.length) return;
    const nextMd = scheduled.reduce((min, f) => Math.min(min, f.matchday), scheduled[0].matchday);
    const fixture = leagueManager.getState().fixtures.find(
      f => f.matchday === nextMd && (f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId),
    );
    if (!fixture) return;

    const homeTeam = findTeamById(editableCountries, fixture.homeTeamId);
    const awayTeam = findTeamById(editableCountries, fixture.awayTeamId);
    if (!homeTeam || !awayTeam) return;

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
    if (!clubManager || !clubState) return;
    const inXI = clubState.startingXI.includes(id);
    if (inXI) {
      clubManager.setStartingXI(clubState.startingXI.filter(x => x !== id));
    } else {
      if (clubState.startingXI.length >= 11) return;
      clubManager.setStartingXI([...clubState.startingXI, id]);
    }
    set({ clubState: clubManager.getState() });
  },

  setStartingXI: (ids) => {
    const { clubManager } = get();
    if (!clubManager) return;
    clubManager.setStartingXI(ids);
    set({ clubState: clubManager.getState() });
  },

  // ── transfers ───────────────────────────────────────────────────────────────

  buyPlayer: (listingId) => {
    const { transferManager, clubManager } = get();
    if (!transferManager || !clubManager) return false;
    const ok = transferManager.purchase(listingId, clubManager);
    if (ok) syncEngineState(get, set);
    return ok;
  },

  sellPlayer: (playerId) => {
    const { clubManager } = get();
    if (!clubManager) return false;
    const cs = clubManager.getState();
    const player = cs.squad.find(p => p.id === playerId);
    if (!player) return false;
    const price = sellPrice(player.attributes);
    const ok = clubManager.sellPlayer(playerId, price);
    if (ok) set({ clubState: clubManager.getState() });
    return ok;
  },

  refreshTransfers: () => {
    const { transferManager, currentMatchday } = get();
    if (!transferManager) return;
    transferManager.refreshMarket(currentMatchday);
    set({ transferListings: transferManager.getActiveListings(currentMatchday) });
  },

  // ── facilities ──────────────────────────────────────────────────────────────

  upgradeFacility: (key) => {
    const { clubManager } = get();
    if (!clubManager) return false;
    const ok = clubManager.upgradeFacility(key as 'medical' | 'training' | 'academy');
    if (ok) set({ clubState: clubManager.getState() });
    return ok;
  },

  expandStadium: () => {
    const { clubManager } = get();
    if (!clubManager) return false;
    const cs = clubManager.getState();
    const ok = clubManager.expandStadium(cs.stadiumCapacity + 2_000);
    if (ok) set({ clubState: clubManager.getState() });
    return ok;
  },

  // ── fixtures ────────────────────────────────────────────────────────────────

  toggleFixtureView: () => set(s => ({ showAllFixtures: !s.showAllFixtures })),
}));
