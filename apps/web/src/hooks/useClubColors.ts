import { useMemo } from 'react';
import { useGameStore, findTeamById } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { getContrastColor } from '../utils/colors';

export interface ClubColors {
  primary: string;
  secondary: string;
  /** Readable text colour (black/white) for content sitting on `primary`. */
  contrast: string;
}

const DEFAULT_COLORS = { primary: '#1B5E20', secondary: '#FFFFFF' };

/**
 * The managing club's colours, with a sensible default when no club is active.
 * Single source of truth for styling UI in the player's club colours.
 */
export function useClubColors(): ClubColors {
  const { playerTeamId, editableCountries } = useGameStore(useShallow((s) => ({
    playerTeamId: s.playerTeamId,
    editableCountries: s.editableCountries,
  })));

  return useMemo(() => {
    const colors = (playerTeamId ? findTeamById(editableCountries, playerTeamId)?.colors : null) ?? DEFAULT_COLORS;
    return { ...colors, contrast: getContrastColor(colors.primary) };
  }, [playerTeamId, editableCountries]);
}
