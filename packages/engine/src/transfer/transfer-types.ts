import type { ClubPlayer } from '../club/club-types.ts';
import type { Player } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';

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
  /** Calendar date each free agent becomes visible to AI clubs (drawn as a small daily pickup
   *  chance at listing time). Missing entry = visible immediately (old saves, seeded pools). */
  freeAgentAvailability?: Record<string, GameDateTime>
}
