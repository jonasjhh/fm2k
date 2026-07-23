# TASK 22 — Role-aware band positions (wide/central distributor) — ✅ DONE 2026-07-23

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. **Touches formation geometry → moves the sim; TASK_07 recalibration must follow.**

## What this was

TASK_21 fixed the edge-detection: the span of a band was set by whether its outermost slot was a flank role. But **within** the band, all slots were still spaced uniformly regardless of their own role. Consequences:
- A 4-mid `LM,CM,CM,RM` happened to work because it's symmetric — edge detection gave the right span and even spacing produced correct positions.
- An asymmetric band like `LM,CM` (a 3-CM row where one is overridden to LM) had no correct behaviour — the geometry function didn't know how to mix wide and central edges independently.
- `ROLE_CANONICAL_LATERAL` (±1 extremes) was used for override flank-weighting but inconsistent with the actual ±0.6/0.5 presets.

## What shipped

**Core change: `positionsFromBands(bands)`** — a new public pure function that takes explicit per-band role arrays and returns `PlayerGeometry[]`. Formation-agnostic, no slot indices, no override knowledge:

```
Left edge  = −WIDE_EDGE_LATERAL  if leftmost role  ∈ {LB,LM,LW}, else −CENTRAL_EDGE_LATERAL
Right edge = +WIDE_EDGE_LATERAL  if rightmost role ∈ {RB,RM,RW}, else +CENTRAL_EDGE_LATERAL
All slots evenly spaced between left and right edges.
```

Results for common bands:
- `LB,CB,CB,RB` → −0.6, −0.2, +0.2, +0.6
- `CB,CB,CB`    → −0.5,  0,   +0.5
- `LM,CM,CM,RM` → −0.6, −0.2, +0.2, +0.6
- `DM,DM`       → −0.5, +0.5
- `LM,CM`       → −0.6, +0.5  (CM shifts right, not wide)
- `ST` (lone)   → 0

**Override pattern**: caller patches the band's role array before calling `positionsFromBands`. The positioning function has no notion of overrides, slot indices, or formation names — it just places whatever roles it's given. `seedShapesFromFormation` stays simple (no overrides param); override geometry is a one-liner for callers: `positionsFromBands(patchedBands)`.

**`canonicalGeometry`** now delegates to `positionsFromBands` (via `FORMATION_LINES`). Same public contract, cleaner implementation.

**`lateralsForBand`** is internal — does the actual left/right edge detection and even spacing per band. Not exported.

## Tests

`positionsFromBands` test suite: GK skip, lone-slot centering, symmetric all-wide/all-central, 4-mid/5-mid/3-with-flanks even distribution, asymmetric `LM+CM` / `CM+RM`, band-label derivation from first role, and the override pattern (caller patches band → slots reposition).

## Relationships

- **Follow-up to TASK_21** (which set the edge constants and exported `isWideRole`).
- **TASK_23** (new) covers the formation editor UI — letting the user see and toggle wide/central per slot in the tactics screen.
- **TASK_07 must still follow** to re-lock calibration gates.
