# FM2K — Match & skills rework ("duel engine" / match sim v2)

Status (2026-07-24): **TASK_02, TASK_11, TASK_15, TASK_16, TASK_17, TASK_18, TASK_19, TASK_21, TASK_22, TASK_23 complete.** Repo check green. **Next: TASK_07 recalibration (last engine task).** TASK_12 PARKED.

## Standing rules

- Run everything via `mise exec -- pnpm <cmd>`. Verification = `mise exec -- pnpm check` repo-wide, ONCE.
- NEVER commit. NEVER run `test:calibration` unprompted.
- Never hand-edit `players.json` — regenerate via `pnpm --filter @fm2k/engine populate-teams`.
- Run `pnpm test:coverage` after finishing work.
- Tuning loop: edit → `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.

## Settled calibration numbers (reference)

Duel knobs in `packages/match/src/match/duel/duels.ts` (post-TASK_11):
- Pass: baseChance 0.78, spread **850**, clamp 0.45–0.97
- Dribble: baseChance 0.44, spread **750**, clamp 0.08–0.9
- Speed/Strength: baseChance 0.5, spread **700**, clamp 0.08–0.92
- Shot vs keeper: baseChance **0.095**, spread 800, clamp 0.02–0.35
- Penalty: baseChance 0.76, spread 300, clamp 0.6–0.9
- LONG_BALL_DELIVERY baseChance **0.55** (GK long kick ≈ 50/50, modified by passing)
- **Gap saturation (soft knee):** `saturateGap` — GAP_SATURATION_KNEE 22, GAP_SATURATION_SOFTNESS 3.
  Applied in `duelChance` AND `deliveryCheck`. Below the knee skill counts fully; above it each
  raw point counts 1/3, so mismatches taper (gap-50/75 saturate ~78–80% wins, never 100%).
- **Match-form variance** (`rng.ts`): `MatchForm { attack, defense }` in shot-conversion points. σ 0.05, clamp ±0.10. Three-way: inject `homeForm`/`awayForm` → used verbatim; absent → sim draws; `NEUTRAL_MATCH_FORM` → deterministic.

Flow knobs in `packages/match/src/match/duel/flow.ts`:
- EPM: 13
- Header conversion: `headerFinishAttr = 0.5·strength + 0.5·finishing`
- YELLOW_CHANCE: 0.38, YELLOW_SECOND_BOOKING_MODIFIER: 0.40
- RED_MARGIN: 0.45, RED_CHANCE: 0.01, PRO_FOUL_RED_CHANCE: 0.03
- REBOUND_CHANCE: 0.20, throw-in gate: 25%
- Anti-siphon: `pickReceiver` adds `(finishing-50)/300` bonus for receivers y>0.65

TASK_11 result — gap curve (win%): gap-10 ~63, gap-20 ~72, gap-40/50 ~78–80 (saturated). Even matches ~3.1 goals, draws ~20–24%.

25-season churn (Norway harness): D1 59→62, D2 39→50, D3 28→41; pool OVR stabilises ~30 by season 17.

Market: listing factory draws OVR `40 + floor(rng() * 30)` (40–69); seeded free agents 22–49.

Edge constants (`lineup.ts`): `WIDE_EDGE_LATERAL 0.75` / `CENTRAL_EDGE_LATERAL 0.42` — starting values, TASK_07 re-locks.

## Match step-through debugger plan

### Context
Calibration revealed 2.23 penalties/match (gate: <0.45). Root cause is not yet pinpointed — we need to see exactly which player is where and why a foul is resolving as a penalty. The existing calibration harness only shows aggregate statistics. A step-through debugger gives full tick-level visibility into every duel, position, and follow-up event without altering the sim's logic.

Two deliverables:
1. **Programmatic log** — a script/test I can run that produces a structured log of one full match tick by tick. Used during calibration to grep for penalty entries and read their full context.
2. **Test UI step-through** — a new `/debug` page in `apps/web` where you can step through a game minute by minute, see player dots on a pitch, and read the event list per minute.

### Design principle: no sim changes unless strictly additive

`DuelMatchSimulator` already exposes:
- `simulateMinute(state)` — public, returns `{ events, nextState }`
- `getCurrentState()` — public
- `getStatistics()` — public

The only *missing* piece is access to live positions and ball state between ticks (they are private fields: `this.positions`, `this.ball`). The fix: add a single read-only getter `getLiveState()` that returns a snapshot of those private fields. This is purely additive — no change to any existing method or return type.

`DuelMatchSimulator` and `MatchState`/`MatchConfig` are not currently exported from the package barrel. They need to be exported so the web page and the log script can use them without reaching into internal paths.

---

### Step 1 — Export `DuelMatchSimulator` and required types from the match package

**File:** `packages/match/src/index.ts`

Add exports:
```ts
export { DuelMatchSimulator } from './match/duel/duel-simulator.ts';
export type { MatchState, MatchConfig } from './match/types.ts';
export type { BallState, FlowEvent } from './match/duel/flow.ts';
export type { XY } from './match/duel/field.ts';
```

---

### Step 2 — Add `getLiveState()` to `DuelMatchSimulator`

**File:** `packages/match/src/match/duel/duel-simulator.ts`

One new public method, pure read (returns copies, not references):
```ts
getLiveState(): {
  positions: { home: Record<string, XY>; away: Record<string, XY> };
  ball: BallState;
} {
  return {
    positions: {
      home: { ...this.positions.home },
      away: { ...this.positions.away },
    },
    ball: { ...this.ball },
  };
}
```

Called AFTER `simulateMinute()` to capture the frame for the step-through log/UI. That's it — no other changes to the sim.

---

### Step 3 — Programmatic match log script

**New file:** `packages/match/src/match/match-log.ts`

A `createMatchLog(config: MatchConfig): MatchLog` function. Internally:
1. Creates a `DuelMatchSimulator`
2. Steps through `simulateMinute()` until `isTerminalPhase(state.phase)` 
3. After each minute: captures `{ minute, events, liveState: getLiveState() }`
4. Returns the full `MatchLog` array

```ts
export interface MatchMinuteLog {
  minute: number;
  events: MatchEvent[];
  positionsAfter: { home: Record<string, XY>; away: Record<string, XY> };
  ballAfter: BallState;
}
export type MatchLog = MatchMinuteLog[];
```

**New file:** `packages/match/src/match/match-log.test.ts` (vitest, not calibration)

A single test that runs one seeded match, collects the log, and writes key penalty events to `console.log` so I can grep when running `pnpm --filter @fm2k/match test --reporter=verbose`. No assertions — it's a diagnostic tool. The test is skipped by default (`it.skip`) so it only runs when explicitly invoked with `.only` during investigation.

---

### Step 4 — `/debug` page in `apps/web`

**New file:** `apps/web/src/app/debug/page.tsx`

`'use client'` page following the same pattern as `apps/web/src/app/test/page.tsx`:
- MUI layout, back-arrow to `/`
- Team configuration sliders (home/away OVR, formation dropdowns) — reuse same `makeTeam()` pattern from test page
- "Start match" button: creates a `DuelMatchSimulator` with seeded RNG, calls `getCurrentState()` for initial state
- "Step minute" button: calls `simulateMinute(state)` once, updates React state with `nextState` + `getLiveState()` snapshot
- "Play to end" button: loops `simulateMinute` to completion

**Pitch display:** a simple `<svg>` (or `<canvas>`) pitch view. No external dependency:
- Green rectangle 400×260px
- Home players = blue dots, away players = red dots, drawn at `(x * 400, y * 260)`
- Ball = yellow dot (if `ball.mode === 'carried'`, at carrier's position; if `'free'`, at `ball.at`)
- Player labels: abbreviated name or id on hover (title attribute)

**Event list:** a scrolling `<ul>` showing the current minute's events — type, team, description. Clears each step. New events appended at top so most recent is visible.

**Score/minute header:** `Home N – N Away | Minute M`

No test file for the debug page — it's a dev tool, not production.

---

### Verification

- `mise exec -- pnpm check` green after all changes
- Programmatic: `mise exec -- pnpm --filter @fm2k/match test --reporter=verbose match-log` (with `it.only` temporarily) prints the penalty log
- UI: `mise exec -- pnpm --filter @fm2k/web dev`, navigate to `/debug`, configure a match, step through it, verify player dots move and events appear

---

## TASK_07 — Recalibration plan

### Context
TASK_07 is the final engine task. All engine changes (TASK_11/16/17/18/19/21/22/23) have landed. Several gates were deliberately loosened to unblock earlier tasks (simulate.test strong-wins: 45→28; scale-calibration shot-ratio: 1.7→1.6; two formation tests commented out). This task locks everything back once the final state of the engine is stable. It also resolves the formation attack-volume imbalance (Part C) discovered during TASK_16.

### What drives this task
The calibration harness (`mise exec -- pnpm --filter @fm2k/match test:calibration`, ~54 s) is the ground truth. **The user runs it and reports the output.** We never run it unprompted. Each round: user runs → pastes failures → we adjust knobs → repeat.

---

### Step 1 — User runs calibration harness, reports output
`mise exec -- pnpm --filter @fm2k/match test:calibration`

We will see which gates in `distribution.calibration.test.ts` are failing and by how much. Do not touch anything until this output is in hand.

---

### Step 2 — Fix distribution gate failures (iterative)

Gates to watch (current values in `distribution.calibration.test.ts`):

| Gate | Threshold |
|------|-----------|
| Even-match goals | > 2.0 and < 3.2 |
| Draw % | < 0.38 |
| Gap-20 win % | > 0.62 |
| Big-gap win % (75v25) | > 0.68 and < 0.92 |
| Fouls per match | > 0.9 and < 20 |
| Reds per match | < 0.25 |
| Corners per match | > 2.0 |
| Injuries per match | < 0.6 |

**Knob priority order** (touch least-invasive first):

1. **Foul/card rate** → `flow.ts`: `YELLOW_CHANCE` (0.38), `YELLOW_SECOND_BOOKING_MODIFIER` (0.40), `RED_MARGIN` (0.45), `RED_CHANCE` (0.01); `duels.ts`: `ATTACKER_LOSS_FOUL_SCALE` (0.6), `FOUL_MARGIN_SCALE` (0.55), `FOUL_CHANCE_CAP` (0.3). Target: fouls realistic, def/atk split ~60/40, reds <0.25.
2. **Total goals / draw rate** → `duels.ts` shot duel `baseChance` (0.095) or spread (800); or `GAP_SATURATION_KNEE`/`SOFTNESS`.
3. **Coverage / fatigue** → `tactical-motion.ts`: `BALLSIDE_PULL` (0.5); `fatigue.ts`: `DISTANCE_DRAIN_PER_UNIT` (0.3).
4. **Form-bias cap** → `packages/engine/src/league/form.ts`: `FORM_BIAS_CAP` (0.04) — only if form is visibly distorting even-match distributions.

Repeat until the harness is fully green.

---

### Step 3 — Investigate and fix formation attack-volume imbalance (Part C)

**Problem:** 5-4-1 (1×ST-80) generates more shots (~1283) than 4-4-2 (ST-80 + ST-70), ~1067, over 80 seeds. Two-striker team should not produce *fewer* chances.

**Investigation approach** (read, don't run):
- Read `packages/match/src/match/duel/flow.ts` lines 180–450 to find:
  - `situationWeights` or equivalent table keyed on band/role — does a second forward reduce the carrier's band weight?
  - Cell-density logic: does having two players in the `fwd` band increase `SECOND_DEFENDER_SCALE` penalty against the carrier? (This is the most likely root cause — both strikers occupy the same cells, increasing apparent defender density in those cells.)
  - `pickCarrier`/`pickReceiver`: does attacker count in a band affect carrier selection probability?

**Likely fix:** `SECOND_DEFENDER_SCALE` (0.12) / `SECOND_DEFENDER_CAP` (0.15) or how cell density is computed. If two friendly attackers in the same cell double-count as a "crowded" defensive zone, the penalty should only count genuine defenders, not teammates.

**After fix:** Re-enable the two commented-out tests in `packages/match/src/match/scale-calibration.test.ts` (search `TASK_07`), adjust their numeric assertions to match the corrected engine output.

---

### Step 4 — Re-lock loosened gates

After distribution is green and formation is fixed, tighten these back:

| File | Gate | Current | Target |
|------|------|---------|--------|
| `packages/match/src/match/simulate.test.ts` | strong-wins (60 seeds, 80v25) | > 28 | restore toward ~42 (≈70%) based on harness |
| `packages/match/src/match/scale-calibration.test.ts` | shot ratio (75v25) | > awayShots * 1.6 | restore to 1.7 if harness supports |

Set these to values the calibration harness confirms, not arbitrary numbers.

---

### Step 5 — Lock starting-value constants

These were shipped as "starting values, TASK_07 re-locks":
- `WIDE_EDGE_LATERAL = 0.75` (`packages/match/src/lineup/lineup.ts:153`) — confirm or tune based on visual spot-check (no harness for this; judge from a few logged formations)
- `CENTRAL_EDGE_LATERAL = 0.42` (`packages/match/src/lineup/lineup.ts:154`) — same
- `FORM_BIAS_CAP = 0.04` (`packages/engine/src/league/form.ts`) — confirm it doesn't distort even-match distributions; increase if form feels too weak, decrease if it dominates

---

### Step 6 — Update BALANCE.md

File: `packages/match/BALANCE.md`

- Remove the "NOT yet recalibrated" warning
- Update the measured-distributions table with the final harness numbers (goals, draw%, win% by tier, fouls, reds, corners, injuries)
- Note the final settled values for all TASK_07-touched knobs

---

### Step 7 — Final `pnpm check`

`mise exec -- pnpm check` — must be fully green. Only then is TASK_07 complete.

---

## ⏳ WHAT'S LEFT

| # | File | What it is | Prereqs |
|---|------|------------|---------|
| 7 | `TASK_07.md` | **Recalibration** — re-lock all gates after engine changes; formation attack-volume imbalance (Part C); re-enable commented calibration tests | After TASK_17 ✓ |
| 12 | `TASK_12.md` | ⏸️ **Mundane fouls** — PARKED; re-evaluate after TASK_07 confirms foul distribution | — |
| 14 | `TASK_14.md` | **Player rating overhaul** — assists, clean-sheet bonus, position-weighted deltas, defensive-duel penalty | After TASK_15 ✓ |
| 6 | `TASK_06.md` | **Deeper match insights** — more detector types; needs event density | After TASK_15 ✓ |
| 13 | `TASK_13.md` | **Adaptive AI tactics** — (A) pre-match slider, (B) half-time, (C) substitution reactions | None |
| 3 | `TASK_03.md` | **Newspaper: transfer rumours** | None |
| 4 | `TASK_04.md` | **Academy intake day** | None |
| 5 | `TASK_05.md` | **Records / top scorers** | None |
| 20 | `TASK_20.md` | **Calendar/time-driven world events** — fix missed transfer-window events on multi-matchday advances | None |
| 1 | `TASK_01.md` | **Transfer negotiation** — multi-round bid/counter-offer | None (most complex; reserve for multi-session slot) |

### Execution order
1. `TASK_07` (engine wave done, lock gates)
2. `TASK_14` → `TASK_06` → `TASK_13` (match quality layer)
3. Wave 4 standalone features in any order: `TASK_03`, `TASK_04`, `TASK_05`, `TASK_20`, `TASK_01`

### Dependency notes
- TASK_07 must always be the last engine task — it locks gates that earlier tasks open.
- TASK_01 (transfer negotiation) is the most complex UI task; best picked up when there's time for a multi-session effort.
