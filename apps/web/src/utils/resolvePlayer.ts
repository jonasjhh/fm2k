import { findTeamById } from '@/store/game-store';
import { awayDisplayColors } from './colors';
import { FORMATION_LINES, deriveRolesForShape } from '@fm2k/engine';
import type { CompetitionFixture, ClubState } from '@fm2k/engine';
import type { EditableCountry } from '@/store/game-store';
import type { RatedPlayerInfo } from '../components/MatchStatsSheet';
import type { FormationPosition } from '@fm2k/engine';

export function buildResolvePlayer(
  focusFixture: CompetitionFixture | null,
  clubState: ClubState | null,
  editableCountries: EditableCountry[],
): (playerId: string) => RatedPlayerInfo | undefined {
  if (!focusFixture) { return () => undefined; }

  const homeTeam = findTeamById(editableCountries, focusFixture.homeTeamId);
  const awayTeam = findTeamById(editableCountries, focusFixture.awayTeamId);
  const awayColors = homeTeam && awayTeam
    ? awayDisplayColors(homeTeam.colors, awayTeam.colors)
    : awayTeam?.colors;

  const userIsAway = clubState?.clubId === focusFixture.awayTeamId;
  const userColors = userIsAway ? awayColors : homeTeam?.colors;

  const derivedRoles = clubState?.shapes ? deriveRolesForShape(clubState.shapes.defending) : null;

  return (playerId: string): RatedPlayerInfo | undefined => {
    const clubPlayer = clubState?.squad.find(p => p.id === playerId);
    if (clubState && clubPlayer) {
      const slotIdx = clubState.startingXI.indexOf(playerId);
      const templatePos = slotIdx >= 0 ? FORMATION_LINES[clubState.formation].flat()[slotIdx] : undefined;
      const position = derivedRoles?.[playerId]
        ?? (templatePos ? (templatePos as FormationPosition) : clubPlayer.position);
      return { name: clubPlayer.name, position, colors: userColors };
    }
    const homePlayer = homeTeam?.squad.find(p => p.id === playerId);
    if (homePlayer) { return { name: homePlayer.name, position: homePlayer.position, colors: homeTeam?.colors }; }
    const awayPlayer = awayTeam?.squad.find(p => p.id === playerId);
    if (awayPlayer) { return { name: awayPlayer.name, position: awayPlayer.position, colors: awayColors }; }
    return undefined;
  };
}
