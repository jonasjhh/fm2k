# TASK 8 — Custom confirm/alert modal (design-system), replacing every browser prompt

> Conventions and commands: see the backlog index (Claude plan file). Run everything via `mise exec -- pnpm <cmd>`, never commit. Update `MANUAL_TEST_PLAN.md` when this task finishes.

**Context**: 8 call sites use blocking browser `confirm()`/`alert()` (ugly, unthemed, freeze the UI thread). MUI/MD3 has a `Dialog` primitive but NO out-of-the-box imperative confirm — so build it in the design library. **User decision: global provider + promise-based hook.**

**Verified call sites** (every one in the repo, excl. tests):
- `apps/web/src/components/MatchSimPanel.tsx:129,154` — `confirm('Simulate all remaining matches?')`
- `apps/web/src/components/StadiumPlanner.tsx:120` — `alert('Insufficient budget.')`
- `apps/web/src/components/club/StadiumSubPage.tsx:21` — `confirm('Apply stadium renovation for £…')`
- `apps/web/src/components/tabs/SquadTab.tsx:94` — `confirm('Sell X for £…')`
- `apps/web/src/screens/TeamEditor.tsx:385` — `confirm('Replace all players in …')`
- `apps/web/src/utils/transfers.ts:11,13` — `buyPlayerWithConfirm` (confirm + failure alert), used by `ScoutedPlayerModal.tsx` and `TransfersTab.tsx`

**Build** (in `packages/design-system/src/components/`, following the existing `SectionHeader`/`StatsCard` file-per-component pattern, exported via `src/index.ts`):
- `ConfirmProvider.tsx`: React context + ONE MUI `Dialog` instance styled like an alert (compact, title, message, optional destructive red confirm button). Exposes two hooks:
  - `useConfirm(): (opts: { title?, message, confirmLabel?, cancelLabel?, destructive? }) => Promise<boolean>`
  - `useAlert(): (opts: { title?, message }) => Promise<void>` (OK-only variant of the same dialog)
  - Hook called outside the provider → throw (loud failure, not a silent fallback).
- Tests in the design-system `components.test.tsx` pattern: resolves true/false on confirm/cancel, alert resolves on OK, message/labels render.

**Wire**: mount `<ConfirmProvider>` in `apps/web/src/App.tsx` inside the `ThemeProvider` (next to `ToastHost`). Replace all call sites; handlers become `async`. `buyPlayerWithConfirm` (a plain function) becomes a hook `useBuyPlayerWithConfirm()` in the same file wrapping `useConfirm`+`useAlert` — update its two consumers.

**Tests to update**: any web component test that triggers a confirm path now needs the provider in its render wrapper (check `MatchSimPanel.test.tsx`, `StadiumPlanner.test.tsx`, `TransfersTab`/`ScoutedPlayerModal` tests); interactions become `await`-based (`findBy*` after clicking the dialog's confirm button).

**Verify**: `mise exec -- pnpm check`; update `MANUAL_TEST_PLAN.md` (each replaced prompt shows the themed modal; cancel aborts; confirm proceeds).
