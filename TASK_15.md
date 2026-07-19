# TASK_15 — Match simulation richness: volume, variety, and player involvement

## Goal

Make the simulator produce a realistic volume of events with varied player
involvement and richer pass outcomes. A match should generate hundreds of
passes per team (not tens), every outfield player should touch the ball
multiple times, and the outcome of an action should depend on what happens
next (completion → retain, interception → turnover, loose ball → contest).

## What's wrong today

### 1. Too few events (the fundamental volume problem)

`eventsPerMinute = 3` combined with the tempo multiplier (0.7–1.3) produces
`floor(rng() * 3 * tempoMult) + 1` ticks per minute = **1–4 flow ticks/minute**.
Over 90 minutes that's roughly 90–360 situation chains *combined for both
teams*. A realistic football match has 400–600 passes per team (≈ 800–1200
total). The architecture is correct — it's purely a volume knob.

**Fix:** Raise `eventsPerMinute` default from `3` to something in the `10–15`
range. Each tick is already a cheap duel resolution (no position recalculation,
no rng consumption beyond the duel itself), so raising this is low cost.
Calibrate until `passes.home.attempted` averages ~400–600 per match.
Keep a `shortPassThrottleDepth` knob if needed to prevent possession spiralling
(see below).

### 2. Receiver selection is deterministic (the "always the same man" problem)

`pickReceiver` in `flow.ts:162` ranks all outfield teammates by
`progress - distance * 0.5` and picks the *single highest scorer* every time.
The same carrier in the same zone always passes to the same player. This means:
- Wide players who score slightly lower than the central runner are never picked
- The "closest man ahead" always gets the ball — no variation in build-up
- Player ratings diverge wildly: the one player the algorithm favours accumulates
  all the events; others get none

**Fix:** Convert `pickReceiver` to weighted-random selection among the top N
candidates. Score candidates the same way but use `softmax`-style temperature
sampling so the best option wins most of the time without monopolising 100%:

```ts
function pickReceiver(attacking: FlowTeam, from: XY, opts?): string | null {
  const scored = outfieldIds(attacking)
    .filter(id => attacking.positions[id] !== from)
    .map(id => ({
      id,
      score: attackY(attacking.positions[id], attacking.side) - attackY(from, attacking.side)
             - distance(from, attacking.positions[id]) * 0.5,
    }))
    .filter(e => !opts?.advanced || e.score > 0.05)
    .filter(e => e.score > -0.3);      // don't pass backward to someone very deep
  if (scored.length === 0) { return null; }
  // Softmax: weights = exp(score / temperature). Temperature 0.3 → strong preference
  // for the best option but genuine variety among close candidates.
  const T = 0.3;
  const weights = scored.map(e => Math.exp(e.score / T));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) { return scored[i].id; }
  }
  return scored[scored.length - 1].id;
}
```

The function needs `rng` passed in — `resolveShortPass` already has it via ctx.

### 3. Pass outcomes are binary (complete vs. interception)

Currently `resolveShortPass` resolves a PASS_DUEL → either `short_pass` event
(ball reaches receiver) or `interception` event (ball goes straight to the
interceptor). There is no middle ground. Real passes can:

- **Complete cleanly** — ball reaches receiver, keeper of the ball
- **Be intercepted** — defender reads it, his team keeps possession
- **Be fumbled / go loose** — weak outcome, ball becomes `free`; a race ensues
  between the nearest attacker and nearest defender

**Fix:** Add a `loose_ball` outcome when the attacker narrowly loses the
PASS_DUEL (margin between −0.05 and −0.20). Emit a new `loose_ball` event,
set `ball: { mode: 'free', at: midpoint }`, and let the next `flowTick` call
handle the free-ball pickup race (already implemented in `flowTick`'s free-ball
branch). No new `EventType` needed if `loose_ball` is covered by the existing
`free_kick` event vocabulary; otherwise add it.

```ts
// In resolveShortPass, after duel resolution:
if (outcome.attackerWins) {
  // ... existing success path
} else if (outcome.margin > -0.2) {
  // Loose ball — weak contact, didn't quite reach receiver or got poked away
  events.push({
    type: 'loose_ball',
    team: attacking.side, playerId: carrierId,
    description: `${name(attacking, carrierId)}'s pass is knocked loose`,
    metadata: { contestedAction: 'short_pass', attackingTeam: attacking.side, attackerId: carrierId },
  });
  return { events, ball: { mode: 'free', at: midpoint } };
} else {
  // Clean interception — existing path
}
```

### 4. Players are uninvolved because only the ball carrier is selected per tick

Each tick operates on *one carrier* who picks *one action*. With low volume
(issue 1) and deterministic receiver selection (issue 2), players far from the
"preferred path" never get the ball. The fix for issue 1 (volume) and issue 2
(receiver variety) together should largely solve this, because more ticks means
the ball changes hands more often and varies its route.

However there is an additional structural gap: **wide players and deep
defenders are systematically deprioritised** by `pickReceiver` because their
`progress - distance * 0.5` score is low when they are lateral or behind the
ball. After the softmax fix, consider adding a small positional bonus for
under-used players (a participation counter — if a player hasn't touched the
ball in N ticks, give them a small weight bonus). This is optional — do it only
if the softmax alone doesn't distribute well enough.

## Target statistics post-implementation

Run the calibration report and check `distribution.calibration.test.ts` after
changes. Target values:

| Stat | Current (approx) | Target |
|------|-----------------|--------|
| `passes.home.attempted` | ~20–40 | 400–600 |
| `passes.away.attempted` | ~20–40 | 400–600 |
| Unique players with ≥ 1 event | ~5–8 of 22 | ≥ 18 of 22 |
| `loose_ball` events per match | 0 | 10–30 |
| Goals per match | ~2.5 (keep) | unchanged |
| Fouls per match | ~0.9 (this raises) | ~3–5 (same as TASK_12 targets) |

Note: TASK_12 (mundane fouls) adds yellow-producing fouls separately; this task
may incidentally raise fouls because more ticks = more dribble/speed duels.
Coordinate the calibration gates after both tasks land.

## Steps

1. **Volume**: Raise `eventsPerMinute` default to `12` in `simulate.ts`,
   `match-occurrence.ts`, and `season-manager.ts`. Run a calibration report.
   Adjust until pass counts are in range.
2. **Receiver variety**: Rewrite `pickReceiver` in `flow.ts` to use
   temperature-weighted sampling. Pass `rng` through from callers
   (`resolveShortPass`, `resolveThroughBall`).
3. **Loose ball**: Add `'loose_ball'` to `EventType` in `types.ts`, add a
   `loose_ball` branch in `resolveShortPass` (and `resolveThroughBall` if
   appropriate). Update `stats.ts` `RATING_DELTA` to give 0 delta for it
   (neutral — the rating system sees it via the `contestedAction` metadata
   path already).
4. **Calibration**: Update `distribution.calibration.test.ts` floor/ceil for
   `passesAttempted`. Raise `eventsPerMinute` if needed to hit targets.
5. **Recalibration gate** (TASK_07): if `eventsPerMinute` changes push foul
   counts above the gates in `distribution.calibration.test.ts`, update them.

## Out of scope

- GK distribution style (short goal kick vs. long kick) — separate task
- Off-ball runs / overlapping fullbacks — movement system change, bigger task
- Deliberate backpasses / possession under pressure — could be added to
  `situationWeights` later via a `back_pass` situation
