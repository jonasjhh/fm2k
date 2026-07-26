import type { ClubState } from '@fm2k/engine';

/**
 * Remaps academy wings that were renamed when the academy stopped being position-scoped.
 *
 * `FacilityManager`'s `builtWings` iterates the *catalogue*, not the save, so a wing stored under
 * a retired id is silently ignored rather than crashing — which would quietly delete a building
 * the player paid millions for. Hence a real remap rather than a drop.
 *
 * - `goalkeepingAcademyHub` → `academyPartnership`: the goalkeeper-only hub became the one rung of
 *   the ladder that buys better scouting *method* instead of wider reach.
 * - `defensiveAcademyHub` → `regionalScoutingNetwork`: never actually did anything defensive — its
 *   effects were generic all along — so it became the domestic-reach rung it already behaved as.
 *
 * Both replacements sit at the same price and occupy the same slot in the ladder, so a club keeps
 * the value it paid for. Safe to delete once no pre-v17 saves remain in the wild.
 */
const RENAMED_ACADEMY_WINGS: Record<string, string> = {
  goalkeepingAcademyHub: 'academyPartnership',
  defensiveAcademyHub: 'regionalScoutingNetwork',
};

export function remapRenamedWings(cs: ClubState): ClubState {
  const wings = cs.facilities?.academy?.wings;
  if (!wings) { return cs; }
  const stale = Object.keys(RENAMED_ACADEMY_WINGS).filter(id => wings[id] !== undefined);
  if (stale.length === 0) { return cs; }

  const remapped = { ...wings };
  for (const oldId of stale) {
    const newId = RENAMED_ACADEMY_WINGS[oldId];
    // If the club somehow holds both, keep the one already under the new id — it is the one the
    // current catalogue has been charging upkeep for.
    remapped[newId] ??= remapped[oldId];
    delete remapped[oldId];
  }
  return {
    ...cs,
    facilities: { ...cs.facilities, academy: { ...cs.facilities.academy, wings: remapped } },
  };
}
