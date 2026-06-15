import type { Player, Formation } from '../shared/types.ts';
import type { TeamTacticsIntent } from '../tactics/intent-types.ts';
import type { GameDateTime } from '@fm2k/timeline';

export interface ClubPlayer extends Player {
  fitness: number  // 0–100
  injury?: { type: string; matchesRemaining: number }
  suspension?: { matchesRemaining: number }
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

export interface StadiumSectorConfig {
  type: string         // stand type key e.g. 'double-tier', 'open-bleacher'
  densityValue: number // seat spacing; lower = more seats (range 10–50)
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
}
