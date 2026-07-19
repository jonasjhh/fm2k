# FM2K — Match & skills rework ("duel engine" / match sim v2)

Status (2026-07-18): **6c complete (all 7 steps done).** 1,460 tests green. Next: Step 8 (mundane fouls) or Step 9 (adaptive AI) — user to choose.

## Standing rules

- Run everything via `mise exec -- pnpm <cmd>`. Verification = `mise exec -- pnpm check` repo-wide, ONCE.
- NEVER commit. NEVER run `test:calibration` unprompted.
- Never hand-edit `players.json` — regenerate via `pnpm --filter @fm2k/engine populate-teams`.
- Run `pnpm test:coverage` after finishing work.
- Tuning loop: edit → `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.

## Settled calibration numbers (reference)

Duel knobs in `packages/match/src/match/duel/duels.ts`:
- Pass: baseChance 0.78, spread 1200, clamp 0.45–0.97
- Dribble: baseChance 0.44, spread 1000, clamp 0.08–0.9
- Speed/Strength: baseChance 0.5, spread 900, clamp 0.08–0.92
- Shot vs keeper: baseChance 0.16, spread 800, clamp 0.02–0.45
- Penalty: baseChance 0.76, spread 300, clamp 0.6–0.9

25-season churn (Norway harness): D1 59→62, D2 39→50, D3 28→41; pool OVR stabilises ~30 by season 17.

Cards: YELLOW_CHANCE 0.55 (independent roll), RED_MARGIN 0.45, RED_CHANCE 0.18 (upgrade roll on badly-beaten defenders).

Market: listing factory draws OVR `40 + floor(rng() * 30)` (40–69); seeded free agents 22–49.

## ⏳ WHAT'S LEFT

## Complete task list

All task detail lives in the corresponding `TASK_NN.md` file at the repo root.

| # | File | What it is | Suggested prereqs |
|---|------|-----------|-------------------|
| 1 | `TASK_01.md` | **Transfer negotiation** — multi-round bid/counter-offer for club-to-club transfers; incoming AI offers for your players | None (standalone UI + backend feature) |
| 2 | `TASK_02.md` | **Mid-match formation change** — bug: formation changes made during a live match don't take effect until the next match; UI lives in the match overlay's right pane (slot is commented out) | None |
| 3 | `TASK_03.md` | **Newspaper: transfer rumours** — add a rumour article category to the newspaper tab driven by transfer window activity | None |
| 4 | `TASK_04.md` | **Academy intake day** — annual event surfacing your youth academy graduates with stats, potential, and a decision to promote or release | None |
| 5 | `TASK_05.md` | **Records / top scorers** — persistent season-by-season records for goals, clean sheets, longest win streaks, etc. | None |
| 6 | `TASK_06.md` | **Deeper match insights** — expand the half-time and full-time insight cards; add more detector types beyond the current 7 | Read `packages/match/src/tactics/feedback.ts` first; re-verify against v2 match engine |
| 7 | `TASK_07.md` | **Recalibration** — re-run the calibration harness after any duel-knob change (TASK_11) and lock the new numbers; also covers pace mechanic knobs from the old TASK_11 spec | Do after TASK_11 |
| 11 | `TASK_11.md` | **Gap-20 win rate tuning** — engine delivers ~57% wins at a 20-point OVR gap; target ~65%. Reduce duel spread constants in `duels.ts`, re-run calibration report, then tighten the test bound from > 0.50 to ~0.62 | None; but trigger TASK_07 after to re-lock the gates |
| 12 | `TASK_12.md` | **Mundane fouls** — add tactical press fouls, set-piece shirt pulls, time-wasting yellows, and 50/50 reckless challenges to bring yellow rate from ~0.7–1.0/match toward ~3–4/match | Can be done anytime; raise the fouls test floor in `distribution.calibration.test.ts` from 0.9 to ~2.5 after completion |
| 13 | `TASK_13.md` | **Adaptive AI tactics** — three stages: (A) pre-match slider adaptation vs opponent strength, (B) half-time adjustments on the scoreline, (C) substitution reactions | None; stages are independent — ship A before starting B |
| 14 | `TASK_14.md` | **Player rating overhaul** — extract rating logic into `rating-engine.ts`, add assists, clean-sheet bonus, position-weighted event deltas, defensive-duel penalty; encapsulated so swapping the model later is trivial | None; self-contained within `packages/match` |
| 15 | `TASK_15.md` | **Match simulation richness** — raise `eventsPerMinute` for realistic pass counts (400–600/team), rewrite `pickReceiver` with temperature-weighted sampling so all players get touches, add `loose_ball` outcome for narrow interceptions | Do before TASK_14 (rating overhaul needs realistic event volume to be meaningful); coordinate calibration gates with TASK_12 |

### Recommended execution order

**Wave 1 — Engine foundation** (these interact; do in sequence)
1. `TASK_02` — formation bug fix; quick win, no engine risk, good warm-up
2. `TASK_15` — simulation richness (volume + receiver variety + loose ball); all downstream engine tasks depend on this
3. `TASK_11` — gap-20 win rate tuning; spread constants behave differently at 12 epm vs 3, so tune *after* TASK_15
4. `TASK_12` — mundane fouls; TASK_15 already raises foul counts incidentally, top up to target range afterwards

**Wave 2 — Lock the calibration gates**
5. `TASK_07` — recalibrate and re-lock all test gates once the engine has stopped moving

**Wave 3 — Match quality layer** (needs good event volume to be meaningful)
6. `TASK_14` — player rating overhaul; meaningless at 20 passes/team, excellent at 400+
7. `TASK_06` — deeper match insights; detectors need event density to fire reliably
8. `TASK_13` — adaptive AI tactics (stages A → B → C independently)

**Wave 4 — Standalone UI features** (no engine dependency; interleave freely)
- `TASK_03` — newspaper transfer rumours
- `TASK_04` — academy intake day
- `TASK_05` — records / top scorers
- `TASK_01` — transfer negotiation (most complex; reserve for a multi-session slot)

### Dependency notes
- TASK_15 is the forcing function: it shifts calibration baselines, foul counts, and rating data; everything in Waves 2–3 is downstream of it.
- TASK_07 must always be the last engine task in any wave — it locks gates that earlier tasks open.
- TASK_01 (transfer negotiation) is the most complex UI task; best picked up when there's time for a multi-session effort.
