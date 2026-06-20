import { computeLadderMovements, type LadderDivision } from '@fm2k/engine';
import { divisionsInCountry, moveTeamToDivision, type World } from './world.ts';
import { qualifierCompetitionId } from '../app/config.ts';

/** Teams swapped at each adjacent-division boundary (bottom-N ⇄ top-N). */
const PROMOTION_RELEGATION_SWAP = 2;

/** Outcome of a single promotion/relegation playoff at one division boundary. */
export interface QualifierResult {
  readonly winnerTeamId: string;
  /** The lower-division 3rd-place challenger (played at home). */
  readonly lowerTeamId: string;
  /** The upper-division 3rd-from-bottom defender. */
  readonly upperTeamId: string;
}

/**
 * Apply end-of-season promotion/relegation to each country's division ladder, in
 * place on `world.teamDivision` (squads/players are untouched — only which division
 * each team belongs to changes).
 *
 * For a country to roll over, every one of its divisions must have final standings in
 * `rankedTeamIdsByDivision` (i.e. it was simulated this season). The bottom
 * `PROMOTION_RELEGATION_SWAP` teams of each division swap places with the top
 * `PROMOTION_RELEGATION_SWAP` teams of the division below it. Countries lacking
 * standings are left unchanged.
 *
 * `qualifierResults` (keyed by `qualifierCompetitionId(upperDivisionId, lowerDivisionId)`)
 * additionally moves the challenger up (and the defender down) wherever the lower-division
 * team won its playoff — "winner gets promoted/keeps their spot": when the defender wins,
 * no extra move is needed since both sides are already in their default division.
 */
export function applyPromotionRelegation(
  world: World,
  rankedTeamIdsByDivision: Record<string, string[]>,
  qualifierResults: Record<string, QualifierResult> = {},
): void {
  for (const country of world.countries.values()) {
    const ordered = divisionsInCountry(world, country.id);
    if (!ordered.every(d => rankedTeamIdsByDivision[d.id])) { continue; }

    const ladder: LadderDivision[] = ordered.map(d => ({
      id: d.id,
      rankedTeamIds: rankedTeamIdsByDivision[d.id],
    }));
    const moves = computeLadderMovements(ladder, PROMOTION_RELEGATION_SWAP);

    for (let i = 0; i < ordered.length - 1; i++) {
      const upperDiv = ordered[i];
      const lowerDiv = ordered[i + 1];
      const result = qualifierResults[qualifierCompetitionId(upperDiv.id, lowerDiv.id)];
      if (result && result.winnerTeamId === result.lowerTeamId) {
        moves.set(result.lowerTeamId, upperDiv.id);
        moves.set(result.upperTeamId, lowerDiv.id);
      }
    }

    for (const [teamId, newDivisionId] of moves) {
      moveTeamToDivision(world, teamId, newDivisionId);
    }
  }
}
