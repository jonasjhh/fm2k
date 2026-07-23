# TASK 20 — Calendar/time-driven world events (de-couple side effects from matchday)

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once.

## What this is

World side effects (transfer-window open/close notifications, AI market passes, injury/suspension
countdowns, market refresh) are currently driven by **matchday completion** in
`Session.applyClockSideEffects` ([`backend/src/app/session.ts`](backend/src/app/session.ts)), keyed off
`leagueManager.completedRounds()`. Matchday is a **league grouping concept** — "which matches belong to
the same round" — not a unit of time. Tying calendar events to it is the wrong model and causes real bugs:

- **Missed transitions on multi-matchday advances.** The open/close check compares only the *endpoints*
  (`transferWindow(prev)` vs `transferWindow(next)`). When a single clock advance crosses several
  matchdays — most obviously *simulate a whole season*, but also any skip — a window that both opens and
  closes inside that span emits **nothing**. This is why the mid-season "window is now open" toast never
  appears when simulating quickly.
- **No event at season start.** The pre-season window is already open at kickoff (`currentMatchday = 0`),
  so there is never an open→ transition and no "window open" notification for a new season.
- **Under-firing per-matchday hooks.** `handleMatchdayComplete` (injury/suspension countdown, documented
  "call once per matchday end") and `runAiMarketWindow` run **once per advance**, not once per matchday
  crossed — so a multi-round jump under-ticks injuries and skips AI market passes.

## Desired model

Side effects should be **calendar/time-driven**, reconciled as the clock moves through
`previousNow → now` in `advanceClockTo` / `drainClockTo`, firing whatever boundaries the time span
crossed — independent of whether a match was played.

- Express transfer-window boundaries (and similar events) as **calendar dates**, not matchday counts —
  or, at minimum, reconcile the full set of transitions crossed during a time advance rather than the
  endpoints only.
- Route open/close, market refresh, AI market, and injury/suspension countdowns through the
  time-advance reconciliation so each fires the correct number of times regardless of jump size.
- A new-season kickoff with a window already open should notify the manager that the window is open.

## Scope notes

- This supersedes the interim `NOTE (TASK_20)` breadcrumb left in `applyClockSideEffects` — remove it
  when this lands.
- Keep `GameNotification` delivery (toast) intact; consider a longer/sticky duration for window events
  so they are not blinked past (needs a `duration` field on `GameNotification`).
- Injury/suspension countdown is conceptually **per match missed**, not per calendar day — decide
  whether it stays match-keyed (fires per completed round, but robustly) or moves to the time model too.

## Success criteria

- Simulating a full season fires **every** transfer-window open and close exactly once, in order
  (add a test that drains a whole season and asserts the emitted `transfer.window` sequence).
- A new season with the pre-season window open notifies the manager it is open.
- Injury/suspension countdowns and AI market passes fire the correct number of times across a
  multi-matchday advance (test a multi-round jump).
- The `NOTE (TASK_20)` comment is gone.
- `mise exec -- pnpm check` green.
