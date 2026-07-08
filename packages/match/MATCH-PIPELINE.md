# Match action pipeline

Every simulated minute runs 1–3 actions through this pipeline. Each stage is an
explicit **skill check** (see `src/match/skill-checks.ts` — one `checkChance`
formula, named per meaning), rolled on the single injected rng, so a seed replays
exactly. This document is the map for anyone adding a stage (statistics and the
upcoming injury system are post-processing consumers; deeper positioning models
extend the perception/engagement stages).

```
selection → perception → decision → contest/engagement → outcome → receiver → post-processing
```

## 1. Selection — who is on the ball (`ActionSelector.getActivePlayer`)
Weighted random pick over the possessing XI: a player's weight is their field line
(GK/DEF/MID/ATT) at the ball's zone (`LINE_ZONE_WEIGHT`) times a flank match/mismatch
factor. Free positioning substitutes per-player geometry for the role lookup.

## 2. Perception — what she sees (`getPossibleActions` + `visionCheck`)
Generators report which actions are physically possible (`canPerform`). The hard-to-see
options — `through_ball`, `long_pass` — additionally require a **vision check**
(awareness vs an average read, `VISION_SPECS`): failing removes the option this action
("she didn't spot the run"). Safe options are always visible. This is why
high-awareness playmakers attempt more killer balls.

## 3. Decision — what she tries (`makeDecision`)
Each perceived option is weighted: generator propensity × position preference ×
situation × risk tolerance (score-aware) × tactic parameters × decision quality.
Awareness then tiers the pick (best / second-best / any) — the "wrong choice under
pressure" mechanic.

## 4. Contest & engagement — the defence answers (`resolveContest`, engagement stage)
Every non-shot action is contested by the nearest defending outfielder (ball mirrored
into their frame): first a **foul check** (exposure × press × discipline; may chain
cards and set pieces), then a **duel check** (`contestWinChance`: defender's relevant
skill vs the attacker's, parity per action type, press-scaled). A win produces the
turnover event (tackle/interception/clearance/corner) — tagged with
`metadata.contestedAction/attackingTeam/attackerId` so post-processing sees the failed
attempt.

**Engagement (dribbles only):** beating the first defender may draw a second —
probability from the defending side's press intensity and the zone
(`engagementChance`), defender picked by the same positional weighting (primary
excluded), checking at `SECOND_DEFENDER_FACTOR` reduced win chance. His events carry
`metadata.secondDefender: true`.

## 5. Outcome — the action lands (generator success paths)
The surviving action's generator produces the success event: ball advances through
zones (progression scaled by transition speed, opponent compactness and the
team-quality edge), shots resolve against the keeper (**finishing check**, then zone ×
chance-quality × momentum scaling), crosses chain an aerial duel.

## 6. Receiver — the ball still has to be brought down
- `through_ball`: the most advanced likely runner (ST/AM/wing) rolls a **first-touch
  check** (technique/composure vs the defence's read). Failure chains a loose-ball
  turnover (`metadata.looseTouch`); the pass still counts completed — the touch lost it.
  The runner is recorded as `metadata.receiverId` (future injury trigger).
- `cross`/`corner`: the box target contests an aerial duel (heading vs keeper + defender
  aerial ability); those header events carry `metadata.aerial: true`.

## 7. Post-processing — consequences of the minute
`simulateMinute` hands the minute's flattened events to consumers that must be
**rng-free on the main stream**:
- `StatsAccumulator` (possession, shots, passes, action breakdown, player ratings).
- (Planned, Step 9B) the injury scanner: rolls a *dedicated* seeded injury rng against
  per-event exposure tables (tackles → impact injuries, sprints → muscle, aerials →
  head), so injuries are consequences of what actually happened.

## Determinism rules
- One shared seeded rng stream for stages 1–6; identical seed + tick order + user
  decisions ⇒ identical match. Never draw from it conditionally on anything
  non-deterministic.
- New systems either consume no rng (post-processing) or derive a dedicated stream
  from a single main-stream draw (the injury rng).
- Ids: **uuids for persistent entities** (players, listings — `v4` from @fm2k/state);
  **deterministic counters for ephemeral match events** (the ActionSelector's per-match
  `event-N`, the generators' module sequence `event-gN`). Nothing else.

## State ownership (occurrence vs simulator)
- `MatchSimulator` owns the *rules*: `simulateMinute(state) → {events, nextState}` is
  the only thing that advances play, and `createInitialState()` the only thing that
  builds a fresh state.
- `MatchOccurrence` owns the *lifecycle*: it holds `matchState` between ticks and is the
  only mutator outside the simulator — exclusively **between** minutes, via
  `applyPendingSubstitutions` (roster/fielded-slot swaps) and `applyPendingTactics`
  (params/fielded re-derivation) before handing the state back to `simulateMinute`.
- Nothing else may touch `MatchState`. Readers (`getMatchState`, `getStatistics`,
  `LiveMatch` projections) must not mutate.

## Tuning
All check specs live in `skill-checks.ts` (new stages) and the constant blocks at the
top of `action-generators.ts` (legacy stages). Calibration gates:
`pnpm --filter @fm2k/match test:calibration` (see BALANCE.md).
