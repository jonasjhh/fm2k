# FM2K — Match & skills rework ("duel engine" / match sim v2)

Status (2026-07-23): **TASK_02, TASK_11, TASK_15, TASK_16, TASK_18, TASK_19, TASK_21, TASK_22, TASK_23 complete.** Repo check green. **Next: TASK_17 → TASK_07 recalibration.** TASK_12 PARKED.

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

## ⏳ WHAT'S LEFT

| # | File | What it is | Prereqs |
|---|------|------------|---------|
| 17 | `TASK_17.md` | **Recorded-form momentum** — cross-competition W/D/L → capped MatchForm bias fed into `homeForm`/`awayForm` inject point | TASK_11 done ✓ |
| 7 | `TASK_07.md` | **Recalibration** — re-lock all gates after engine changes; formation attack-volume imbalance (Part C); re-enable commented calibration tests | After TASK_17 |
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
1. `TASK_17` → `TASK_07` (engine wave done, lock gates)
2. `TASK_14` → `TASK_06` → `TASK_13` (match quality layer)
3. Wave 4 standalone features in any order: `TASK_03`, `TASK_04`, `TASK_05`, `TASK_20`, `TASK_01`

### Dependency notes
- TASK_07 must always be the last engine task — it locks gates that earlier tasks open.
- TASK_01 (transfer negotiation) is the most complex UI task; best picked up when there's time for a multi-session effort.
