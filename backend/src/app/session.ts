import {
  CompetitionManager, LeagueFormat, KnockoutFormat, Season,
  ClubManager, TransferManager, PlayerGenerator, EventBus, MatchSimulator,
  DEFAULT_STADIUM_SECTORS, calculateTotalCapacity, calculateOverall, sellPrice, v4 as uuidv4,
  isBefore,
} from '@fm2k/engine';
import type {
  LeagueState, CompetitionState, CompetitionFixture, ClubState, TransferListing, TransferState,
  Position, GameEvents, StadiumSectorConfig, MatchEvent, Player, Formation, Team, GameDateTime,
} from '@fm2k/engine';
import {
  buildEditableCountries, mapTeam, findTeamById, findDivisionForTeam, findCountryForTeam,
} from '../domain/editable-country.ts';
import type { EditableCountry } from '../domain/editable-country.ts';
import { applyPromotionRelegation } from '../domain/promotion.ts';
import type { LastMatchResult } from '../domain/match-result.ts';
import {
  writeSave, SAVE_VERSION, type SaveData, type SaveType,
} from '../data/save-data.ts';
import {
  BUDGET_START, STADIUM_START, SEASON_START, EVENTS_PER_MINUTE, MARKET_SIZE,
  MARKET_REFRESH_INTERVAL, ALL_POSITIONS, LEAGUE_MATCHDAYS, CUP_ROUND_NAMES, cupCompetitionId,
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
  cupStates: Record<string, CompetitionState>;
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
  private seasons: Record<string, Season> = {};
  private leagueManagers: Record<string, CompetitionManager> = {};
  private cupManagers: Record<string, CompetitionManager> = {};
  private leagueManager: CompetitionManager | null = null;
  private playerCupManager: CompetitionManager | null = null;
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
    const cupStates: Record<string, CompetitionState> = {};
    for (const [id, mgr] of Object.entries(this.cupManagers)) {
      cupStates[id] = mgr.getState();
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
      cupStates,
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
        competitionId: payload.competitionId,
        roundLabel: payload.roundLabel,
        decidedBy: payload.decidedBy,
        shootout: payload.shootout,
        winnerTeamId: payload.winnerTeamId,
      };
    });

    // Build a per-nation Season: its league divisions plus its national cup. The
    // EventBus is wired only to the player's own division and the player's cup so
    // their results drive lastMatchResult, gate receipts, and injuries.
    const seasons: Record<string, Season> = {};
    const leagueManagers: Record<string, CompetitionManager> = {};
    const cupManagers: Record<string, CompetitionManager> = {};

    for (const countryId of allLeagueIds) {
      const country = editableCountries.find(c => c.id === countryId);
      if (!country) { continue; }
      const isPlayerNation = country.id === playerCountry?.id;
      const competitions: CompetitionManager[] = [];

      for (const div of country.divisions) {
        const lm = new CompetitionManager({
          format: new LeagueFormat(),
          teams: div.teams,
          startDate: SEASON_START,
          seasonStart: SEASON_START,
          competitionId: div.id,
          name: div.name,
          eventsPerMinute: EVENTS_PER_MINUTE,
          eventBus: div.id === division.id ? eventBus : undefined,
        });
        leagueManagers[div.id] = lm;
        competitions.push(lm);
      }

      const allTeams = country.divisions.flatMap(d => d.teams);
      const levelByTeamId = new Map<string, number>();
      for (const div of country.divisions) {
        for (const t of div.teams) { levelByTeamId.set(t.id, div.level); }
      }
      const cupId = cupCompetitionId(country.id);
      const cup = new CompetitionManager({
        format: new KnockoutFormat({
          kind: 'knockout', byeLevel: 1, preliminaryLevels: [2, 3],
          roundNames: CUP_ROUND_NAMES, byeTeamPlaysAway: true, higherSlotHostsFromRound: 3,
          leagueMatchdays: LEAGUE_MATCHDAYS,
        }),
        teams: allTeams,
        levelByTeamId,
        startDate: SEASON_START,
        seasonStart: SEASON_START,
        competitionId: cupId,
        name: `${country.name} Cup`,
        eventsPerMinute: EVENTS_PER_MINUTE,
        eventBus: isPlayerNation ? eventBus : undefined,
      });
      cupManagers[cupId] = cup;
      competitions.push(cup);

      seasons[country.id] = new Season({ nationId: country.id, startDate: SEASON_START, competitions });
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

    this.seasons = seasons;
    this.leagueManagers = leagueManagers;
    this.cupManagers = cupManagers;
    this.leagueManager = leagueManagers[division.id];
    this.playerCupManager = playerCountry ? cupManagers[cupCompetitionId(playerCountry.id)] : null;
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

  /**
   * Roll over to the next season: apply promotion/relegation from the just-finished
   * standings, then rebuild every division (and the player's club) from the updated
   * memberships.
   */
  startNewSeason(): boolean {
    if (!this.playerTeamId) { return false; }
    const ranked: Record<string, string[]> = {};
    for (const [divId, lm] of Object.entries(this.leagueManagers)) {
      ranked[divId] = lm.getState().standings.map(s => s.teamId);
    }
    this.editableCountries = applyPromotionRelegation(this.editableCountries, ranked);
    return this.startGame(this.playerTeamId, this.selectedLeagueIds);
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
      cupStates: snap.cupStates,
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
    if (save.cupStates) {
      for (const [id, state] of Object.entries(save.cupStates)) {
        this.cupManagers[id]?.loadState(state);
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

  /** The player's earliest scheduled fixture across their league and cup. */
  private playerNextFixture(): CompetitionFixture | null {
    if (!this.playerTeamId) { return null; }
    const managers = [this.leagueManager, this.playerCupManager].filter(Boolean) as CompetitionManager[];
    let next: CompetitionFixture | null = null;
    for (const mgr of managers) {
      for (const f of mgr.getState().fixtures) {
        if (f.status !== 'scheduled') { continue; }
        if (f.homeTeamId !== this.playerTeamId && f.awayTeamId !== this.playerTeamId) { continue; }
        if (next === null || isBefore(f.scheduledTime, next.scheduledTime)) { next = f; }
      }
    }
    return next;
  }

  private isFixtureCompleted(fixtureId: string): boolean {
    for (const mgr of [...Object.values(this.leagueManagers), ...Object.values(this.cupManagers)]) {
      const f = mgr.getState().fixtures.find(fx => fx.id === fixtureId);
      if (f) { return f.status === 'completed'; }
    }
    return false;
  }

  /**
   * Advance the global clock by one chronological block: find the earliest upcoming
   * kickoff across every nation's competitions and play exactly the matches due then
   * (a league matchday or a cup round). Returns false when nothing remains.
   */
  private async advanceBlock(): Promise<boolean> {
    const active = Object.values(this.seasons).filter(s => s.hasNext());
    if (!active.length) { this.seasonComplete = true; return false; }

    let target: GameDateTime | null = null;
    for (const s of active) {
      const t = s.peekNextTickTime();
      if (t && (target === null || isBefore(t, target))) { target = t; }
    }
    if (target === null) { return false; }

    await Promise.all(active.map(s => s.advanceTo(target!)));

    // Club recovery and the transfer market move on league-matchday boundaries only.
    const newMatchday = this.leagueManager?.completedRounds() ?? this.currentMatchday;
    if (newMatchday > this.currentMatchday) {
      this.clubManager?.handleMatchdayComplete();
      if (newMatchday % MARKET_REFRESH_INTERVAL === 0) {
        this.transferManager?.refreshMarket(newMatchday);
      }
      this.currentMatchday = newMatchday;
    }
    this.seasonComplete = !Object.values(this.seasons).some(s => s.hasNext());
    return true;
  }

  /** Advance until the player's next match has been played (any competition). */
  async simulateMatchday(): Promise<void> {
    this.lastMatchResult = null;
    const next = this.playerNextFixture();
    if (!next) { await this.advanceBlock(); this.notify(); return; }
    while (!this.isFixtureCompleted(next.id)) {
      if (!await this.advanceBlock()) { break; }
    }
    this.notify();
  }

  /** Simulate every remaining match across all competitions to the end of the season. */
  async simulateToEnd(): Promise<void> {
    this.lastMatchResult = null;
    while (await this.advanceBlock()) { /* play every block */ }
    this.notify();
  }

  /**
   * Play the player's next fixture (league or cup): produce the key events to animate
   * (from a display sim) and advance the real season through it. `lastMatchResult` is
   * set from the engine's `match.completed`.
   */
  async playMatch(): Promise<PlayedMatch | null> {
    if (!this.playerTeamId) { return null; }
    const fixture = this.playerNextFixture();
    if (!fixture) { return null; }

    const homeTeam = findTeamById(this.editableCountries, fixture.homeTeamId);
    const awayTeam = findTeamById(this.editableCountries, fixture.awayTeamId);
    if (!homeTeam || !awayTeam) { return null; }

    const isCup = this.playerCupManager?.getState().competitionId === fixture.competitionId;
    const displaySim = new MatchSimulator({
      matchDuration: 90, eventsPerMinute: 4, homeTeam, awayTeam, extraTimeIfDrawn: isCup,
    });
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
