# TASK 18 — Symmetric foul attribution (attackers can be booked)

> ✅ **DONE 2026-07-23.** `loserFoulChance` + `ATTACKER_LOSS_FOUL_SCALE = 0.6` added to `duels.ts`; `maybeLoserFoul` (foul charged to the dispossessed attacker, free kick — or penalty in their own box — to the side that won the ball) added to `flow.ts`, wired into the dribble clean-tackle, dribble strength-escalation, and through-ball strength-battle turnover branches. Booking/second-yellow→red machinery reused via the extracted `bookFoul` helper (symmetric per-side, verified). Pure speed races excluded (foul model is strength/dribble only). Tests: 5 `loserFoulChance` unit + 2 flow. `pnpm check` green (match 351). Holding calibration only — **TASK_07 owns the final foul/card lock**; run the foul-by-position histogram + calibration-report diff there.

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. Distribution diagnostics: see the foul-histogram approach in the TASK_12 analysis (measure yellows by position).

## What this is

The engine's foul rule is **one-sided**. In `foulChance` ([duels.ts](packages/match/src/match/duel/duels.ts)):

```ts
if (!outcome.attackerWins) { return 0; }   // foul only fires when the ATTACKER wins
```

So a foul only happens when the ball-carrier (attacker) beats his man, and it is always charged to the **beaten defender** (`maybeFoul` charges `defenderId`). Consequences, measured over 150 even matches:

- **Attacking players are essentially never booked** — forwards ~3% of yellows, because a forward is almost never the defending player in a duel.
- The only bookable event is "defender beaten → lunges," so bookings pile onto whoever defends most 1v1s (fullbacks: 59% of yellows). See TASK_19 for the wide-isolation half of that skew.

Real football: the **loser** of a duel frequently fouls the winner — a dispossessed attacker hacks down the defender to stop the counter; a beaten defender lunges late. Both sides foul.

## The change

Make the foul model **symmetric**: after a contested `dribble`/`strength` duel (and reckless `speed` races — coordinate with any future 50/50 work), the **loser may foul the winner**, charged to the loser, regardless of which side they are on.

- **Attacker wins → defender loses**: beaten defender may foul → free kick to the attacking side. *(existing behaviour — unchanged)*
- **Defender wins → attacker loses**: the dispossessed attacker may foul the defender who just won it (frustration / counter-press) → free kick to the side that just won possession; **the losing attacker is booked**. *(new)*

This is realistic (losing the ball and immediately fouling to stop the break is one of the most common bookings) and it directly puts forwards/attacking mids into the booking pool.

**Not perfectly symmetric — target ~60% defender / ~40% attacker.** Defenders realistically foul a bit more (a beaten defender lunging is more common than a dispossessed attacker hacking back). Model this with a tunable weight — e.g. `ATTACKER_LOSS_FOUL_SCALE ≈ 0.6` applied to the attacker-loss foul chance relative to the defender-loss chance — and tune it to land the split near 60/40 in the measured distribution.

### Implementation sketch

- **`duels.ts`**: generalise the foul probability. Keep `foulChance` for the defender-beaten case, add a `loserFoulChance(outcome)` (or make one symmetric helper) that scales with the **winner's** margin (how badly the loser was beaten), applying whether the loser is attacker or defender.
- **`flow.ts`**: at the turnover branches where the **attacker loses** the ball (dribble tackled cleanly, through-ball race lost, strength-escalation lost), call a `maybeFoul` variant that:
  - emits a `foul` charged to the losing carrier (attacker),
  - emits the `yellow_card` (reuse the existing yellow/second-yellow→red machinery in `applyFlowEvent` — no new plumbing),
  - restarts as a free kick for the side that just won possession.
- Keep the existing defender-beaten path exactly as is.

## Success criteria

- **Distribution**: fouls now split ~60% defender / ~40% attacker by duel role, so forwards/attacking mids get a realistic share of yellows (ST share up from ~3% toward ~8–15%); no outfield position at 0%. Verify with the foul-by-position histogram.
- **Rate stays sane (interim, not final)**: total yellows should not balloon — set `loserFoulChance`/`ATTACKER_LOSS_FOUL_SCALE` so the added attacker fouls are modest (~0.5–1/match), keeping the total in the ~3.5–4.5 band. This is a *holding* calibration to keep the sim playable, **not** the final lock — see the knob-ownership note below.
- **Tests**: `flow.test.ts` — a duel the attacker loses badly produces a foul + booking charged to the *attacker* and a free kick the other way. A clean, narrow loss does not.
- `mise exec -- pnpm check` green.

## Notes / relationships

- **No calibration ripple expected** — this doesn't change who wins duels or where the ball goes, only what happens *after* a loss, so goals/shots/possession are untouched. (Confirm with a calibration-report diff anyway.)
- **Complementary to TASK_19**: this fixes "attackers never foul"; TASK_19 fixes "wide defenders are isolated." Neither subsumes the other.
- **Knob ownership — the foul system is one interacting set of knobs, locked by TASK_07.** `loserFoulChance` / `ATTACKER_LOSS_FOUL_SCALE` (new here), `foulChance` scales, and `YELLOW_CHANCE` / `YELLOW_SECOND_BOOKING_MODIFIER` together determine the *total rate*, the *def/atk split*, and the *card %*. TASK_18 sets only a **holding** value for the new knobs to keep the sim playable; it deliberately does not chase the final numbers. The **final holistic lock of all foul/card knobs is TASK_07's job**, once the engine (18 + 19) has stopped moving — and yes, TASK_07 will re-touch `loserFoulChance` alongside `YELLOW_CHANCE`.
- **Partially overlaps parked TASK_12** — TASK_12's "tactical press foul / 50/50 reckless" also broaden fouls, and a revived TASK_12 is explicitly free to retune `loserFoulChance` as part of tuning the whole foul system. Fold the overlap in rather than duplicating.
