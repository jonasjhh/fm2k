import { StateManager } from '@fm2k/state';
import { PlayerGenerator } from '../player/player-generator.ts';
import { v4 as uuidv4 } from '@fm2k/state';
import type { Player, PlayerAttributes, Position } from '@fm2k/match';
import { calculateOverall, OVERALL_WEIGHTS } from '@fm2k/match';
import type { ClubPlayer } from '../club/club-types.ts';
import type { ClubManager } from '../club/club-manager.ts';
import type { TransferState, TransferListing } from './transfer-types.ts';

// Re-exported for back-compat: ratings now live in @fm2k/match.
export { calculateOverall, OVERALL_WEIGHTS };

const POSITIONS: Position[] = [
  'GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

function calculateAskingPrice(attrs: PlayerAttributes): number {
  const overall = calculateOverall(attrs);
  return Math.max(1_000, Math.round(overall * overall * 500));
}

export interface TransferManagerConfig {
  readonly marketSize?: number       // total listings in market, default 10
  readonly listingDuration?: number  // matchdays until a listing expires, default 3
  readonly playerFactory?: () => Player
  readonly rng?: () => number
}

export class TransferManager {
  private readonly stateManager: StateManager<TransferState>;
  private readonly marketSize: number;
  private readonly listingDuration: number;
  private readonly playerFactory: () => Player;

  constructor(config: TransferManagerConfig = {}) {
    this.marketSize = config.marketSize ?? 10;
    this.listingDuration = config.listingDuration ?? 3;

    const rng = config.rng ?? Math.random.bind(Math);

    if (config.playerFactory) {
      this.playerFactory = config.playerFactory;
    } else {
      const generator = new PlayerGenerator();
      this.playerFactory = () => {
        const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];
        return generator.generatePlayer(position, { overall: 60 });
      };
    }

    this.stateManager = new StateManager<TransferState>({
      listings: this.generateListings(this.marketSize, 0),
      refreshedOnMatchday: 0,
      freeAgents: [],
    });
  }

  loadState(state: TransferState): void {
    this.stateManager.setState({ ...state, freeAgents: state.freeAgents ?? [] });
  }

  getFreeAgents(): Player[] {
    return this.stateManager.getState().freeAgents;
  }

  /** Add players to the free-agent pool (sold players, released players, churn youth). */
  addFreeAgents(players: Player[]): void {
    if (players.length === 0) { return; }
    this.stateManager.updateState(s => { s.freeAgents.push(...players); });
  }

  /** Replace the whole free-agent pool (used after world churn / AI market re-shuffles it). */
  setFreeAgents(players: Player[]): void {
    this.stateManager.updateState(s => { s.freeAgents = players; });
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
    const clubPlayer: ClubPlayer = { ...player, fitness: 100 };
    return {
      id: uuidv4(),
      player: clubPlayer,
      askingPrice: calculateAskingPrice(player.attributes),
      expiresOnMatchday: currentMatchday + this.listingDuration,
    };
  }
}
