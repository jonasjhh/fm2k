# TASK_15 — Match simulation richness

## Goal

Transform the simulator from a highlight-reel event generator into a model of
real football possession. A match should produce hundreds of passes per team,
every outfield player should touch the ball, and the ball carrier should make
genuinely contextual decisions — short or long, carry or pass back, drive
forward or hold up — rather than drawing from a flat weighted menu.

The duel remains the atomic unit throughout. Every contested action resolves as
a duel; only the *choice* of action and the *consequences* of winning/losing
become richer.

## What's wrong today (root causes)

| Problem | Root cause |
|---------|-----------|
| ~20–40 passes per team per match | `eventsPerMinute = 3` → 1–4 ticks/minute |
| Same player always gets the ball | `pickReceiver` deterministically picks the single highest scorer |
| Passes complete or are intercepted — nothing in between | Binary duel outcome; no loose ball path |
| CBs and GKs never touch the ball in open play | No back pass situation; no GK distribution chain |
| Pressing slider has no event fingerprint | Press duel not modelled; only affects positioning |
| Long balls and clearances just set the ball free | No aerial second-ball contest |
| Blocked shots don't exist | All shots reach the keeper |
| No progressive carrying from defence | No `progressive_carry` situation |

---

## Phase 15A — Volume + receiver variety ✅ DONE (2026-07-19)

**Scope:** Two mechanical fixes, no new event types, no new situations.

**Result:** ~290 passes/match (both teams combined) at default settings.
Also fixed `distribution.ts` default (`?? 3` → `?? 12`) and added
`passesAttemptedPerMatch` to `DistributionResult` with calibration test gate (150–1200).

### A1. Raise event volume

`eventsPerMinute` defaults to `3`. Change to `12` in:
- `packages/match/src/match/simulate.ts` (line ~68)
- `packages/match/src/match/match-occurrence.ts` (line ~65)
- `packages/engine/src/season/season-manager.ts` (line ~23)

The per-minute formula is `floor(rng() * eventsPerMinute * tempoMult) + 1`,
giving ~1–16 ticks/minute at tempo-neutral. Target: `passes.home.attempted`
averages 400–600 per match. Tune the constant after seeing the calibration
report; `12` is the starting estimate.

### A2. Weighted receiver selection

Replace the deterministic `pickReceiver` in `flow.ts:162` with softmax
temperature sampling so all viable teammates get selected with probability
proportional to their score, not just the single best one.

```ts
function pickReceiver(
  attacking: FlowTeam, from: XY, rng: () => number,
  opts?: { advanced?: boolean },
): string | null {
  const carrierY = attackY(from, attacking.side);
  const scored = outfieldIds(attacking)
    .filter(id => attacking.positions[id] !== from)
    .map(id => ({
      id,
      score: attackY(attacking.positions[id], attacking.side) - carrierY
             - distance(from, attacking.positions[id]) * 0.5,
    }))
    .filter(e => !opts?.advanced || e.score > 0.05)
    .filter(e => e.score > -0.3);
  if (scored.length === 0) { return null; }
  const T = 0.3; // temperature: lower = more deterministic
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

Pass `rng` through from callers (`resolveShortPass`, `resolveThroughBall`).

### A — Calibration targets

| Stat | Before | After 15A |
|------|--------|-----------|
| `passes.home.attempted` | ~20–40 | 400–600 |
| Unique players with ≥ 1 event | ~5–8 | ≥ 16 of 22 |
| Goals per match | ~2.5 | unchanged |

Update `distribution.calibration.test.ts` floor/ceiling for `passesAttempted`.

---

## Phase 15B — Richer ball-carrier decision tree ✅ DONE (2026-07-19)

**Scope:** Expand the situation chooser (`Situation` union + `situationWeights`
+ new resolvers). Two new situations: `back_pass` and `progressive_carry`.

**What shipped:**
- `back_pass` resolver: targets GK or deepest player behind carrier; low-resist pass duel; fumble → interception
- `progressive_carry` resolver: single duel (technique + speed×0.3 vs defending); proximity-gated (defender must be <0.35 units away); win → advance position; lose → loose ball / foul
- Band-aware `situationWeights`: `BAND_WEIGHTS` table multiplies base weights per `Band`; `carrierBand()` looks up via `fieldedPositions` or falls back to `Player.position`
- `FlowTeam.fieldedPositions` optional field; threaded from `duel-simulator.ts`
- `EventType`, `CONTESTED_ACTION_TYPES`, `PASS_ACTION_TYPES`, `feedback.ts` all updated
- 6 new tests; 321 total pass

### The decision model

A ball carrier sees these options (mapping to the Situation type):

| Option | When available | Primary attribute |
|--------|---------------|-------------------|
| `short_pass` | Always | passing |
| `long_pass` | Own half or midfield | passing + directness |
| `through_ball` | Midfield, space ahead | passing |
| `back_pass` | Under pressure or in own third | passing (low risk) |
| `cross` | Wide position, advanced | passing |
| `progressive_carry` | DEF/DM band, space ahead | technique + speed |
| `dribble` | Advanced position, 1v1 | technique |
| `shot` | Attacking third | finishing |
| `shield` | Outnumbered, nowhere to go | strength |
| `clear` | Own third, outnumbered | strength |

### B1. Back pass

Add `'back_pass'` to the `Situation` union.

**Situation weight:** Active when in own third or under heavy pressure
(high `secondDefenderPenalty`). Weighted up for DEF/DM bands. Tactical
low-directness slider increases weight.

**Resolver `resolveBackPass`:**
- Target: the GK, or if none available, the deepest outfield player behind the carrier
- Duel: carrier's passing vs a very low resist (25 — a safe routine pass backward)
- On success: `back_pass` event, ball → GK/target. Tags `receiverId` in metadata
- On failure (rare — fumbled backpass): loose ball near the penalty area (dangerous)

After a back pass lands with the GK, the GK's *next* possession triggers the
GK distribution chain (Phase 15C).

### B2. Progressive carry

Add `'progressive_carry'` to the `Situation` union.

**Situation weight:** Active for players in DEF or DM band when there is space
ahead (low opponent presence in the next cell). Weighted by technique and speed
relative to the carrier's own mean. Zero weight for ATT/AM.

**Resolver `resolveProgressiveCarry`:**

Two-stage duel:

1. **Can the presser close the space?** Speed duel between the carrier and the
   nearest opponent in the *next band up*. If the carrier wins the space race
   (attacker wins), skip to stage 2 directly. If the presser arrives in time
   (defender wins stage 1), escalate to stage 2.

2. **Can the carrier hold them off?** Technique vs the presser's defending.
   - Carrier wins → `progressive_carry` event, ball advances ~0.2 pitch lengths
     toward goal, carrier keeps possession
   - Carrier loses → loose ball at the carry point (speed duel pickup, see 15D)
   - Badly lost → potential foul (same `maybeFoul` path as dribble)

**Event:** `progressive_carry` — new `EventType`. Description: "Silva drives
out of defence" / "Okonkwo carries into the final third".

**Position weighting in TASK_14 rating engine:** `progressive_carry` gets a
high multiplier for DEF and DM bands, zero for ATT.

### B3. Position-weighted situation chooser

Update `situationWeights` to be band-aware. The carrier's `Band` (from
`BAND_OF_ROLE[fieldedPosition]`) shapes the menu:

| Situation | GK | DEF | DM | MID | AM | ATT |
|-----------|----|----|-----|-----|-----|-----|
| short_pass | high | high | high | high | med | med |
| long_pass | low | med | med | low | low | low |
| through_ball | 0 | low | med | high | high | med |
| back_pass | high | high | med | low | 0 | 0 |
| cross | 0 | 0 | 0 | low | med | high (wide only) |
| progressive_carry | 0 | high | high | low | 0 | 0 |
| dribble | 0 | low | low | med | high | high |
| shot | 0 | 0 | 0 | low | med | high |
| shield | med | med | med | med | low | low |
| clear | high | high | med | low | 0 | 0 |

The current `directness` and `shotFreq` slider effects are preserved; band
weights layer on top as multipliers.

`flowTeam` needs to carry `fieldedPositions` so `situationWeights` can look up
the carrier's band via `BAND_OF_ROLE`. This is already on `MatchState` —
thread it through.

---

## Phase 15C — GK distribution chain ✅ DONE (2026-07-19)

**Scope:** When the GK has the ball (after a save, a back pass, or a goal kick),
they make an explicit distribution choice rather than silently carrying.
Depends on 15B (back pass completes the possession cycle).

### C1. GK distribution decision

When `ball.carrierId === gkId`, the situation chooser yields a restricted menu:

| Option | When available | Resolver |
|--------|---------------|---------|
| `gk_short` | Always | short pass to nearest CB; low-risk PASS_DUEL vs resist 20 |
| `gk_long` | Always | long kick delivery → aerial second-ball contest in midfield (15D) |

The GK's `passing` attribute governs both. A GK with low passing leans
`gk_long` (it's less likely to be intercepted short if they can't pick a pass).
The tactical `directness` slider shifts the weight: low directness → prefer
`gk_short`; high directness → prefer `gk_long`.

### C2. Aerial second ball from GK long kick

A `gk_long` triggers `LONG_BALL_DELIVERY` check into the midfield zone:
- Delivery check vs the opposition midfield average defending
- On target → strength duel between the GK's best aerial target (highest
  strength among outfielders) and the nearest opposition midfielder
- Winner gets the ball; loser gives up possession
- Poor delivery → loose ball in midfield (15D pickup race)

This creates the full possession cycle: back pass → GK → long kick → aerial
contest → new possession. A long-ball team will produce this chain frequently;
a possession team will recycle short and build again.

---

## Phase 15D — New contested event types ✅ DONE (2026-07-19)

**Scope:** Richer outcomes for existing chains and new contested situations.
Each is a new duel trigger within existing resolution paths. Can be done in
any order; coordinate calibration with TASK_12.

### D1. Loose ball / free ball as speed duel

Currently a lost PASS_DUEL immediately gives the ball to the interceptor.
Add a margin-based split:

- `outcome.margin < -0.2` → clean interception (existing path — defender wins clearly)
- `-0.2 ≤ outcome.margin < 0` → loose ball: emit `loose_ball` event, set
  `ball: { mode: 'free', at: midpoint }`. The *next* `flowTick` picks it up
  as a free-ball speed race between nearest attacker and nearest defender

Apply to: `resolveShortPass`, `resolveThroughBall`, `resolveLongPass`.

Add `'loose_ball'` to `EventType`. Zero rating delta (neutral).

### D2. Blocked shot

Before the shot reaches the keeper, the nearest outfield defender gets a chance
to block. Insert before `resolveShot` is called:

1. Find nearest outfield defender to the shot path
2. Technique vs shooter's finishing: if defender wins → `blocked_shot` event,
   ball goes to a corner or clears (same `CORNER_CHANCE_ON_CLEARANCE` logic)
3. If defender loses → shot reaches keeper, normal resolution

Only apply when there *is* an outfield defender near the shot path (not when
the attacker is through one-on-one with the keeper). Threshold: defender within
0.1 pitch units of the shooting lane.

Add `'blocked_shot'` to `EventType`. Generates a `clearance`-equivalent for
the blocking defender in rating terms.

### D3. Press duel

When the situation chooser runs, if the carrier is heavily pressured
(`secondDefenderPenalty` at cap), there is a pre-situation duel: the presser
vs the carrier in a technique vs defending contest.

- Carrier wins the press → normal situation choice proceeds
- Carrier loses the press → ball goes loose (D1 loose ball path) or immediately
  to the presser if the margin is large
- This makes the pressing slider produce visible events: "Müller presses and
  wins the ball" rather than just affecting positioning

The press duel fires probabilistically (not every tick) — scale with
`pressIntensity` slider.

### D4. Aerial second ball (open play)

`resolveLongBall` currently uses `LONG_BALL_DELIVERY` and then sets the ball
free at the target point. Replace the "ball free" outcome with an aerial
strength duel:

- Best aerial attacker (highest `strength`) vs nearest defender's `strength`
- Winner gets possession; loser is beaten in the air
- Poor delivery (delivery check fails) → loose ball at the landing point

Same pattern as `resolveDeliveryIntoBox` without the shot chain.

### D5. Cutback

Add `'cutback'` as a variant of `cross`, available when an ATT-band player
is at or near the byline (`y > 0.9` in the attacking frame, `x < 0.15` or
`x > 0.85`).

- Delivery: passing + technique vs defensive read (marker's defending)
- Target: the highest-scoring AM/MID arriving late (not the tall ST)
- On target → technique duel (first-time finish) vs keeper, not strength duel
- This makes wide attackers who reach the byline distinct from those crossing
  early

### D6. Long shot

Add `shot` as a valid situation in the `MID` and `AM` bands when the carrier
is in the `away_third` zone (not yet inside the box, `0.6 < y < 0.83`).

- Lower shot duel base chance (add `LONG_SHOT_PENALTY = 0.08` to the keeper)
- A missed long shot has a higher corner chance (`CORNER_CHANCE_ON_SAVE * 1.5`)
- Weighted up by `shotFrequency` slider and carrier's `finishing`

### D7. Penalty area scramble

After a save where `outcome.margin < -0.1` (keeper doesn't hold cleanly),
instead of automatically giving the keeper the ball, emit a `rebound` event
and trigger a speed duel between the nearest attacker and the keeper:

- Attacker wins → loose ball in the six-yard box → resolveShot immediately
- Keeper wins → they smother it and restart

---

## Phase 15E — Calibration pass ✅ DONE (2026-07-20)

After A–D land, run the full calibration harness and update all gates.

### Target statistics post-15A–D

| Stat | Before 15A | After 15A | After 15B–D |
|------|-----------|-----------|-------------|
| `passes.home.attempted` | ~20–40 | 400–600 | 400–600 (maintained) |
| Unique players ≥ 1 event | ~5–8 | ≥16 | ≥20 of 22 |
| `progressive_carry` events | 0 | 0 | 8–20/match |
| `blocked_shot` events | 0 | 0 | 3–8/match |
| `loose_ball` events | 0 | 0 | 15–40/match |
| Goals per match | ~2.5 | unchanged | unchanged |
| Fouls per match | ~0.9 | raised | coordinate with TASK_12 |

Update `distribution.calibration.test.ts` floors/ceilings. Flag conflicts with
TASK_12 foul targets and resolve together.

---

## Files to touch

| File | Phases |
|------|--------|
| `packages/match/src/match/simulate.ts` | 15A |
| `packages/match/src/match/match-occurrence.ts` | 15A |
| `packages/engine/src/season/season-manager.ts` | 15A |
| `packages/match/src/match/duel/flow.ts` | 15A, 15B, 15C, 15D |
| `packages/match/src/match/types.ts` | 15B, 15D (new EventTypes) |
| `packages/match/src/match/stats.ts` | 15D (new event deltas) |
| `packages/match/src/match/duel/duel-simulator.ts` | 15B (thread fieldedPositions to flowTeam) |
| `packages/match/src/match/distribution.calibration.test.ts` | 15A, 15E |

## Dependency notes

- 15A is fully standalone — ship it first
- 15B depends on 15A having landed (need realistic volume to validate new situations)
- 15C depends on 15B (back pass must exist before GK distribution is meaningful)
- 15D phases are independent of each other — implement in any order, all depend on 15A
- 15E is always last
- TASK_14 (rating overhaul) should be done after 15A at minimum; the new event
  types from 15B–D feed into TASK_14's position-weighted deltas
