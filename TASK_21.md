# TASK 21 — Role-aware back-line width (CBs tuck, wing-backs stretch)

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. **Touches formation geometry → moves the sim; TASK_07 recalibration must follow.**

## What this is

Back-line lateral position is assigned purely by **slot order within the band**, evenly spaced across the full width, ignoring the role — see `canonicalGeometry` ([lineup.ts](packages/match/src/lineup/lineup.ts)):

```ts
const lateral = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2); // -1 … +1, even
```

Consequences:
- A back-three (`FORMATION_LINES['3-5-2'] = [['GK'],['CB','CB','CB'], …]`) spreads its three centre-backs to **x = 0, 0.5, 1.0** — the outer CBs sit exactly at the touchline, as wide as fullbacks. In reality a back-three is **compact/narrow**; width is provided by the wing-backs.
- There is **no lateral difference** between fielding `LB-CB-RB` and `CB-CB-CB` — both get identical geometry. A centre-back and a fullback in the same slot occupy the same x; the role label only nudges `positionLoad` slightly.

The TASK_19 fatigue model works despite this (a 3-5-2's wing-backs, `LM`/`RM` in the 5-man midfield, correctly carry the widest slot + biggest vertical range → tire most), but the back-line **shape** is unrealistic: three CBs strung across the full width instead of a tucked trio.

## The change

Make lateral geometry **role-aware**, so a defender's natural width depends on the role, not just the slot index:
- Centre-backs tuck toward the middle (a back-three occupies a narrower central band, not touchline-to-touchline).
- Fullbacks/wing-backs sit wide.
- Keep it derived (no per-formation hand-authoring drift) — e.g. blend the even-spacing with each role's `ROLE_CANONICAL_LATERAL` (already defined: `LB -1, CB 0, RB +1`, etc.), or clamp CB spread.

This makes the back-three genuinely compact and pushes the width onto the wing-backs, sharpening the emergent picture from TASK_19 (wing-backs run the most; the compact CB trio covers the middle and relies on the wing-backs for width).

## Success criteria

- A back-three's CBs sit in a **narrower** central band than the back-four's full spread (unit test on `canonicalGeometry` / the geometry deriver: outer CB of a 3-back is not at x≈0/1).
- Fullbacks/wing-backs remain wide.
- No regression in 4-back shapes (LB/RB still wide, CBs central — the common case should be ≈ unchanged).
- **Recalibration (TASK_07)**: this moves live positions → duels, so re-verify goals/shots/possession and re-lock gates.
- `mise exec -- pnpm check` green.

## Relationships

- **Follow-up to TASK_19** (surfaced during its implementation): TASK_19 added the ball-side cover shift + distance-linked fatigue, which operate on whatever geometry exists. This task fixes the geometry those mechanics sit on.
- Do before/with TASK_07 so the geometry change is part of the same recalibration pass.
