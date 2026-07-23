# FM2K — Match & skills rework ("duel engine" / match sim v2)

Status (2026-07-23): **TASK_02, TASK_15, TASK_11, TASK_18 complete.** Repo check green. **Next: TASK_19 (defensive cover + lateral fatigue)**, then TASK_07 re-locks the foul/card + gap/fatigue gates. TASK_12 (mundane fouls) PARKED — foul volume is already at target (~3.2 yellows/match); the real problem is *distribution* (fullbacks 59%, forwards ~3%), which TASK_18/19 address at the root. TASK_18 shipped the attacker half (loser-fouls); TASK_19 fixes the wide-isolation half.

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
  raw point counts 1/3, so mismatches taper (gap-50/75 saturate ~78–80% wins, never 100%; upsets
  get rarer as the gap grows). SOFTNESS=1 = off, ∞ = hard cap.

Match-form variance in `packages/match/src/match/rng.ts` (TASK_11):
- Per-team, per-match `MatchForm { attack, defense }` in shot-conversion points; folded into the
  shot duel's bonus only (never territory). σ (MATCH_FORM_SIGMA) 0.05, clamp ±0.10 (Gaussian).
- Three-way contract: inject `homeForm`/`awayForm` (gameplay/TASK_17) · absent → sim draws its own
  (harness, so σ is tunable) · `NEUTRAL_MATCH_FORM` → deterministic. Only bites when teams differ.

Flow knobs in `packages/match/src/match/duel/flow.ts`:
- EPM: 13
- **Header conversion:** a won header finishes off `headerFinishAttr = 0.5·strength + 0.5·finishing`
  (AERIAL_STRENGTH_WEIGHT / AERIAL_FINISHING_WEIGHT) — physical strikers head despite ground-biased
  finishing. `str==fin` → no-op (calibration-safe).
- YELLOW_CHANCE: 0.38 (inflated — only ~1/3 real foul count; drops to ~0.18 after TASK_12)
- YELLOW_SECOND_BOOKING_MODIFIER: 0.40 (~15% second-booking rate)
- RED_MARGIN: 0.45, RED_CHANCE: 0.01, PRO_FOUL_RED_CHANCE: 0.03
- REBOUND_CHANCE: 0.20 (D7 scramble gate)
- Throw-in gate: 25% of touchline tackles go out of play

TASK_11 result — gap curve (win%): gap-10 ~63, gap-20 ~72, gap-30 ~73, gap-40/50 ~78–80 (saturated).
Even matches ~3.1 goals, draws ~20–24%. Upsets always possible (a tier-3 side beats a tier-1 sometimes).

25-season churn (Norway harness): D1 59→62, D2 39→50, D3 28→41; pool OVR stabilises ~30 by season 17.

Cards: see flow knobs above (updated; old values are stale).

Market: listing factory draws OVR `40 + floor(rng() * 30)` (40–69); seeded free agents 22–49.

## ⏳ WHAT'S LEFT

## Complete task list

All task detail lives in the corresponding `TASK_NN.md` file at the repo root.

| # | File | What it is | Suggested prereqs |
|---|------|-----------|-------------------|
| 1 | `TASK_01.md` | **Transfer negotiation** — multi-round bid/counter-offer for club-to-club transfers; incoming AI offers for your players | None (standalone UI + backend feature) |
| 2 | `TASK_02.md` | ✅ **Mid-match formation change** — DONE. `FormationSelector` extracted, wired into `MatchOverlay` with `FormationGrid`. Engine already handled it via `applyPendingTactics()`. | None |
| 3 | `TASK_03.md` | **Newspaper: transfer rumours** — add a rumour article category to the newspaper tab driven by transfer window activity | None |
| 4 | `TASK_04.md` | **Academy intake day** — annual event surfacing your youth academy graduates with stats, potential, and a decision to promote or release | None |
| 5 | `TASK_05.md` | **Records / top scorers** — persistent season-by-season records for goals, clean sheets, longest win streaks, etc. | None |
| 6 | `TASK_06.md` | **Deeper match insights** — expand the half-time and full-time insight cards; add more detector types beyond the current 7 | Read `packages/match/src/tactics/feedback.ts` first; re-verify against v2 match engine |
| 7 | `TASK_07.md` | **Recalibration** — re-run the calibration harness after any duel-knob change (TASK_11) and lock the new numbers; also covers pace mechanic knobs from the old TASK_11 spec | Do after TASK_11 |
| 11 | `TASK_11.md` | ✅ **Possession scaling + spread tuning + match-form variance** — DONE 2026-07-21. Spreads retuned (pass 850, dribble 750, speed/strength 700), soft-knee gap saturation, per-match form variance (conversion-only), header conversion blend, GK long-ball 0.55. Gap-20 ~72%, saturates high-70s, upsets always possible. | Trigger TASK_07 after to re-lock gates |
| 12 | `TASK_12.md` | ⏸️ **Mundane fouls** — PARKED. Premise is stale: TASK_15's richer duels already put fouls at ~8.3/match and yellows at ~3.2/match (already at the real ~3–4 target). Volume is not the problem — *distribution* is (fullbacks 59% of yellows, forwards ~3%). Re-evaluate only after TASK_18 + TASK_19 fix the distribution at the root; may not be needed. | Superseded for now by TASK_18/19 |
| 18 | `TASK_18.md` | ✅ **Symmetric foul attribution (attackers bookable)** — DONE 2026-07-23. `loserFoulChance` + `maybeLoserFoul`: the dispossessed attacker can foul the winner (free kick / own-box penalty the other way), booked via the shared `bookFoul` helper. Holding ~60/40 def/atk (`ATTACKER_LOSS_FOUL_SCALE 0.6`); TASK_07 locks final numbers. | Done |
| 19 | `TASK_19.md` | **Defensive cover / ball-side lateral shift (+ lateral fatigue)** — the back line doesn't track the ball laterally, so wide fullbacks are isolated 1v1 and over-booked. Add a ball-side cover shift, AND make lateral movement drain fitness (emergent 3-vs-5 band tradeoff: thinner bands cover more width → tire faster). Big blast radius — moves the gap curve AND fatigue | **Do after TASK_18; TASK_07 must follow** to re-lock gates |
| 20 | `TASK_20.md` | **Calendar/time-driven world events** — transfer-window open/close, AI market, injury countdowns are keyed off *matchday completion* rather than time passing. Endpoint-only comparison misses windows that open+close inside a multi-matchday advance (mid-season window open toast never fires when simulating a season; no open event at new season). Re-model these as calendar-date boundaries reconciled across `previousNow→now` in the time advance. Backend/architecture; no engine calibration | None (standalone backend refactor) |
| 16 | `TASK_16.md` | **Quality-weighted receiver selection (anti-siphoning)** — `pickReceiver` scores receivers purely by position; a poor second striker siphons shots from the good one. Add finishing-weighted bonus in the attacking third so better finishers attract more of the ball, and poor finishers prefer to lay off | Do after TASK_11 (spread changes affect softmax balance); before TASK_07 |
| 17 | `TASK_17.md` | **Recorded-form momentum** — feed real recent results (cross-competition, capped) into TASK_11's per-team `MatchForm` (the `homeForm`/`awayForm` inject point, shipped) so winning runs play sharper and slumps flatter, without ever locking a team. Gameplay-only; not calibratable by the harness. NOTE: `MatchForm` is conversion-only `{attack,defense}`, not an attribute shift — TASK_17 must map form → those two knobs | **Depends on TASK_11** (`MatchForm` inject point shipped) |
| 13 | `TASK_13.md` | **Adaptive AI tactics** — three stages: (A) pre-match slider adaptation vs opponent strength, (B) half-time adjustments on the scoreline, (C) substitution reactions | None; stages are independent — ship A before starting B |
| 14 | `TASK_14.md` | **Player rating overhaul** — extract rating logic into `rating-engine.ts`, add assists, clean-sheet bonus, position-weighted event deltas, defensive-duel penalty; encapsulated so swapping the model later is trivial | None; self-contained within `packages/match` |
| 15 | `TASK_15.md` | ✅ **Match simulation richness** — DONE. 15A–15E all shipped. Real-football reference targets stored as comments in `flow.ts`. Remaining calibration gaps (through balls, corners, loose balls, carries) deferred to TASK_07 after TASK_11. | — |

### Recommended execution order

**Wave 1 — Engine foundation** (these interact; do in sequence)
1. ✅ `TASK_02` — DONE
2. ✅ `TASK_15` — DONE (15A–15E)
3. ✅ `TASK_11` — DONE (spread tuning + soft-knee saturation + match-form variance + header blend)
4. ✅ `TASK_18` — attackers bookable (symmetric foul attribution) — DONE
5. `TASK_19` — defensive cover + lateral fatigue; after TASK_18, then TASK_07 to re-lock gates — **do next**
6. ⏸️ `TASK_12` — mundane fouls PARKED; re-evaluate only if 18+19 leave the distribution unrealistic
7. `TASK_16` — anti-siphoning; do after TASK_11 (spread changes affect softmax balance)
8. `TASK_17` — recorded-form momentum; depends on TASK_11's `MatchForm` injection (shipped)

**Wave 2 — Lock the calibration gates**
9. `TASK_07` — recalibrate and re-lock all test gates once the engine has stopped moving (**must run after TASK_19**, which moves the gap curve + fatigue)

**Wave 3 — Match quality layer** (needs good event volume to be meaningful)
6. `TASK_14` — player rating overhaul; meaningless at 20 passes/team, excellent at 400+
7. `TASK_06` — deeper match insights; detectors need event density to fire reliably
8. `TASK_13` — adaptive AI tactics (stages A → B → C independently)

**Wave 4 — Standalone features** (no engine dependency; interleave freely)
- `TASK_03` — newspaper transfer rumours
- `TASK_04` — academy intake day
- `TASK_05` — records / top scorers
- `TASK_20` — calendar/time-driven world events (backend refactor; fixes missed transfer-window events on multi-matchday advances)
- `TASK_01` — transfer negotiation (most complex; reserve for a multi-session slot)

### Dependency notes
- TASK_15 is the forcing function: it shifts calibration baselines, foul counts, and rating data; everything in Waves 2–3 is downstream of it.
- TASK_07 must always be the last engine task in any wave — it locks gates that earlier tasks open.
- TASK_01 (transfer negotiation) is the most complex UI task; best picked up when there's time for a multi-session effort.
