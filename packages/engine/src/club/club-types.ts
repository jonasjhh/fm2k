import type { Player, Formation, PlayerAttributes, PlayerGeometry } from '@fm2k/match';
import type { TeamTacticsIntent } from '@fm2k/match';
import type { GameDateTime } from '@fm2k/timeline';
import type { RegimentId } from '../player/progression.ts';
import type { PlayerDelta } from '../world/world-churn.ts';
import type { StadiumSectorConfig } from '../stadium/stadium.ts';
import type { ClubFacilities } from './facilities/facility-types.ts';

export type { StadiumSectorConfig };

export interface ClubPlayer extends Player {
  /** 0–1000 (tenths of a fitness point; the UI displays this divided by 10). The finer
   *  resolution lets recovery vary by tiny, sub-integer amounts (stamina, facility level). */
  fitness: number
  injury?: { type: string; matchesRemaining: number }
  suspension?: { matchesRemaining: number }
  /** The player's training focus; defaults to 'balanced' when unset. */
  training?: RegimentId
}

export interface FinancialTransaction {
  type:
    | 'gate_receipt' | 'transfer_in' | 'transfer_out' | 'facility_upgrade'
    | 'wages' | 'league_prize' | 'cup_prize'
    | 'facility_build' | 'facility_maintenance'
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
  /** The 11 starting slots, slot-ordered (slot 0 = GK, 1-10 = FORMATION_LINES[formation]'s
   *  outfield order) — always exactly 11 entries; `null` means that slot is deliberately
   *  unfilled. Positional, not just a roster: every consumer that reads slot 0 as "the GK" or
   *  zips this against FORMATION_LINES relies on this exact order being preserved. */
  startingXI: (string | null)[]
  benchPlayers: string[]       // player IDs, 4–7
  pendingSubstitutions: SubstitutionRequest[]
  facilities: ClubFacilities
  /** Consecutive weekly maintenance ticks the budget has ended negative; see
   *  ClubManager.tickFacilityMaintenance. */
  facilityDeficitStreak: number
  stadiumCapacity: number
  stadiumSectors: Record<string, StadiumSectorConfig>
  financialLog: FinancialTransaction[]
  /** Net attribute deltas from the most recent season-end rollover (replaced wholesale each season).
   *  Reflects the full season's change — in-season per-match training plus the season-end batch. */
  recentDevelopment: PlayerDelta[]
  /** Each squad player's attributes as of the start of the current season — the baseline
   *  `recentDevelopment` is diffed against; reseeded wholesale each season-end rollover. */
  seasonStartSnapshot: Record<string, PlayerAttributes>
  /** Manager-chosen free-positioning override, keyed by player id — `null` means the team
   *  uses `formation`'s predefined template as-is. Reset to `null` whenever `formation`
   *  changes (slot indices and their meaning change with it). */
  customSlots: Record<string, PlayerGeometry> | null
  /** A manager's pending geometry (band + lateral + role) for a currently-empty outfield slot
   *  (keys 1-10 only; slot 0/GK is never overridable) — the slot's *former* occupant's
   *  `customSlots` entry, captured before it was pruned, so a player moved to a non-template
   *  band/lateral doesn't lose that placement just because they're unassigned. Has no effect
   *  until a player is assigned to that slot, at which point it seeds their `customSlots` entry
   *  wholesale and is cleared. Reset to `null` whenever `formation` changes, mirroring
   *  `customSlots`. */
  emptySlotRoles: Partial<Record<number, PlayerGeometry>> | null
}
