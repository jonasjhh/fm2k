import { StateManager } from '@fm2k/state';
import { PlayerGenerator } from '@fm2k/players';
import { v4 as uuidv4 } from '@fm2k/state';
import type { Player, PlayerAttributes } from '@fm2k/match';
import { calculateOverall, ALL_PLAYER_POSITIONS } from '@fm2k/match';
import type { ClubPlayer } from '../club/club-types.ts';
import type { ClubManager } from '../club/club-manager.ts';
import type { TransferState, TransferListing } from './transfer-types.ts';
import { addDays, isAfter, type GameDateTime } from '@fm2k/timeline';

function calculateAskingPrice(attrs: PlayerAttributes): number {
  const overall = calculateOverall(attrs);
  return Math.max(1_000, Math.round(overall * overall * 500));
}

// ── AI pickup delay ─────────────────────────────────────────────────────────────
// A newly listed free agent isn't snapped up by AI clubs instantly: each day there is a small
// chance "someone" spots them, so most players become AI-visible after a week or two — but the
// distribution lets it run shorter or longer. The manager always sees the whole pool.
export const AI_PICKUP_DAILY_CHANCE = 0.12;
export const AI_PICKUP_MAX_DAYS = 28;

/** Days until an AI club may sign a fresh free agent: a geometric draw at the daily chance. */
export function aiPickupDelayDays(rng: () => number, dailyChance = AI_PICKUP_DAILY_CHANCE, maxDays = AI_PICKUP_MAX_DAYS): number {
  for (let day = 1; day < maxDays; day++) {
    if (rng() < dailyChance) { return day; }
  }
  return maxDays;
}

export interface TransferManagerConfig {
  readonly marketSize?: number       // total listings in market, default 10
  readonly listingDuration?: number  // matchdays until a listing expires, default 3
  readonly playerFactory?: () => Player
  readonly rng?: () => number
  /** The free-agent pool to seed at construction — a small fresh random batch for a brand-new
   *  game, or the previous (already churned) pool carried across a season rollover. Defaults
   *  to empty. */
  readonly initialFreeAgents?: Player[]
  /** AI-visibility dates carried along with `initialFreeAgents` (season rollover keeps the
   *  pickup-delay drip intact for players still waiting). Defaults to none = all visible. */
  readonly initialFreeAgentAvailability?: Record<string, GameDateTime>
}

export class TransferManager {
  private readonly stateManager: StateManager<TransferState>;
  private readonly marketSize: number;
  private readonly listingDuration: number;
  private readonly playerFactory: () => Player;
  private readonly rng: () => number;

  constructor(config: TransferManagerConfig = {}) {
    this.marketSize = config.marketSize ?? 10;
    this.listingDuration = config.listingDuration ?? 3;

    const rng = config.rng ?? Math.random.bind(Math);
    this.rng = rng;

    if (config.playerFactory) {
      this.playerFactory = config.playerFactory;
    } else {
      const generator = new PlayerGenerator();
      this.playerFactory = () => {
        const position = ALL_PLAYER_POSITIONS[Math.floor(rng() * ALL_PLAYER_POSITIONS.length)];
        const overall = 40 + Math.floor(rng() * 30); // 40–69: D3 fringe through solid D1
        return generator.generatePlayer(position, { overall });
      };
    }

    this.stateManager = new StateManager<TransferState>({
      listings: this.generateListings(this.marketSize, 0),
      refreshedOnMatchday: 0,
      freeAgents: config.initialFreeAgents ?? [],
      freeAgentAvailability: config.initialFreeAgentAvailability ?? {},
    });
  }

  loadState(state: TransferState): void {
    this.stateManager.setState({ ...state, freeAgents: state.freeAgents ?? [] });
  }

  getFreeAgents(): Player[] {
    return this.stateManager.getState().freeAgents;
  }

  /** Free agents already visible to AI clubs at `now` — the manager sees everyone via
   *  `getFreeAgents`, but the AI only sees a player once their pickup-delay date has passed. */
  getAiEligibleFreeAgents(now: GameDateTime): Player[] {
    const s = this.stateManager.getState();
    const availability = s.freeAgentAvailability ?? {};
    return s.freeAgents.filter(p => {
      const from = availability[p.id];
      return from === undefined || !isAfter(from, now);
    });
  }

  /** Add players to the free-agent pool (sold players, released players, churn youth).
   *  With `listedOn`, each newcomer draws a pickup delay before AI clubs can see them. */
  addFreeAgents(players: Player[], listedOn?: GameDateTime): void {
    if (players.length === 0) { return; }
    this.stateManager.updateState(s => {
      s.freeAgents.push(...players);
      if (listedOn) {
        s.freeAgentAvailability ??= {};
        for (const p of players) {
          s.freeAgentAvailability[p.id] = addDays(listedOn, aiPickupDelayDays(this.rng));
        }
      }
    });
  }

  /** Replace the whole free-agent pool (used after world churn / AI market re-shuffles it).
   *  Players already in the pool keep their availability date; with `listedOn`, newcomers draw
   *  a fresh pickup delay; stamps of departed players are pruned. `restampAll` redraws every
   *  stamp from `listedOn` — used at the season boundary, where the game calendar resets and
   *  old-season dates would otherwise read as far in the future. */
  setFreeAgents(players: Player[], listedOn?: GameDateTime, restampAll = false): void {
    this.stateManager.updateState(s => {
      const prev = s.freeAgentAvailability ?? {};
      const next: TransferState['freeAgentAvailability'] = {};
      for (const p of players) {
        if (!restampAll && prev[p.id] !== undefined) {
          next[p.id] = prev[p.id];
        } else if (listedOn) {
          next[p.id] = addDays(listedOn, aiPickupDelayDays(this.rng));
        }
      }
      s.freeAgents = players;
      s.freeAgentAvailability = next;
    });
  }

  getState(): TransferState {
    return this.stateManager.getState();
  }

  subscribe(listener: (state: TransferState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  getListings(): TransferListing[] {
    return this.stateManager.getState().listings;
  }

  // Returns listings that have not yet expired as of currentMatchday
  getActiveListings(currentMatchday: number): TransferListing[] {
    return this.stateManager.getState().listings.filter(
      l => l.expiresOnMatchday > currentMatchday,
    );
  }

  // Removes expired listings then fills back up to marketSize — drawing from the free-agent pool
  // first (sold/released/youth players), falling back to freshly generated players if it runs dry.
  refreshMarket(currentMatchday: number): void {
    this.stateManager.updateState(state => {
      state.listings = state.listings.filter(l => l.expiresOnMatchday > currentMatchday);
      let needed = this.marketSize - state.listings.length;
      while (needed > 0 && state.freeAgents.length > 0) {
        const player = state.freeAgents.shift() as Player;
        delete state.freeAgentAvailability?.[player.id];
        state.listings.push(this.listingFor(player, currentMatchday));
        needed--;
      }
      if (needed > 0) {
        state.listings.push(...this.generateListings(needed, currentMatchday));
      }
      state.refreshedOnMatchday = currentMatchday;
    });
  }

  // Attempts to buy the listed player via clubManager. Removes listing on success.
  purchase(listingId: string, clubManager: ClubManager): boolean {
    const listing = this.stateManager.getState().listings.find(l => l.id === listingId);
    if (!listing) {return false;}

    const bought = clubManager.buyPlayer(listing.player, listing.askingPrice);
    if (!bought) {return false;}

    this.stateManager.updateState(s => {
      s.listings = s.listings.filter(l => l.id !== listingId);
    });
    return true;
  }

  private generateListings(count: number, currentMatchday: number): TransferListing[] {
    return Array.from({ length: count }, () => this.listingFor(this.playerFactory(), currentMatchday));
  }

  /** Wrap a (free-agent or freshly generated) player into a priced, time-limited listing. */
  private listingFor(player: Player, currentMatchday: number): TransferListing {
    const clubPlayer: ClubPlayer = { ...player, fitness: 1000 };
    return {
      id: uuidv4(),
      player: clubPlayer,
      askingPrice: calculateAskingPrice(player.attributes),
      expiresOnMatchday: currentMatchday + this.listingDuration,
    };
  }
}
