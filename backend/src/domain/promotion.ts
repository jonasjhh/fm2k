import { computeLadderMovements, type LadderDivision } from '@fm2k/engine';
import type { Team } from '@fm2k/engine';
import type { EditableCountry } from './editable-country.ts';

/** Teams swapped at each adjacent-division boundary (bottom-N ⇄ top-N). */
const PROMOTION_RELEGATION_SWAP = 2;

/**
 * Apply end-of-season promotion/relegation to each country's division ladder.
 *
 * For a country to roll over, every one of its divisions must have final standings in
 * `rankedTeamIdsByDivision` (i.e. it was simulated this season). The bottom
 * `PROMOTION_RELEGATION_SWAP` teams of each division swap places with the top
 * `PROMOTION_RELEGATION_SWAP` teams of the division below it. Countries lacking
 * standings are returned unchanged.
 */
export function applyPromotionRelegation(
  countries: EditableCountry[],
  rankedTeamIdsByDivision: Record<string, string[]>,
): EditableCountry[] {
  return countries.map(country => {
    const ordered = [...country.divisions].sort((a, b) => a.level - b.level);
    if (!ordered.every(d => rankedTeamIdsByDivision[d.id])) { return country; }

    const ladder: LadderDivision[] = ordered.map(d => ({
      id: d.id,
      rankedTeamIds: rankedTeamIdsByDivision[d.id],
    }));
    const moves = computeLadderMovements(ladder, PROMOTION_RELEGATION_SWAP);
    if (moves.size === 0) { return country; }

    const teamById = new Map<string, Team>(
      country.divisions.flatMap(d => d.teams).map(t => [t.id, t]),
    );

    return {
      ...country,
      divisions: country.divisions.map(d => {
        const staying = d.teams.filter(t => (moves.get(t.id) ?? d.id) === d.id);
        const arriving = [...moves]
          .filter(([, newDivId]) => newDivId === d.id)
          .map(([teamId]) => teamById.get(teamId))
          .filter((t): t is Team => t !== undefined);
        return { ...d, teams: [...staying, ...arriving] };
      }),
    };
  });
}
