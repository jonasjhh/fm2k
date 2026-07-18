# TASK 9 — Extract more components into the design library

> Conventions and commands: see the backlog index (Claude plan file). Run everything via `mise exec -- pnpm <cmd>`, never commit. Update `MANUAL_TEST_PLAN.md` when this task finishes.

**Context**: encourage reuse, reduce code size, increase encapsulation. `packages/design-system` today has only `SectionHeader`, `StatsCard`, `ScrollableTable`, `Flag` (+ theme/colors, and `ConfirmProvider` once TASK 8 lands). Several app components are generic chrome that belongs there. Engine-coupled components (`FormationGrid`, `TacticsPitch`, `PlayerStatusChip`, `SlotLabel`, anything importing `@fm2k/engine` or the store) stay in the app.

**Verified extraction candidates**, in order:
1. `FitnessBar` (`apps/web/src/components/ui/FitnessBar.tsx`) — zero non-MUI deps, fully generic labelled progress bar. Move as-is + its test.
2. `SelectorPanel` (`apps/web/src/components/ui/SelectorPanel.tsx`) — zero non-MUI deps, generic bordered container. Move as-is.
3. `ButtonSelector` (`apps/web/src/components/ui/ButtonSelector.tsx`) — generic toggle-row control but currently reads club colours via the store-coupled `useClubColors` hook. Extract with colours as optional props (`activeColor`, `activeContrast`, defaulting to theme primary); keep a thin app-side wrapper in `components/ui/` that injects `useClubColors()` so every existing usage keeps its look with no call-site changes.
4. `FormBadge` (currently a private component inside `MatchTab.tsx:18-21`) — W/D/L chip; promote to design-system so future form displays (fixtures, table) reuse it.
5. **Assess during implementation** (extract only if the shape genuinely matches across sites): the team-coloured header bar pattern (`MatchTab.renderTeam` header, `TeamLineupDialog`/`TeamSquadDialog` titles) — a `ColorHeader({ bg, children })` using the design-system's existing `getContrastColor`.

**Mechanics per component**: move file + colocated test into `packages/design-system/src/components/`, export from `src/index.ts`, update app imports directly (no permanent re-export shims), run web + design-system tests. Note: `getContrastColor`/status colors are ALREADY in design-system (`apps/web/src/utils/colors.ts` just re-exports) — no action there.

**Verify**: `mise exec -- pnpm check`; visual spot-check that Squad (FitnessBar), tab selectors (ButtonSelector/SelectorPanel) and the Match tab (FormBadge) look unchanged; update `MANUAL_TEST_PLAN.md`.
