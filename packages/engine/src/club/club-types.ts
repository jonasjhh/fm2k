import type { Player, Formation, PlayerAttributes, TeamShapes, FormationPosition } from '@fm2k/match';
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
  /** An injury is a fixed period of calendar time, so it is stored as the date the player is
   *  fit again rather than a countdown of matches. How many fixtures it actually costs then
   *  depends on how congested the run is — which is the point: the same hamstring pull costs
   *  one match in a quiet February and three over Christmas. `originalDays` is the layoff as
   *  first confirmed, kept so `player.injuryCleared` can report how serious it was after
   *  the fact. */
  injury?: { type: string; returnDate: GameDateTime; originalDays: number }
  /** Suspensions stay match-based — those genuinely are counted in matches, not days. */
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
  /** Players in the squad at the last rollover who had no season-start baseline: youth intake and
   *  mid-season signings. They are absent from `recentDevelopment` because there is nothing to
   *  diff, which is *not* the same as having failed to develop — the UI must say so, or a fresh
   *  16-year-old reads as a player who stagnated. Replaced wholesale each season-end rollover. */
  recentArrivals: string[]
  /** Manager-chosen dual-shape override (attacking + defending anchor per outfield XI
   *  player) — `null` means both shapes follow `formation`'s predefined template as-is.
   *  Reset to `null` whenever `formation` changes (slot indices and their meaning change
   *  with it). Seeded identically in both shapes on first edit; arrows are the difference. */
  shapes: TeamShapes | null
  /** Explicit role label overrides keyed by outfield slot index (1–10), like `shapes`.
   *  Applied on top of the geometry-derived role. Cleared when formation changes. */
  roleOverrides: Record<number, FormationPosition>
}
