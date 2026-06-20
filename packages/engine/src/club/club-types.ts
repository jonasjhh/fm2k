import type { Player, Formation, PlayerAttributes } from '@fm2k/match';
import type { TeamTacticsIntent } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import type { RegimentId } from '../player/progression.ts';
import type { PlayerDelta } from '../world/world-churn.ts';
import type { StadiumSectorConfig } from '../stadium/stadium.ts';

export type { StadiumSectorConfig };

export interface ClubPlayer extends Player {
  fitness: number  // 0–100
  injury?: { type: string; matchesRemaining: number }
  suspension?: { matchesRemaining: number }
  /** The player's training focus; defaults to 'balanced' when unset. */
  training?: RegimentId
}

export type FacilityLevel = 1 | 2 | 3 | 4

export interface FacilityLevels {
  medical: FacilityLevel    // reduces injury duration
  training: FacilityLevel   // improves attribute growth
  academy: FacilityLevel    // improves youth player generation quality
}

export interface FinancialTransaction {
  type: 'gate_receipt' | 'transfer_in' | 'transfer_out' | 'facility_upgrade' | 'wages'
  amount: number
  description: string
  timestamp?: GameDateTime
}

export interface SubstitutionRequest {
  playerOutId: string
  playerInId: string
}

export interface ClubState {
  clubId: string
  clubName: string
  divisionId: string
  budget: number
  squad: ClubPlayer[]
  formation: Formation
  tactics: TeamTacticsIntent   // formation (mirrored) + style + sliders
  startingXI: string[]         // player IDs, exactly 11
  benchPlayers: string[]       // player IDs, 4–7
  pendingSubstitutions: SubstitutionRequest[]
  facilities: FacilityLevels
  stadiumCapacity: number
  stadiumSectors: Record<string, StadiumSectorConfig>
  financialLog: FinancialTransaction[]
  /** Net attribute deltas from the most recent season-end rollover (replaced wholesale each season).
   *  Reflects the full season's change — in-season per-match training plus the season-end batch. */
  recentDevelopment: PlayerDelta[]
  /** Each squad player's attributes as of the start of the current season — the baseline
   *  `recentDevelopment` is diffed against; reseeded wholesale each season-end rollover. */
  seasonStartSnapshot: Record<string, PlayerAttributes>
}
