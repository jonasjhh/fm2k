import { StateManager } from '../state/state-manager.ts';
import { PlayerGenerator } from '../player/player-generator.ts';
import { v4 as uuidv4 } from '../shared/uuid.ts';
import type { Player, PlayerAttributes, Position } from '../shared/types.ts';
import type { ClubPlayer } from '../club/club-types.ts';
import type { ClubManager } from '../club/club-manager.ts';
import type { TransferState, TransferListing } from './transfer-types.ts';

const POSITIONS: Position[] = [
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF',
];

// Weights from the plan: finishing + technique dominate, rest equal
export const OVERALL_WEIGHTS: Record<keyof PlayerAttributes, number> = {
  finishing:  0.15,
  technique:  0.15,
  passing:    0.1,
  speed:      0.1,
  strength:   0.1,
  defending:  0.1,
  stamina:    0.1,
  agility:    0.1,
  awareness:  0.1,
  composure:  0.1,
};

export function calculateOverall(attrs: PlayerAttributes): number {
  return (Object.keys(OVERALL_WEIGHTS) as Array<keyof PlayerAttributes>).reduce(
    (sum, key) => sum + attrs[key] * OVERALL_WEIGHTS[key],
    0,
  );
}

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
        return generator.generatePlayer(position);
      };
    }

    this.stateManager = new StateManager<TransferState>({
      listings: this.generateListings(this.marketSize, 0),
      refreshedOnMatchday: 0,
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

  // Removes expired listings then fills back up to marketSize with fresh ones
  refreshMarket(currentMatchday: number): void {
    this.stateManager.updateState(state => {
      state.listings = state.listings.filter(l => l.expiresOnMatchday > currentMatchday);
      const needed = this.marketSize - state.listings.length;
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
    return Array.from({ length: count }, () => {
      const player = this.playerFactory();
      const clubPlayer: ClubPlayer = { ...player, fitness: 100 };
      return {
        id: uuidv4(),
        player: clubPlayer,
        askingPrice: calculateAskingPrice(player.attributes),
        expiresOnMatchday: currentMatchday + this.listingDuration,
      };
    });
  }
}
