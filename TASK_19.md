# TASK 19 — Defensive cover / ball-side lateral shift (+ lateral fatigue)

> ✅ **DONE 2026-07-23.** `applyBallSideShift` (pure, proximity-decayed + depth-weighted ball-ward compression) added to `tactical-motion.ts`, wired into the defending motion chain (`applyCompactness → applyBallSideShift → applyPress`). Movement fatigue unified: `perMinuteDrain` now takes real `distanceMoved` (× `staminaTravelFactor`, ≈±50% around stamina 50) via a new pure `travelled()` helper + one-minute-lag `lastTravel` in the simulator; the static `shapeDeltaDrain` proxy and its `derivedRoles` plumbing were removed (one mechanic covers cover-shift, transitions, pressing). Tests: `applyBallSideShift` (near>far>0, no collapse, GK/forward untouched, away-mirrored), `staminaTravelFactor`, distance-drain, `travelled`, 3-vs-5 end-energy ordering. `pnpm check` green (match 361). **NOTE:** surfaced that back-line width is slot-order-only (a back-3 spreads full width) → spun off **TASK_21** (role-aware width). **TASK_07 recalibration still required** (moved gap curve + fatigue): fullback yellow share should fall from ~59% toward ~18–22%.

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. Tuning: `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.
>
> **This task moves the TASK_11-tuned numbers (wide attacks get harder) AND the fatigue model — it MUST be followed by TASK_07 recalibration.**

## What this is

The defensive shape does **not** track the ball laterally, so wide defenders are isolated. From the movement code:

- `targetsForShape` anchors each defender to its **formation x** (only y shifts, via `lineShift`).
- `applyCompactness` pulls players toward **x = 0.5** (static central squeeze — not toward the ball).
- `applyPress` pulls a defender *to the ball* only if already within `PRESS_RADIUS` (pressing, not covering behind).

So when the ball is on a flank, the near centre-back does **not** slide across to back up the fullback — he holds his central slot. Every wide take-on is a genuine 1v1 against a lone fullback, who gets cleanly beaten and fouls. That is the structural cause of the fullback booking skew (fullbacks 59% of yellows; centre backs/mids far fewer, because central congestion suppresses clean beats). See TASK_18 for the "attackers never foul" half.

## Change 1 — ball-side lateral shift (cover)

Add a defensive lateral shift so the block slides toward the ball, the near CB covering behind the beaten fullback.

- New motion fn in [`tactical-motion.ts`](packages/match/src/match/duel/tactical-motion.ts), e.g. `applyBallSideShift(targets, ball, side, intensity)`: nudge each defender's `x` toward `ball.x`, scaled by role/proximity (back line and near-side shift most; forwards barely), capped so the shape shuffles rather than collapses onto the ball.
- Wire into the defending side's motion chain in [`duel-simulator.ts`](packages/match/src/match/duel/duel-simulator.ts) (alongside `applyCompactness`/`applyPress`).
- Tune magnitude so wide 1v1s gain cover (near CB tucks toward the fullback) without over-congesting — enough to cut the fullback foul share materially, not so much that wide play dies.

## Change 2 — lateral movement drains fitness (the 3-vs-5 band tradeoff)

The cover shift makes defenders cover more ground, and that should cost fitness — otherwise a stretched back line is free. Crucially this creates a realistic tradeoff: **a thinner band (3 at the back) must shift each defender further to cover the same pitch width than a 5-back**, so it tires faster.

- Today `perMinuteDrain` ([`fatigue.ts`](packages/match/src/match/fatigue.ts)) ignores actual distance moved. Add a **distance-linked drain component**: track how far each player actually travelled this minute (from `advancePositions`) and add a small drain proportional to it.
- This makes the lateral cover-shift cost fitness *automatically*, and the 3-vs-5 band effect is **emergent** — a 3-back's larger per-man lateral shift → more distance → more drain — no special-casing needed.
- Keep the existing formation/position/tactics drain as the baseline; the distance term is additive and small so overall end-energy stays realistic (see calibration below).

## Success criteria

- **Cover works**: a unit test on `applyBallSideShift` — with the ball wide, the near-side centre back's `x` moves toward the ball relative to no-shift; the far-side players move less; the shape doesn't collapse.
- **Fullback skew drops**: fullback yellow share falls materially (target: no single position dominating; fullbacks down from ~59% combined toward a realistic ~18–22%). Measure with the foul-by-position histogram.
- **Fatigue tradeoff emerges**: over a match, a 3-at-the-back defence ends with lower energy than a 4/5-back, all else equal — add a test asserting the ordering.
- **Recalibration (TASK_07)**: goals, shots, possession, and end-energy re-verified after this lands — wide attacks are now harder and defenders tire differently, so the TASK_11 gap curve and even-match goals must be re-checked and gates re-locked.
- `mise exec -- pnpm check` green.

## Notes / relationships

- **Blast radius**: this is the big one — it changes attack success (wide play), the gap curve, AND fatigue/injury-from-fatigue. Do it *before* TASK_07 and expect to retune.
- **Complementary to TASK_18**: cover reduces the fullback over-booking; TASK_18 lets attackers be booked at all. Do TASK_18 first (contained, no recalibration) so the distribution can be measured cleanly before this task's ripple.
- The parked TASK_12 (mundane fouls) should be re-evaluated only after 18 + 19 — the distribution may already be realistic without adding central-tactical-foul volume.
