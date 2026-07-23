# TASK 21 — Role-aware canonical width (nothing on the touchline) — ✅ DONE 2026-07-23

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. **Touches formation geometry → moves the sim; TASK_07 recalibration must follow.**

## What this was

Lateral position was assigned purely by **slot order within the band**, evenly spaced across the full width to ±1, ignoring the role — see `canonicalGeometry` ([lineup.ts](packages/match/src/lineup/lineup.ts)). So **every** band's outermost players sat on the touchline (x=0/1): a back-three `['CB','CB','CB']` spread to x=0/0.5/1.0, a double pivot `['DM','DM']` to x=0/1, a front two to x=0/1. Nobody should be on the line, and a wide role (fullback/winger) should sit a touch wider than a central role that happens to be on the edge (a back-three's outer CBs).

## What shipped

Width is now **role-aware**: still evenly spaced, but scaled to a span whose half-width depends on the **edge role** of the row:
- `WIDE_EDGE_LATERAL = 0.6` (x-inset 0.2) when the row's outermost slot is a **flank** role (`LB, RB, LM, RM, LW, RW`).
- `CENTRAL_EDGE_LATERAL = 0.5` (x-inset 0.25) otherwise (`CB, DM, CM, AM, ST` on the edge).
- `isWideRole(role)` = role ∈ {LB, RB, LM, RM, LW, RW}. A lone slot (n=1) stays centred at 0.

The change (one function, `canonicalGeometry`):
```ts
const edge = isWideRole(row[0] as FormationPosition) ? WIDE_EDGE_LATERAL : CENTRAL_EDGE_LATERAL;
const even = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2); // ±1
out.push({ band, lateral: edge * even });                     // ±edge
```
`row[0]` (leftmost) sets the span; every predefined formation's row is left/right symmetric, so either end gives the same class. `isWideRole`, `WIDE_EDGE_LATERAL`, `CENTRAL_EDGE_LATERAL` exported for tests/tuning.

Resulting x (= (lateral+1)/2):
- **4-back** `LB,CB,CB,RB` → **0.2, 0.4, 0.6, 0.8**.
- **3-back** `CB,CB,CB` → **0.25, 0.5, 0.75** (compact trio).
- **3-5-2 front two** / double pivots → tucked ±0.5, off the touchline.

`deriveRolesForShape` is unaffected: it sorts a band by lateral and labels by **index/count**, not magnitude — scaling a whole row by a positive `edge` preserves order and counts, so every formation's derived labels stay identical (the "reproduces every formation's slot labels" test stays green). `ROLE_CANONICAL_LATERAL` (LB −1, CB 0, RB +1) left **unchanged** here — override repositioning is TASK_22.

## Tests

`lineup.test.ts`: canonical-lateral assertions updated to the new spans (DEF `[-0.6,-0.2,0.2,0.6]`, ATT `[-0.5,0.5]`, 3-5-2 DEF `[-0.5,0,0.5]`, rounded to absorb FP); new `isWideRole` truth table + flank-vs-central span test; `slotGeometryFromFormation`/`seedShapes` slot-1 → `-0.6`. `club-manager.test.ts`: three canonical `-1` → `-0.6`.

Two calibration gates eased by the position move (TASK_07 re-locks them against the harness): `simulate.test.ts` strong-side wins `45→40`/60; `scale-calibration.test.ts` out-shoot ratio `1.7→1.6`.

## Result

`mise exec -- pnpm check` green. **TASK_07 must still follow** to re-lock gap/shot/foul gates on the moved geometry.

## Relationships

- Follow-up to **TASK_19** (surfaced during its implementation).
- Spun off **TASK_22** (role-override repositioning, all bands — reuses `isWideRole` + edge constants).
- Do before **TASK_07** so the geometry change is part of the same recalibration pass.
