import { remapRenamedWings } from './renamed-wing-migration.ts';
import { createEmptyFacilities, FACILITY_CATALOGUE, type ClubState } from '@fm2k/engine';

function stateWith(academyWings: Record<string, unknown>): ClubState {
  const facilities = createEmptyFacilities();
  facilities.academy.wings = academyWings as typeof facilities.academy.wings;
  return { facilities } as ClubState;
}

const built = { mothballed: false, forcedMothball: false, mode: 'full_staff', staffTier: 1 };

describe('remapRenamedWings:', () => {
  it('moves a retired wing id onto its replacement, keeping the instance intact', () => {
    // builtWings iterates the catalogue, so a wing left under a retired id is silently ignored —
    // which would delete a building the player paid millions for.
    const cs = remapRenamedWings(stateWith({ goalkeepingAcademyHub: { ...built, staffTier: 3 } }));
    expect(cs.facilities.academy.wings.goalkeepingAcademyHub).toBeUndefined();
    expect(cs.facilities.academy.wings.academyPartnership).toEqual({ ...built, staffTier: 3 });
  });

  it('remaps every retired id onto a wing the current catalogue actually knows', () => {
    const cs = remapRenamedWings(stateWith({
      goalkeepingAcademyHub: { ...built }, defensiveAcademyHub: { ...built },
    }));
    for (const id of Object.keys(cs.facilities.academy.wings)) {
      expect(FACILITY_CATALOGUE.academy[id]).toBeDefined();
    }
    expect(Object.keys(cs.facilities.academy.wings)).toHaveLength(2);
  });

  it('prefers an existing new-id wing over the stale one, and drops the stale key either way', () => {
    const cs = remapRenamedWings(stateWith({
      goalkeepingAcademyHub: { ...built, staffTier: 1 },
      academyPartnership: { ...built, staffTier: 3 },
    }));
    expect(cs.facilities.academy.wings.academyPartnership).toEqual({ ...built, staffTier: 3 });
    expect(cs.facilities.academy.wings.goalkeepingAcademyHub).toBeUndefined();
  });

  it('returns a save with no retired ids untouched', () => {
    const cs = stateWith({ homeNationsHub: { ...built } });
    expect(remapRenamedWings(cs)).toBe(cs);
  });
});
