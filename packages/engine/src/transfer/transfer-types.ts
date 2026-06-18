import type { ClubPlayer } from '../club/club-types.ts';
import type { Player } from '@fm2k/match';

export interface TransferListing {
  id: string
  player: ClubPlayer
  askingPrice: number
  expiresOnMatchday: number
}

export interface TransferState {
  listings: TransferListing[]
  refreshedOnMatchday: number
  /** Free agents awaiting a listing — sold players, released players, and churn youth. */
  freeAgents: Player[]
}
