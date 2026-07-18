import { useGameStore } from '@/store/game-store';
import { DIVISION_PAR, divisionLevel } from '../utils/attrColor';

/** Returns the attribute par value for the player's current division.
 *  Used to colour AttrBar relative to the standard at this level. */
export function useDivisionPar(): number {
  const divisionId = useGameStore((s) => s.clubState?.divisionId ?? '');
  const level = divisionId ? divisionLevel(divisionId) : 1;
  return DIVISION_PAR[level] ?? 60;
}
