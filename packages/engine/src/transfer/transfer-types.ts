import type { ClubPlayer } from '../club/club-types.ts';

export interface TransferListing {
  id: string
  player: ClubPlayer
  askingPrice: number
  expiresOnMatchday: number
}

export interface TransferState {
  listings: TransferListing[]
  refreshedOnMatchday: number
}
