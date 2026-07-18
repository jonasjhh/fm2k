# TASK 12 — Mundane fouls system

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. Tuning loop: `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.

## What this is

The engine's foul model is **emergent only**: fouls happen when a defender badly loses a duel (last-man situations, reckless challenges on wide mismatches). This covers a narrow slice of real football fouls. As a result:

- Engine yellows: **~0.7–1.0 per match** (both teams combined)
- Real football: **~3–4 yellow cards per match** (both teams combined)

The gap exists because real football has many foul types that aren't duel-outcomes: tactical fouls to break up counters, shirt pulls at set pieces, time-wasting, complaints/dissent. This task adds those.

## Proposed additions

Each is a separate deliverable — implement in order, re-run calibration after each to see the cumulative yellow rate rise toward the real target.

### 1. Tactical press fouls

**When**: a high-pressing team (risk slider above ~65) wins the ball in the attacking third, and the player who lost it would have been through on goal.

**Effect**: always a yellow card, never a red (it's a deliberate tactical foul to stop a counter). No impact on the ball — the foul stops play.

**Where to add**: `packages/match/src/match/duel/flow.ts` — after a speed/dribble duel in the attacking third results in a turnover, check the risk slider and roll a small chance (~8–12%) of a tactical foul booking.

### 2. Set-piece shirt pulls

**When**: at corners and free kicks, aerial duels happen in a crowded box. Any aerial duel at a set piece has a small chance of a shirt-pull booking.

**Effect**: yellow card for either the defender or attacker (roughly 60/40 split — defenders pull more). No impact on the set-piece outcome itself (the foul is "missed" by the referee and the duel plays out).

**Where to add**: `packages/match/src/match/duel/flow.ts` — the corner/free-kick resolution path, after the aerial duel is resolved. Chance: ~5–8% per aerial duel at a set piece.

### 3. Time-wasting yellow

**When**: after the 80th minute, when the team that is currently winning has their risk slider low (≤ 35 — sitting deep, protecting the lead). Rolling slowly on every restart.

**Effect**: yellow card for a random outfield player on the leading team. Adds tension to late-game situations. Never a red.

**Where to add**: `packages/match/src/match/duel/duel-simulator.ts` — in the post-80-minute phase logic, a small per-minute roll (~3–5%) when the leading team has a low-risk intent.

### 4. 50/50 reckless challenge

**When**: a loose-ball duel (speed or strength race) in the middle third where the margin of the outcome is very small (< 0.05 either way — genuinely contested). The loser of the duel has a small chance of going in recklessly.

**Effect**: yellow card; very rarely a red (10% of the yellow roll). Higher chance than a normal emergent foul because both players committed — it's a 50/50 ball, not a clear mismatch.

**Where to add**: `packages/match/src/match/duel/flow.ts` — alongside the existing `maybeFoul` logic for speed/strength duels, triggered when `Math.abs(margin) < 0.05`.

## Target after all four are added

Yellow rate: ~2.5–3.5 per match (still below real football's ~3–4 because some bookings are for things the engine will never model — diving, encroachment, etc.).

After implementation, retune the calibration test floor in `distribution.calibration.test.ts`:
- `foulsPerMatch > 0.9` → raise to `> 2.5`

## Notes for implementation

- Keep the rng injection pattern: every new foul type should take `rng` from the duel simulator context, not `Math.random()`.
- Each new foul type should emit a `yellow_card` event with a meaningful `description` (e.g. "Tactical foul by X — booked").
- Add tests in `packages/match/src/match/duel/flow.test.ts` (or a new file if it gets too long) verifying each new foul path triggers at the right conditions.
- Run `test:calibration` after all four are in to verify the distribution gates still pass.
