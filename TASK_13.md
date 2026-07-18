# TASK 13 — Adaptive AI tactics

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once.

## What this is

Currently all AI clubs play with fixed tactics for an entire match — whatever formation and sliders were set at the start, they keep until the final whistle. Real football managers adapt: they respond to the score, the opposition, and what's happening on the pitch. This task adds that intelligence in three stages, each a separate deliverable.

## Stage A — Pre-match adaptation (vs opponent)

Before a match starts, the AI manager looks at the opponent's squad and adjusts its sliders.

**Logic**:
- vs a much stronger opponent (OVR gap > 15 against the AI): lower risk slider (~30–45), higher defensive line — sit compact and try to frustrate
- vs a much weaker opponent (OVR gap > 15 in the AI's favour): higher risk slider (~60–75) — press and attack
- vs a similar-strength opponent: balanced sliders (40–60 range), small random variation to add personality

**Where to add**: `packages/engine/src/world/world-churn.ts` — `runAiMarket` already iterates over AI clubs; a similar function `setAiMatchIntent(club, opponent, rng)` can be added and called from `backend/src/app/session.ts` when scheduling AI fixtures. Alternatively, wire it into the `MatchOccurrence` config at the point where AI vs AI matches are scheduled.

**Test**: add a unit test verifying that `setAiMatchIntent` returns a lower-risk intent when facing a much stronger team.

## Stage B — Half-time adjustments

At half-time, the AI manager looks at the score and first-half statistics and adjusts.

**Triggers and adjustments**:
- Losing by 2+: raise risk slider by ~15–25 points (go more aggressive), raise defensive line slightly
- Winning by 2+: lower risk slider by ~15 points (protect the lead), lower defensive line
- Losing and fewer shots than the opponent: raise risk by ~10 — pressing harder
- Winning and the opponent had more shots: lower risk by ~10 — tighten up

**Where to add**: `backend/src/app/session.ts` — at the half-time pause point where the player's own intermission is handled, run a parallel pass for AI matches that are also at half time, applying intent changes to their `MatchOccurrence` via `applyTactics`.

**Test**: verify the intent shift direction (losing → more aggressive, winning → more conservative) with a unit test.

## Stage C — Substitution reactions

When an AI club makes a substitution (currently triggered by injury or fatigue), it can also use it as a tactical moment.

**Logic**:
- Losing in the 70th+ minute: sub off a defender for an attacker (if a suitable sub is on the bench) — represents the classic "throw men forward" move
- Winning in the 80th+ minute and under pressure (opponent had more shots in the second half): sub off an attacker for a defender — shutting up shop
- Random tactical sub: 15% chance per substitution of a small risk slider nudge (±5–10) to reflect personality differences between managers

**Where to add**: `packages/match/src/match/match-occurrence.ts` — the substitution logic already handles the mechanical swap; the tactical intent update would accompany it. The AI club's intent is accessible via the `MatchOccurrence` config.

**Test**: unit test the substitution-reaction logic in isolation (not a full match sim) — verify the correct player type is identified for swapping.

## Notes

- All three stages are independent — implement and ship A before starting B, B before C.
- Keep RNG injected throughout so results are deterministic with a given seed.
- The calibration harness doesn't currently exercise AI vs AI tactics (it uses fixed-intent synthetic teams), so these changes won't affect the calibration report — verify by running it anyway after each stage.
- After all three stages, the MANUAL_TEST_PLAN should get a new section with eyeball checks: simulate several seasons and verify AI clubs sometimes change their lead/trail behaviour visibly in the ticker.
