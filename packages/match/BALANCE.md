# Match balance — measured distributions

This is the **black-box** picture of the simulator after the rebalance: distributions over
**1000 seeded matches** per matchup, produced by `runDistribution(...)`
([src/match/distribution.ts](src/match/distribution.ts)). The range *gates* that lock these
in live in [src/match/distribution.calibration.test.ts](src/match/distribution.calibration.test.ts)
and run on demand:

```
mise exec -- pnpm --filter @fm2k/match test:calibration
```

(The calibration suite is **excluded from the normal `test`/`check` run** — it's slow and is
the deliberate target of tuning, not a fast unit gate.)

All teams 4-4-2 `balanced` unless noted. "H/D/A" = home win / draw / away win %.

| Matchup | Goals (med, max) | H / D / A | Shots | Poss | Fouls | Y | R | Pen | Cor | Inj | End energy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Even tier-3 (35 v 35) | 2.80 (3, 10) | 36 / 34 / 30 | 14–14 | 51 | 5.8 | 0.74 | 0.12 | 0.39 | 7.3 | 0.41 | 78 |
| Even tier-2 (55 v 55) | 2.72 (3, 10) | 36 / 34 / 30 | 15–14 | 51 | 4.1 | 0.56 | 0.09 | 0.18 | 7.7 | 0.33 | 81 |
| Even tier-1 (75 v 75) | 2.22 (2, 9) | 40 / 33 / 27 | 12–12 | 51 | 2.5 | 0.28 | 0.04 | 0.03 | 6.4 | 0.28 | 85 |
| Gap (65 v 45) | 3.93 (4, 11) | 95 / 5 / 0 | 20–10 | 61 | 4.0 | 0.56 | 0.08 | 0.16 | 7.5 | 0.32 | 83 |
| Gap (75 v 25) | 8.02 (8, 15) | 100 / 0 / 0 | 28–3 | 73 | 4.0 | 0.53 | 0.07 | 0.19 | 5.6 | 0.34 | 85 |
| Blowout (90 v 15) | 9.79 (10, 17) | 100 / 0 / 0 | 29–1 | 78 | 2.4 | 0.33 | 0.03 | 0.02 | 4.1 | 0.34 | 87 |
| Counter vs high line¹ | 4.00 (4, 12) | 68 / 16 / 16 | 16–15 | 49 | 3.7 | 0.53 | 0.07 | 0.22 | 7.7 | 0.34 | 83 |
| Deep block vs press² | 1.86 (2, 8) | 41 / 32 / 27 | 8–11 | 48 | 5.2 | 0.71 | 0.10 | 0.27 | 5.0 | 0.31 | 79 |

¹ Home: pacey/clinical squad, `hit_on_counter`. Away: `press_high` + high defensive-line slider.
² Home: `5-4-1` `defend_deep`. Away: `4-3-3` `press_high`.

## How to read it

- **Scoring is realistic and roughly tier-flat.** Even matches sit ~2.2–2.8 total goals
  (real ≈2.7); elite matches score a touch less (good keepers). A quality gap scales cleanly
  to dominance — **90 v 15 medians a 10-0**, the intended "crazy blowout".
- **Home advantage** (a modest chance-quality bump) gives ~36–40% home wins and trims draws
  to ~33% (without it, even matches were ~40% draws).
- **Discipline & set pieces are deliberately moderate and roughly tier-flat:** ~3–6 fouls,
  <1 yellow, rare reds, ~0.2 penalties (per match), ~6–8 corners. (Earlier, lower divisions
  were foul/penalty-heavy because discipline keyed off *absolute* skill; it's now only gently
  tier-sensitive, and box fouls are rarer so penalties stay realistic.)
- **Injuries** ~0.3–0.4 per match (both sides), rising with low stamina / heavy workload.
- **Fatigue** shows in end-of-match energy (~78 tier-3 vs ~85 tier-1; a low-stamina or
  high-tempo/press side ends lower).
- **Tactics read through:** a pacey counter side beats a high line (68% vs the press); a deep
  block holds an attacking side to ~1.9 goals and few shots.

## The levers tuned in this pass (white-box)

All in [src/match/action-generators.ts](src/match/action-generators.ts) unless noted:

- Parity-centred per-action rates (pass/dribble/tackle/intercept/shot conversion) — unchanged
  core from the prior round.
- `HOME_ADVANTAGE_CQ` (+16 chance-quality on the home side) in
  [src/match/match-simulator.ts](src/match/match-simulator.ts) — applied on the params so the
  generators stay pure/unit-testable.
- `foulProneness` flattened (gentle tier sensitivity) + `BOX_FOUL_FACTOR` (fouls rarer in the
  box → realistic penalty rate).
- `CORNER_ON_SAVE` / `CORNER_ON_CLEARED_CROSS` raised so corners land ~6–8/match.
- Injury model ([src/match/injury.ts](src/match/injury.ts)): lower base, gentler stamina
  sensitivity (workload/energy is the stronger driver).

## Known/accepted

- **Big mismatches score high** (75 v 25 ≈ 8, 90 v 15 ≈ 10). A 50-point attribute gap is
  enormous; this is the intended blowout behaviour, amplified slightly by home advantage.
- The synthetic *pure-neutral* `scale-calibration.test.ts` (no formation) runs a touch hotter
  than these figures because every real team carries a formation whose compactness pulls
  scoring down — the `simulateMatch` distributions above are the realistic numbers.
