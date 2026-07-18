# TASK 11 — Gap-20 win rate tuning

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit, never run the calibration harness unprompted. Tuning loop: edit knobs → `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.

## What this is

The match engine's duel system produces a win rate for the stronger side that is a little low at a 20-point OVR gap. Currently (as of 2026-07-18):

- Gap 20 (65v45): **57% wins / 27% draws / 15% losses** for the stronger home side
- Real football reference (e.g. top-flight vs second-tier in a cup): **~65–75% wins, ~10–15% losses**

The draw rate (27%) is a few points high and the win rate (57%) a few points low. This is a deliberate result of the "any given Sunday" high-variance design, but it means skill gaps feel slightly less meaningful than in real football.

The calibration gate in `packages/match/src/match/distribution.calibration.test.ts` is currently set to `> 0.50` as a sanity floor — this should be tightened to `> 0.62` or similar once tuning is done.

## Root cause

Every contested moment in the engine is a duel. Each duel type has a **spread** constant: the larger the spread, the less a rating difference moves the win probability per duel. With ~200+ duels per match, small per-duel edges compound — but the current spread values were chosen to keep even matches interesting, which also softens the gap-20 curve.

Current spread values (in `packages/match/src/match/duel/duels.ts`):
- Pass: 1200
- Dribble: 1000
- Speed / Strength races: 900
- Shot vs keeper: 800
- Penalty: 300

A **smaller** spread = skill matters **more** per duel.

## How to tune

1. Reduce one or more spread constants — start with the most-contested duel types (pass and dribble contribute the most duels per match).
2. Re-run `mise exec -- pnpm --filter @fm2k/engine calibration-report`.
3. Check **all three gap rows** in section 2 of the report together:
   - Gap 10 (60v50): currently 44% wins — this will also rise; don't let it go above ~55%
   - Gap 20 (65v45): target ~65% wins
   - Gap 30 (70v40): currently 69% wins — protect this, don't push it above ~80%
4. Also verify section 1 (even matches) — draw rate should stay ~20–27%, total goals ~2.7–3.1.
5. Once settled, tighten the test bound from `> 0.50` to `> 0.62` (or whatever the new stable value is).

## Things to be careful about

- **Even-match feel**: if spread gets too tight, even matches between equal teams become more predictable (skill wins every time). The charm of football is that 50v50 doesn't feel like a coin flip — it still feels like a real game. Don't sacrifice that.
- **Cascade**: all five duel types share the same gap curve shape, so changing one spread shifts the whole curve. Consider changing only the duel types that appear most frequently per match (pass, dribble) before touching shot or speed.
- **Recalibrate after**: after this tuning, re-check the card logic (reds/match) and the even-match goals — both depend on how often duels are decisively won/lost.
