# TASK 4 — Academy intake day (parked; suggestion, not a spec — the underlying data already exists)

> Conventions and commands: see the backlog index (Claude plan file). Run everything via `mise exec -- pnpm <cmd>`, never commit.

This isn't fleshed out as a build spec, because the interesting part (fuzzy potential ranges) turned out to already be modeled — what's missing is purely a player-facing surface. Treat the below as a starting point for a conversation with the user about whether/how they want it shown, not a fixed design.

**What already exists today**: season rollover silently runs `makeYouth`/`academyBiasForLevel` (`world-churn.ts:57,83`) to generate new youth for every club — `ClubManager.handleSeasonComplete()` (`club-manager.ts:756`) only emits `player.developed`/`player.retired` events, nothing marks the new arrivals. There's no youth-intake UI anywhere in `apps/web/src/components` today (confirmed by grep).

**The interesting bit is already there**: `FacilityManager.academyIntakeQualityBonus(facilities)` (`facility-manager.ts:137`) returns `{overallBonus: number, potentialRangeBonus: [number, number]}` — potential for academy-generated players is *already* a range that widens/shifts with facility tier, and `FacilityManager.academyBias(facilities)` (line 155, used by `ClubManager` via `churnSquad` for the player's own club) already produces it. So a "fuzzy potential, better scouts = tighter range" feature would be surfacing existing numbers, not inventing a new mechanic.

**Possible direction, for discussion**: some kind of season-start moment (a modal, a notification with a squad-screen highlight, or something lighter) that shows the club's new academy arrivals with their potential displayed as the range above, plus a keep/release choice. `SeasonEndModal.tsx` is a reasonable UI pattern to look at (non-dismissible MUI `Dialog`, `useShallow` store selector, derived data computed locally) if a modal ends up being the right shape — but confirm with the user first whether they even want a blocking modal here, versus something less intrusive.
