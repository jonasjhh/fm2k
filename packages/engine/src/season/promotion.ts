export interface LadderDivision {
  readonly id: string;
  /** Final standings order, best (champion) first. */
  readonly rankedTeamIds: readonly string[];
}

/**
 * Compute promotion/relegation movements for a division ladder ordered top→bottom.
 * At each adjacent boundary the bottom `swapCount` teams of the upper division swap
 * places with the top `swapCount` teams of the lower division — a symmetric swap that
 * keeps every division the same size.
 *
 * Returns a `teamId → newDivisionId` map containing only the teams that move.
 */
export function computeLadderMovements(
  ladder: readonly LadderDivision[],
  swapCount: number,
): Map<string, string> {
  const moves = new Map<string, string>();
  if (swapCount <= 0) { return moves; }

  for (let i = 0; i < ladder.length - 1; i++) {
    const upper = ladder[i];
    const lower = ladder[i + 1];

    // Bottom `swapCount` of the upper division go down.
    for (const id of upper.rankedTeamIds.slice(upper.rankedTeamIds.length - swapCount)) {
      moves.set(id, lower.id);
    }
    // Top `swapCount` of the lower division go up.
    for (const id of lower.rankedTeamIds.slice(0, swapCount)) {
      moves.set(id, upper.id);
    }
  }

  return moves;
}
