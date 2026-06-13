import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Player } from '@fm2k/engine';

/** Short display name: "John Smith" → "J. Smith". */
function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0];
}

/** Football pitch visual: formation lines back-to-front with player circles per slot. */
export function FormationGrid({
  lines, slotAssignments, squad, teamColors, compact = false,
}: {
  lines: string[][];
  slotAssignments: (string | null)[];
  squad: Player[];
  teamColors: { primary: string; secondary: string };
  compact?: boolean;
}) {
  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    squad.forEach(p => m.set(p.id, p));
    return m;
  }, [squad]);

  const reversedLines = [...lines].reverse();

  const sz = compact
    ? { minHeight: 300, pad: 1.25, circle: 38, slotW: 56, posFont: 11, nameFont: 10 }
    : { minHeight: 460, pad: 2, circle: 46, slotW: 72, posFont: 13, nameFont: 11 };

  return (
    <Box sx={{
      background: 'linear-gradient(180deg, #2d6a2d 0%, #1e4d1e 100%)',
      borderRadius: 2,
      p: sz.pad,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-evenly',
      border: '2px solid',
      borderColor: 'success.dark',
      minHeight: sz.minHeight,
    }}>
      {reversedLines.map((line, li) => {
        const origLineIdx = lines.length - 1 - li;
        const offset = lines.slice(0, origLineIdx).reduce((n, l) => n + l.length, 0);
        return (
          <Box key={li} sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
            {line.map((pos, si) => {
              const idx = offset + si;
              const playerId = slotAssignments[idx] ?? null;
              const player = playerId ? playerById.get(playerId) ?? null : null;
              return (
                <Box key={`${pos}-${si}`} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW }}>
                  <Box sx={{
                    width: sz.circle, height: sz.circle, borderRadius: '50%',
                    bgcolor: player ? teamColors.primary : 'rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid',
                    borderColor: player ? teamColors.secondary : 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                  }}>
                    <Typography sx={{ fontSize: sz.posFont, fontWeight: 800, color: teamColors.secondary, lineHeight: 1, textAlign: 'center' }}>
                      {pos}
                    </Typography>
                  </Box>
                  <Typography sx={{
                    fontSize: sz.nameFont, color: 'rgba(255,255,255,0.9)', textAlign: 'center',
                    lineHeight: 1, fontWeight: 600,
                    width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {player ? shortName(player.name) : ''}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

export default FormationGrid;
