# TASK 7 — Recalibration (do this LAST; BLOCKED on the user)

> Conventions and commands: see the backlog index (Claude plan file). Run everything via `mise exec -- pnpm <cmd>`, never commit. **Never run the calibration harness unprompted — the user runs it.** Balance numbers and tuning knobs: `packages/match/BALANCE.md`; engine map: `packages/match/MATCH-PIPELINE.md`.

Merges what were formerly "Step 9C" and a deferred "Step 12 upset audit" — the same underlying activity (tune the match distributions against the calibration harness), done once, after everything else has landed (so the tuning target reflects the final state of the engine, not an intermediate one).

**Trigger**: the user runs `mise exec -- pnpm --filter @fm2k/match test:calibration` and reports the failures. Do NOT run it yourself unprompted.

> ⚠️ **Scope update (2026-07-21) — this task is stale; refresh it when actually run.** Parts A/B below predate the v2 duel engine and TASK_11:
> - **Part B is largely DONE.** TASK_11 shipped the "day form / upset" mechanism (per-match `MatchForm` conversion variance in `rng.ts`) and a soft-knee gap saturation (`saturateGap` in `duels.ts`). The `75v25 > 0.93` gate in Part A is now **wrong** — big gaps deliberately saturate ~78–80% and never reach certainty. Update gates to the TASK_11 curve (gap-20 > 0.62, big gaps bounded *above*, upset floor > 0).
> - **The knobs to tune are now the v2 ones**: `duels.ts` spreads + `saturateGap` KNEE/SOFTNESS, `MATCH_FORM_SIGMA`, `flow.ts` `AERIAL_*_WEIGHT`, and — added by TASK_18/19 — the **foul/card system**: `loserFoulChance` / `ATTACKER_LOSS_FOUL_SCALE` (TASK_18), `YELLOW_CHANCE` / `YELLOW_SECOND_BOOKING_MODIFIER` / `foulChance` scales, and TASK_19's cover-shift + lateral-fatigue constants. **This task owns the final holistic lock of all foul/card knobs** (total rate, def/atk split ~60/40, position distribution, card %) once TASK_18 + TASK_19 have landed.
> - `skill-checks.ts` / `action-generators.ts` / `VISION_SPECS` / `ENGAGEMENT_*` references below are pre-v2 and mostly no longer exist — ignore or re-map before using.

## Part A — baseline gates

Pre-existing harness: `packages/match/src/match/distribution.calibration.test.ts`. Gates: even-match total goals 2.0–3.2 at every tier; draw% < 0.38; 65v45 home win > 0.72; 75v25 home win > 0.93 with ≥2.5× goals; fouls 2–20; penalties < 0.45; reds < 0.18; corners > 6; injuries per match < 0.6. Tune, in this order of preference:

1. `packages/match/src/match/skill-checks.ts`: `VISION_SPECS` parities, `engagementChance` constants `ENGAGEMENT_BASE`/`ENGAGEMENT_PRESS_SPAN`, `FIRST_TOUCH_SPEC` parity, `SECOND_DEFENDER_FACTOR`.
2. `packages/match/src/match/injury.ts`: `TRIGGER_EXPOSURE` values (first guesses). Verify severity mix over a big run ≈ 70% short (1–2 matches) / 25% moderate (3–5) / 5% serious (8+).
3. Only if needed: `PASS_FORWARD_BASE`, `CONV_PARITY` in `packages/match/src/match/action-generators.ts`.

## Part B — "any given sunday" upset audit

The harness today only bounds dominance from *below* and has no upset metric — a 65v45 favourite currently wins ~97% of the time with no measured floor on how often the weaker side wins. Add `upsetPct`/`nonLossPct` to `packages/match/src/match/distribution.ts`, add upper-bound gates so a heavy favourite doesn't win *too* consistently, then tune via seeded per-match "day form" noise on team params or a softer `CONTEST_SPREAD`. Target rate and mechanism deliberately left open — the user signs off on feel.

## When both parts are green

Update the measured tables in `packages/match/BALANCE.md`, delete its "NOT yet recalibrated" warning.

**Open design question to raise with the user during this task**: `awareness` drives BOTH the vision check (seeing a killer pass) and decision quality (choosing the safe best option) — so high-awareness players do NOT attempt more through balls net of both effects. Ask whether to keep this (realistic) or split a dedicated "vision" attribute (legible).
