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
| Even tier-3 (35 v 35) | 3.13 (3, 9) | 38 / 27 / 35 | 17–17 | 51 | 5.2 | 0.73 | 0.07 | 0.21 | 8.9 | 0.41 | 78 |
| Even tier-2 (55 v 55) | 3.05 (3, 9) | 36 / 32 / 32 | 16–16 | 51 | 4.3 | 0.55 | 0.07 | 0.10 | 8.5 | 0.32 | 82 |
| Even tier-1 (75 v 75) | 2.49 (2, 9) | 34 / 33 / 33 | 13–13 | 51 | 3.4 | 0.47 | 0.05 | 0.03 | 7.0 | 0.27 | 85 |
| Gap (65 v 45) | 4.12 (4, 11) | 97 / 3 / 0 | 21–12 | 60 | 4.3 | 0.58 | 0.05 | 0.11 | 8.3 | 0.32 | 84 |
| Gap (75 v 25) | 8.72 (9, 16) | 100 / 0 / 0 | 30–5 | 73 | 4.2 | 0.57 | 0.06 | 0.12 | 6.5 | 0.33 | 85 |
| Blowout (90 v 15) | 11.82 (12, 22) | 100 / 0 / 0 | 35–2 | 83 | 3.5 | 0.48 | 0.05 | 0.08 | 5.1 | 0.34 | 88 |
| Counter vs high line¹ | 3.44 (3, 12) | 47 / 27 / 27 | 15–18 | 48 | 3.7 | 0.47 | 0.06 | 0.07 | 8.7 | 0.32 | 84 |
| Deep block vs press² | 1.92 (2, 8) | 31 / 43 / 26 | 8–14 | 48 | 4.6 | 0.60 | 0.07 | 0.13 | 5.9 | 0.34 | 80 |

¹ Home: pacey/clinical squad, `hit_on_counter`. Away: `press_high` + high defensive-line slider.
² Home: `5-4-1` `defend_deep`. Away: `4-3-3` `press_high`.

## How to read it

- **Scoring is realistic and roughly tier-flat.** Even matches sit ~2.5–3.1 total goals
  (real ≈2.7); elite matches score a touch less (good keepers). A quality gap scales cleanly
  to dominance — **90 v 15 medians a 12-0**, the intended "crazy blowout".
- **Home advantage** (a modest chance-quality bump) gives ~36–40% home wins and trims draws
  to ~33% (without it, even matches were ~40% draws).
- **Discipline & set pieces are deliberately moderate and roughly tier-flat:** ~3–6 fouls,
  <1 yellow, rare reds, ~0.2 penalties (per match), ~6–8 corners. (Earlier, lower divisions
  were foul/penalty-heavy because discipline keyed off *absolute* skill; it's now only gently
  tier-sensitive, and box fouls are rarer so penalties stay realistic.)
- **Injuries** ~0.3–0.4 per match (both sides), rising with low stamina / heavy workload.
- **Fatigue** shows in end-of-match energy (~78 tier-3 vs ~85 tier-1; a low-stamina or
  high-tempo/press side ends lower).
- **Tactics read through:** a pacey counter side edges a high-line press (47% vs 27%); a deep
  block holds an attacking side to ~1.9 goals and few shots (and draws often).

## The action model (how a possession resolves)

Each minute the **possessor's** active player picks an *offensive* action (`short_pass`,
`long_pass`, `through_ball`, `cross`, `dribble`, `shot`); then a **selected defender**
contests it (`resolveContest` in [src/match/action-generators.ts](src/match/action-generators.ts)).
The contest is the **single turnover source** — the offensive generators model only the
*uncontested* success path, and the old standalone `tackle`/`interception`/`clearance`
actions are gone. `shot` is the exception: it is resolved by the keeper, not an outfield
contest. This means an **individual** defender's tackling/reading contests each action
(individual attributes matter per event, not just a team average).

## The levers tuned in this pass (white-box)

All in [src/match/action-generators.ts](src/match/action-generators.ts) unless noted:

- `CONTEST_PARITY` per action (the defender-win = turnover chance at parity; doubles as the
  action's "exposure": short pass 0.32 → through-ball/cross 0.54) and `CONTEST_SPREAD`
  (how the defender-vs-attacker skill gap shifts it). These replace the old embedded
  per-generator success rolls.
- `FOUL_ON_CHALLENGE` + `FOUL_EXPOSURE` (per action; carry-heavy) and `BOX_FOUL_FACTOR`
  (fouls rarer in the box → realistic penalty rate); `foulProneness` keeps gentle tier
  sensitivity.
- `HOME_ADVANTAGE_CQ` (+16 chance-quality on the home side) in
  [src/match/match-simulator.ts](src/match/match-simulator.ts) — applied on the params so the
  generators stay pure/unit-testable.
- Shot conversion (`CONV_PARITY`/`CONV_SPREAD`, finisher-vs-keeper) and corner rates
  (`CORNER_ON_SAVE` / `CORNER_ON_CLEARED_CROSS`) — core from the prior round.
- Injury model ([src/match/injury.ts](src/match/injury.ts)): lower base, gentler stamina
  sensitivity (workload/energy is the stronger driver).

## Known/accepted

- **Big mismatches score high** (75 v 25 ≈ 9, 90 v 15 ≈ 12). A 50–75-point attribute gap is
  enormous, and the pure contest model compounds it (every action is contested by an
  outclassed defender); this is the intended blowout behaviour, amplified slightly by home
  advantage.
- The synthetic *pure-neutral* `scale-calibration.test.ts` (no formation) runs a touch hotter
  than these figures because every real team carries a formation whose compactness pulls
  scoring down — the `simulateMatch` distributions above are the realistic numbers.
