import {
  LeagueManager, ClubManager, TransferManager, PlayerGenerator, EventBus, MatchSimulator,
  DEFAULT_STADIUM_SECTORS, calculateTotalCapacity, calculateOverall, sellPrice, v4 as uuidv4,
} from '@fm2k/engine';
import type {
  LeagueState, ClubState, TransferListing, TransferState,
  Position, GameEvents, StadiumSectorConfig, MatchEvent, Fixture, Player, Formation, Team,
} from '@fm2k/engine';
import {
  buildEditableCountries, mapTeam, findTeamById, findDivisionForTeam, findCountryForTeam,
} from '../domain/editable-country.ts';
import type { EditableCountry } from '../domain/editable-country.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import {
  writeSave, SAVE_VERSION, type SaveData, type SaveType,
} from '../data/save-data.ts';
import {
  BUDGET_START, STADIUM_START, SEASON_START, EVENTS_PER_MINUTE, MARKET_SIZE,
  MARKET_REFRESH_INTERVAL, ALL_POSITIONS,
} from './config.ts';
import { scaleAttributes } from './player-scaling.ts';

/** Significant match events the UI animates (goals, cards, saves, phase changes). */
const KEY_EVENT_TYPES = new Set(['goal', 'yellow_card', 'red_card', 'save', 'half_time', 'full_time']);

/** Result of playing the player's match: team names + the key events to animate. */
export interface PlayedMatch {
  homeTeamName: string;
  awayTeamName: string;
  keyEvents: MatchEvent[];
}

/** The read-model the frontend caches: lifecycle flags + engine state snapshots. */
export interface GameSnapshot {
  playerTeamId: string | null;
  selectedLeagueIds: string[];
  editableCountries: EditableCountry[];
  currentMatchday: number;
  seasonComplete: boolean;
  lastMatchResult: LastMatchResult | null;
  leagueState: LeagueState | null;
  leagueStates: Record<string, LeagueState>;
  clubState: ClubState | null;
  transferListings: TransferListing[];
}

/**
 * Owns the engine managers + EventBus for a single game and exposes lifecycle
 * operations. Reads are served via `snapshot()`. The frontend never touches the
 * managers directly.
 */
export class GameSession {
  private readonly playerGenerator = new PlayerGenerator();
  private leagueManagers: Record<string, LeagueManager> = {};
  private leagueManager: LeagueManager | null = null;
  private clubManager: ClubManager | null = null;
  private transferManager: TransferManager | null = null;
  private eventBus: EventBus<GameEvents> | null = null;
  private eventBusCleanup: (() => void) | null = null;

  private playerTeamId: string | null = null;
  private selectedLeagueIds: string[] = [];
  private currentMatchday = 0;
  private seasonComplete = false;
  private lastMatchResult: LastMatchResult | null = null;
  private editableCountries: EditableCountry[] = buildEditableCountries();
  private readonly listeners = new Set<() => void>();

  // ── change notifications ────────────────────────────────────────────────────

  /** Subscribe to any state change (the frontend re-snapshots on notify). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  snapshot(): GameSnapshot {
    const leagueStates: Record<string, LeagueState> = {};
    for (const [id, mgr] of Object.entries(this.leagueManagers)) {
      leagueStates[id] = mgr.getState();
    }
    return {
      playerTeamId: this.playerTeamId,
      selectedLeagueIds: this.selectedLeagueIds,
      editableCountries: this.editableCountries,
      currentMatchday: this.currentMatchday,
      seasonComplete: this.seasonComplete,
      lastMatchResult: this.lastMatchResult,
      leagueState: this.leagueManager?.getState() ?? null,
      leagueStates,
      clubState: this.clubManager?.getState() ?? null,
      transferListings: this.transferManager?.getActiveListings(this.currentMatchday) ?? [],
    };
  }

  // ── manager construction ────────────────────────────────────────────────────

  private buildManagers(
    editableCountries: EditableCountry[],
    teamId: string,
    leagueIds: string[],
  ): boolean {
    const team = findTeamById(editableCountries, teamId);
    const division = findDivisionForTeam(editableCountries, teamId);
    if (!team || !division) { return false; }

    // Ensure the player's nation is always included even if not in leagueIds.
    const playerCountry = findCountryForTeam(editableCountries, teamId);
    const allLeagueIds = playerCountry && !leagueIds.includes(playerCountry.id)
      ? [...leagueIds, playerCountry.id]
      : leagueIds;

    this.eventBusCleanup?.();
    const eventBus = new EventBus<GameEvents>();
    this.eventBus = eventBus;

    this.eventBusCleanup = eventBus.on('match.completed', (payload) => {
      const isHome = payload.homeTeamId === this.playerTeamId;
      const isAway = payload.awayTeamId === this.playerTeamId;
      if (!isHome && !isAway) { return; }
      this.lastMatchResult = {
        homeTeamId: payload.homeTeamId, awayTeamId: payload.awayTeamId,
        homeScore: payload.homeScore, awayScore: payload.awayScore, isHome,
      };
    });

    const leagueManagers: Record<string, LeagueManager> = {};
    for (const countryId of allLeagueIds) {
      const country = editableCountries.find(c => c.id === countryId);
      if (!country) { continue; }
      for (const div of country.divisions) {
        leagueManagers[div.id] = new LeagueManager({
          teams: div.teams,
          startDate: SEASON_START,
          eventsPerMinute: EVENTS_PER_MINUTE,
          // Only wire the EventBus to the player's own division.
          eventBus: div.id === division.id ? eventBus : undefined,
        });
      }
    }

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
      marketSize: MARKET_SIZE,
      playerFactory: () => {
        const pos = ALL_POSITIONS[Math.floor(Math.random() * ALL_POSITIONS.length)] as Position;
        const gen = this.playerGenerator.generatePlayer(pos, 1, 20);
        return { ...gen, id: uuidv4(), attributes: scaleAttributes(gen.attributes, 65) };
      },
    });

    this.leagueManagers = leagueManagers;
    this.leagueManager = leagueManagers[division.id];
    this.clubManager = clubManager;
    this.transferManager = transferManager;
    return true;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  startGame(teamId: string, leagueIds: string[]): boolean {
    if (!this.buildManagers(this.editableCountries, teamId, leagueIds)) { return false; }
    this.playerTeamId = teamId;
    this.selectedLeagueIds = leagueIds;
    this.currentMatchday = 0;
    this.seasonComplete = false;
    this.lastMatchResult = null;
    return true;
  }

  buildSaveData(type: SaveType, activeTab = 'squad'): SaveData | null {
    const snap = this.snapshot();
    if (!this.playerTeamId || !snap.leagueState || !snap.clubState) { return null; }
    const keep = new Set(this.selectedLeagueIds);
    const playerCountry = findCountryForTeam(this.editableCountries, this.playerTeamId);
    if (playerCountry) { keep.add(playerCountry.id); }
    return {
      version: SAVE_VERSION,
      type,
      savedAt: new Date().toISOString(),
      teamName: snap.clubState.clubName,
      matchday: this.currentMatchday,
      playerTeamId: this.playerTeamId,
      selectedLeagueIds: this.selectedLeagueIds,
      editableCountries: this.editableCountries.filter(c => keep.has(c.id)),
      currentMatchday: this.currentMatchday,
      seasonComplete: this.seasonComplete,
      activeTab,
      lastMatchResult: this.lastMatchResult,
      leagueState: snap.leagueState,
      leagueStates: snap.leagueStates,
      clubState: snap.clubState,
      transferListings: snap.transferListings,
    };
  }

  async saveGame(type: SaveType, activeTab = 'squad'): Promise<void> {
    const data = this.buildSaveData(type, activeTab);
    if (data) { await writeSave(data); }
  }

  loadGame(save: SaveData): boolean {
    // Merge the saved (partial) countries with fresh defaults so all are available.
    const savedCountryMap = new Map(save.editableCountries.map(c => [c.id, c]));
    const mergedCountries = buildEditableCountries().map(c => savedCountryMap.get(c.id) ?? c);
    const leagueIds = save.selectedLeagueIds
      ?? [findCountryForTeam(mergedCountries, save.playerTeamId)?.id].filter(Boolean) as string[];

    if (!this.buildManagers(mergedCountries, save.playerTeamId, leagueIds)) { return false; }

    this.leagueManager!.loadState(save.leagueState);
    if (save.leagueStates) {
      const playerDivId = findDivisionForTeam(mergedCountries, save.playerTeamId)?.id;
      for (const [id, state] of Object.entries(save.leagueStates)) {
        if (id !== playerDivId && this.leagueManagers[id]) {
          this.leagueManagers[id].loadState(state);
        }
      }
    }
    const savedClubState = save.clubState;
    if (!savedClubState.stadiumSectors) {
      savedClubState.stadiumSectors = DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>;
    }
    this.clubManager!.loadState(savedClubState);
    const transferState: TransferState = {
      listings: save.transferListings,
      refreshedOnMatchday: save.currentMatchday,
    };
    this.transferManager!.loadState(transferState);

    this.editableCountries = mergedCountries;
    this.playerTeamId = save.playerTeamId;
    this.selectedLeagueIds = leagueIds;
    this.currentMatchday = save.currentMatchday;
    this.seasonComplete = save.seasonComplete;
    this.lastMatchResult = save.lastMatchResult;
    return true;
  }

  // ── simulation ──────────────────────────────────────────────────────────────

  /** Simulate the next matchday across every division; updates state + notifies. */
  async simulateMatchday(): Promise<void> {
    const leagueManager = this.leagueManager;
    if (!leagueManager || !leagueManager.hasMoreMatchdays()) { return; }

    this.lastMatchResult = null;
    const others = Object.values(this.leagueManagers).filter(m => m !== leagueManager);
    await Promise.all([
      leagueManager.simulateNextMatchday(),
      ...others.filter(m => m.hasMoreMatchdays()).map(m => m.simulateNextMatchday()),
    ]);

    const newMatchday = leagueManager.getCompletedMatchdays();
    this.clubManager?.handleMatchdayComplete();
    if (newMatchday > 0 && newMatchday % MARKET_REFRESH_INTERVAL === 0) {
      this.transferManager?.refreshMarket(newMatchday);
    }

    this.currentMatchday = newMatchday;
    this.seasonComplete = !leagueManager.hasMoreMatchdays();
    this.notify();
  }

  /** Simulate every remaining matchday to the end of the season. */
  async simulateToEnd(): Promise<void> {
    while (this.leagueManager?.hasMoreMatchdays()) {
      await this.simulateMatchday();
    }
  }

  /**
   * Play the player's next fixture: produce the key events to animate (from a
   * display sim) and advance the real season (authoritative results + events).
   * `lastMatchResult` is set from the engine's `match.completed`.
   */
  async playMatch(): Promise<PlayedMatch | null> {
    const leagueManager = this.leagueManager;
    if (!leagueManager || !this.playerTeamId) { return null; }

    const fixtures = leagueManager.getState().fixtures.filter(f => f.status === 'scheduled');
    if (!fixtures.length) { return null; }
    const nextMd = fixtures.reduce((min, f) => Math.min(min, f.matchday), fixtures[0].matchday);
    const fixture = leagueManager.getState().fixtures.find(
      (f: Fixture) => f.matchday === nextMd
        && (f.homeTeamId === this.playerTeamId || f.awayTeamId === this.playerTeamId),
    );
    if (!fixture) { return null; }

    const homeTeam = findTeamById(this.editableCountries, fixture.homeTeamId);
    const awayTeam = findTeamById(this.editableCountries, fixture.awayTeamId);
    if (!homeTeam || !awayTeam) { return null; }

    const displaySim = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 4, homeTeam, awayTeam });
    const keyEvents = displaySim.simulate().events.filter((e: MatchEvent) => KEY_EVENT_TYPES.has(e.type));

    await this.simulateMatchday();

    return { homeTeamName: homeTeam.name, awayTeamName: awayTeam.name, keyEvents };
  }

  // ── tactics ───────────────────────────────────────────────────────────────

  private clubChanged(): ClubState | null {
    this.notify();
    return this.clubManager?.getState() ?? null;
  }

  toggleXI(id: string): ClubState | null {
    const cs = this.clubManager?.getState();
    if (!this.clubManager || !cs) { return null; }
    if (cs.startingXI.includes(id)) {
      this.clubManager.setStartingXI(cs.startingXI.filter(x => x !== id));
    } else {
      if (cs.startingXI.length >= 11) { return cs; }
      this.clubManager.setStartingXI([...cs.startingXI, id]);
    }
    return this.clubChanged();
  }

  setStartingXI(ids: string[]): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setStartingXI(ids);
    return this.clubChanged();
  }

  setBench(ids: string[]): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setBenchPlayers(ids);
    return this.clubChanged();
  }

  setFormation(formation: Formation): ClubState | null {
    if (!this.clubManager) { return null; }
    this.clubManager.setFormation(formation);
    return this.clubChanged();
  }

  // ── transfers ─────────────────────────────────────────────────────────────

  buyPlayer(listingId: string): boolean {
    if (!this.transferManager || !this.clubManager) { return false; }
    const ok = this.transferManager.purchase(listingId, this.clubManager);
    if (ok) { this.notify(); }
    return ok;
  }

  sellPlayer(playerId: string): boolean {
    if (!this.clubManager) { return false; }
    const player = this.clubManager.getState().squad.find(p => p.id === playerId);
    if (!player) { return false; }
    const ok = this.clubManager.sellPlayer(playerId, sellPrice(player.attributes));
    if (ok) { this.notify(); }
    return ok;
  }

  refreshTransfers(): TransferListing[] {
    if (!this.transferManager) { return []; }
    this.transferManager.refreshMarket(this.currentMatchday);
    this.notify();
    return this.transferManager.getActiveListings(this.currentMatchday);
  }

  // ── facilities ────────────────────────────────────────────────────────────

  upgradeFacility(key: 'medical' | 'training' | 'academy'): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.upgradeFacility(key);
    if (ok) { this.notify(); }
    return ok;
  }

  applyStadiumDesign(sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): boolean {
    if (!this.clubManager) { return false; }
    const ok = this.clubManager.applyStadiumDesign(sectors, cost, newCapacity);
    if (ok) { this.notify(); }
    return ok;
  }

  // ── pre-game team editor (operates on editableCountries) ────────────────────

  getEditableCountries(): EditableCountry[] {
    return this.editableCountries;
  }

  setEditableCountries(countries: EditableCountry[]): void {
    this.editableCountries = countries;
    this.notify();
  }

  private editTeam(teamId: string, fn: (t: Team) => Team): EditableCountry[] {
    this.editableCountries = mapTeam(this.editableCountries, teamId, fn);
    this.notify();
    return this.editableCountries;
  }

  private makePlayer(position: Position, quality: number, nationality: string): Player {
    const gen = this.playerGenerator.generatePlayer(position, 1, 20);
    return { ...gen, id: uuidv4(), nationality, attributes: scaleAttributes(gen.attributes, quality) };
  }

  updateTeamName(teamId: string, name: string): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, name: name.trim() || t.name }));
  }

  updateTeamFormation(teamId: string, formation: Formation): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, formation }));
  }

  updatePlayerData(teamId: string, playerId: string, data: Partial<Player>): EditableCountry[] {
    return this.editTeam(teamId, t => {
      const upd = (list: Player[]) => list.map(p => p.id === playerId ? { ...p, ...data } : p);
      return { ...t, starters: upd(t.starters), substitutes: upd(t.substitutes) };
    });
  }

  regeneratePlayer(teamId: string, playerId: string): EditableCountry[] {
    return this.editTeam(teamId, t => {
      const upd = (list: Player[]) => list.map(p => {
        if (p.id !== playerId) { return p; }
        const q = Math.round(calculateOverall(p.attributes));
        const gen = this.playerGenerator.generatePlayer(p.position, 1, 20);
        return { ...p, name: gen.name, attributes: scaleAttributes(gen.attributes, q) };
      });
      return { ...t, starters: upd(t.starters), substitutes: upd(t.substitutes) };
    });
  }

  removePlayer(teamId: string, playerId: string): EditableCountry[] {
    return this.editTeam(teamId, t => ({
      ...t,
      starters: t.starters.filter(p => p.id !== playerId),
      substitutes: t.substitutes.filter(p => p.id !== playerId),
    }));
  }

  addGeneratedPlayer(teamId: string): EditableCountry[] {
    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    const pos = ALL_POSITIONS[Math.floor(Math.random() * ALL_POSITIONS.length)] as Position;
    const newPlayer = this.makePlayer(pos, 70, nationality);
    return this.editTeam(teamId, t => ({ ...t, starters: [...t.starters, newPlayer] }));
  }

  addPlayer(teamId: string, player: Omit<Player, 'id'>): EditableCountry[] {
    return this.editTeam(teamId, t => ({ ...t, starters: [...t.starters, { ...player, id: uuidv4() }] }));
  }

  generateFullTeam(teamId: string): EditableCountry[] {
    const nationality = findCountryForTeam(this.editableCountries, teamId)?.nationality ?? 'unknown';
    return this.editTeam(teamId, t => ({
      ...t,
      starters: (['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] as Position[])
        .map(pos => this.makePlayer(pos, 70, nationality)),
      substitutes: (['GK', 'CB', 'CM', 'ST'] as Position[])
        .map(pos => this.makePlayer(pos, 60, nationality)),
    }));
  }
}
