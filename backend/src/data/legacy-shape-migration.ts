import type { ClubState } from '@fm2k/engine';

/**
 * TEMPORARY migration shim — safe to delete once no pre-slot-keyed saves remain in the wild.
 *
 * Before the slot-keyed formation-shape rework, `ClubState.shapes` and `roleOverrides` were
 * keyed by **player id**. Those keys are meaningless under the slot-keyed model, so rather
 * than a real migration we simply **drop** them on load: the affected club reverts to its
 * formation's default layout (no custom arrows / role pins). Everything else in the save is
 * untouched.
 *
 * Detection: slot-keyed maps have integer keys ("1".."10"); legacy maps have player-id keys
 * (non-integer). To remove this shim later, delete this file and its single call site in
 * `session.ts`.
 */
export function dropLegacyPlayerKeyedShapes(cs: ClubState): ClubState {
  const isLegacyKeyed = (rec: Record<string, unknown> | null | undefined): boolean =>
    !!rec && Object.keys(rec).some(k => !Number.isInteger(Number(k)));

  const shapesLegacy = !!cs.shapes && (isLegacyKeyed(cs.shapes.attacking) || isLegacyKeyed(cs.shapes.defending));
  const overridesLegacy = isLegacyKeyed(cs.roleOverrides);
  if (!shapesLegacy && !overridesLegacy) { return cs; }

  return {
    ...cs,
    shapes: shapesLegacy ? null : cs.shapes,
    roleOverrides: overridesLegacy ? {} : cs.roleOverrides,
  };
}
