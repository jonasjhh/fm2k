# TASK 23 — Formation editor: wide/central slot configuration

> Separate from TASK_22 (positioning logic). This task is UI only.

## What this is

TASK_22 shipped `positionsFromBands` — a pure function that places slots based on the roles in each band. The override pattern is: caller patches the band's role array and calls `positionsFromBands`. This task makes that visible and interactive in the formation editor.

## What needs to happen

- Each slot in the tactics/formation editor should be configurable as wide or central within its band.
- Switching a slot wide (LB/LM/LW or RB/RM/RW) or central (CB/DM/CM/AM/ST) recalculates the whole band's positions via `positionsFromBands`.
- The change is visual immediately on the pitch grid.
- The user has other thoughts on the formation editor UI; this task is a placeholder until those are discussed and scoped.

## Prereqs

- TASK_22 (done — the positioning logic is in place).
- Discussion with user about the formation editor UX before implementing.
