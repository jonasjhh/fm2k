# TASK_16 — Quality-weighted receiver selection (anti-siphoning)

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verify with `mise exec -- pnpm check`.

## What this is

When the ball is in the attacking third and a pass is made, the receiver is selected
by a softmax over position scores — purely geometric. Two strikers at similar
y-coordinates receive the ball in roughly equal shares regardless of their finishing
attribute. This creates a "siphoning" problem: a poor second striker (finishing=40)
takes half the shooting opportunities that would otherwise go to the good striker
(finishing=80), dragging down the team's overall conversion rate.

The consequence: having **one good striker + one creative midfielder** should
outperform **one good striker + one poor striker**, because the midfielder feeds
the good striker rather than competing for shot opportunities. Currently it does
not, making the second-striker slot a free upgrade in attack even when the player
is terrible at finishing.

## Root cause

`pickReceiver` in `packages/match/src/match/duel/flow.ts` scores receivers by:

```ts
score = attackY(positions[id], side) - carrierY - distance(from, positions[id]) * 0.5
```

No attribute weighting. Two strikers at the same position tier split balls evenly.

## Changes

### 1. Finishing-weighted receiver scoring in the attacking third (`flow.ts`)

In `pickReceiver`, after computing the position score, add a finishing bonus when
the receiver is in a shooting position:

```ts
const receiverAttackY = attackY(attacking.positions[id], attacking.side);
const inShootingZone = receiverAttackY > 0.65;
const finishingBonus = inShootingZone
  ? (attr(attacking, id, 'finishing') - 50) / 300   // ±0.16 range for 1–99
  : 0;
score = positionScore + finishingBonus;
```

The divisor (300) keeps the bonus modest so position still drives selection for most
passes; it only matters when two players are similarly positioned and one is
meaningfully better at finishing.

### 2. Carrier finishing influences shot vs pass decision

In `situationWeights` (or its caller in `flowTick`), when the carrier is in the
attacking third, scale the `shot` weight by a finishing modifier:

```ts
// finishing=80 carrier: shot weight × 1.2 — they back themselves
// finishing=40 carrier: shot weight × 0.7 — they look to pass to a better finisher
const finishingMod = 1.0 + (carrierFinishing - 50) / 150;  // 0.67–1.33 range
shotWeight *= finishingMod;
```

This means a poor finisher who receives the ball in the box is more likely to lay it
off sideways than to shoot — which is realistic and means they're useful without
siphoning.

### 3. Add calibration scenario (`scale-calibration.test.ts`)

Add a test that verifies the anti-siphoning property:

```ts
it('given one team with a strong + weak striker vs one team with a strong striker + creative midfielder then the midfielder team scores more', () => {
  // Both teams have 1 ST with finishing=80 and OVR=60.
  // Team A's second ST has finishing=40, everything else 60.
  // Team B's second forward slot is a CM with passing=80, finishing=40, everything else 60.
  // Team B should outscore Team A over N matches because their CM feeds the good striker
  // rather than siphoning shots.
  // Target: teamB.homeGoals > teamA.homeGoals (not merely equal).
});
```

This test gates the specific siphoning fix — it will fail if the receiver weighting
is removed.

## Files to touch

| File | Change |
|------|--------|
| `packages/match/src/match/duel/flow.ts` | `pickReceiver`: add finishing bonus in shooting zone; `situationWeights`/`flowTick`: finishing modifier on shot weight |
| `packages/match/src/match/scale-calibration.test.ts` | New anti-siphoning scenario |

## Things to be careful about

- **Temperature sensitivity**: the softmax temperature is T=0.3. The finishing bonus
  must be in the same ballpark as position score differences (~0.1–0.3) to have
  effect without overriding position entirely.
- **Don't break wide attackers**: crosses come from wide positions (x < 0.15 or
  x > 0.85). Make sure the finishing bonus doesn't pull wide balls inward.
- **Keeper position**: `pickReceiver` already filters out the GK via `outfieldIds`.
  No change needed there.
- **Test for regression**: run the full flow.test.ts suite after the change — the
  softmax shift may alter which player picks up a ball in existing deterministic tests.
