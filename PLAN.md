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

### Notes on ordering

- **TASK_11 before TASK_07**: if you tune the duel spreads for gap-20, the calibration numbers shift and the gates need re-locking.
- **TASK_12 before TASK_07**: mundane fouls will raise `foulsPerMatch` above the current 0.9 floor — the gate needs updating after.
- **TASK_01 (transfer negotiation)** is the most complex UI task; best picked up when there's time for a multi-session effort.
- **TASK_02, 03, 04, 05** are all self-contained feature additions with no engine dependencies — any of them can be picked up independently.
- **TASK_06** should be read carefully against the v2 match engine before starting — some of the original spec may now be achievable differently.
