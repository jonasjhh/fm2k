# TASK 22 — Role-override repositioning (all bands)

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verification = `mise exec -- pnpm check` repo-wide once. **Touches formation geometry → moves the sim; TASK_07 recalibration must follow.**

## What this is

A role override (`setSlotRoleOverride`) currently only **relabels** the slot and sets its zone-weighting flank (`deriveCustomFieldedPositions` reads `ROLE_CANONICAL_LATERAL[override]` for FLANK weighting only) — it does **not** move the slot's anchor. So switching a slot CB→LB in a back-three is not a visible lateral shift; the player stays where canonical geometry placed them. The user wants an override to nudge the player toward the role's natural width, consistently **for all bands** (defence, midfield, attack).

Surfaced during TASK_21 planning: TASK_21 fixed the **preset** (canonical) geometry only, deliberately leaving `ROLE_CANONICAL_LATERAL` and override anchoring untouched.

## The change

Make a role override reposition the slot's anchor to the override role's width, reusing TASK_21's primitives:
- `isWideRole(role)` + `WIDE_EDGE_LATERAL` / `CENTRAL_EDGE_LATERAL` — a flank override pulls toward ±0.6, a central override toward the tucked band.
- Apply uniformly across DEF / midfield / ATT bands (not just the back line).
- Revisit `ROLE_CANONICAL_LATERAL` (currently ±1 extremes) so override-driven laterals share the same "nothing on the touchline" span as the canonical presets — a CB→LB switch should read as a **small** lateral shift toward the touchline band, not a jump to x≈0.

Keep it derived (no per-formation hand-authoring). The override must still preserve `deriveRolesForShape`'s index/count labelling where the shape is later re-derived.

## Success criteria

- Overriding a back-three slot CB→LB produces a **visible but small** lateral shift toward the wide band (unit test on the geometry deriver with an override).
- Same behaviour for a midfield slot (e.g. CM→LM) and an attack slot (e.g. ST→LW).
- No regression when no override is set (canonical TASK_21 geometry unchanged).
- **Recalibration (TASK_07)**: moves live positions when overrides are used → re-verify and re-lock gates.
- `mise exec -- pnpm check` green.

## Relationships

- **Follow-up to TASK_21** (which added `isWideRole` + the edge constants and fixed preset geometry).
- Do after TASK_21, before TASK_07 so the geometry change is folded into the same recalibration pass.
