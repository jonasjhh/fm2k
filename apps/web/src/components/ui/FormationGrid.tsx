import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Player, FormationPosition, PlayerAttributes, PlayerGeometry, Band } from '@fm2k/engine';
import { positionAttributeImportance, BAND_ORDER, BAND_OF_ROLE, effectiveRole } from '@fm2k/engine';
import { ATTR_LABELS } from '../../lib/attribute-labels';

/** Short display name: "John Smith" → "J. Smith". */
function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0];
}

/** The position's top 3 attributes by importance, as a short tooltip line. */
function keyAttributesTooltip(pos: string): string {
  const importance = positionAttributeImportance(pos as FormationPosition);
  const top = Object.entries(importance)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([key]) => ATTR_LABELS[key as keyof PlayerAttributes]);
  return `${pos} — key attributes: ${top.join(', ')}`;
}

/** Football pitch visual: always the same 5 fixed band rows (attack-to-defense, BAND_ORDER)
 *  plus a GK row, mirroring TacticsPitch's layout — so every formation gets identical,
 *  predictable proportions regardless of how many of its own template rows use DM/AM, instead
 *  of squeezing a variable row count into the same height. Read-only counterpart to
 *  TacticsPitch: same band model and the same customSlots-aware role label, no drag/role-edit. */
export function FormationGrid({
  lines, slotAssignments, squad, teamColors, customSlots = null, emptySlotRoles = null, compact = false, onPlayerClick,
}: {
  lines: string[][];
  slotAssignments: (string | null)[];
  squad: Player[];
  teamColors: { primary: string; secondary: string };
  customSlots?: Record<string, PlayerGeometry> | null;
  emptySlotRoles?: Partial<Record<number, PlayerGeometry>> | null;
  compact?: boolean;
  onPlayerClick?: (playerId: string) => void;
}) {
  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    squad.forEach(p => m.set(p.id, p));
    return m;
  }, [squad]);

  const flat = useMemo(() => lines.flat(), [lines]);

  const byBand = useMemo(() => {
    const out: Record<Exclude<Band, 'GK'>, { idx: number; pos: FormationPosition }[]> = {
      DEF: [], DM: [], MID: [], AM: [], ATT: [],
    };
    flat.forEach((templatePos, i) => {
      if (i === 0) { return; } // slot 0 is always GK, rendered separately below
      const band = BAND_OF_ROLE[templatePos as FormationPosition];
      if (band === 'GK') { return; }
      out[band].push({ idx: i, pos: templatePos as FormationPosition });
    });
    return out;
  }, [flat]);

  const sz = compact
    ? { minHeight: 300, pad: 1.25, circle: 38, slotW: 56, posFont: 11, nameFont: 10 }
    : { minHeight: 460, pad: 2, circle: 46, slotW: 72, posFont: 13, nameFont: 11 };

  function renderSlot(idx: number, templatePos: FormationPosition) {
    const playerId = slotAssignments[idx] ?? null;
    const player = playerId ? playerById.get(playerId) ?? null : null;
    const pos = effectiveRole(playerId, templatePos, customSlots, emptySlotRoles?.[idx]?.role);
    return (
      <Box
        key={idx}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW }}
        {...(player && onPlayerClick ? {
          role: 'button',
          tabIndex: 0,
          onClick: () => onPlayerClick(player.id),
          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { onPlayerClick(player.id); } },
        } : {})}
        style={player && onPlayerClick ? { cursor: 'pointer' } : undefined}
      >
        <Tooltip title={keyAttributesTooltip(pos)} arrow>
          <Box sx={{
            width: sz.circle, height: sz.circle, borderRadius: '50%',
            bgcolor: player ? teamColors.primary : 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid',
            borderColor: player ? teamColors.secondary : 'rgba(255,255,255,0.3)',
            flexShrink: 0,
            transition: player && onPlayerClick ? 'transform 0.1s' : undefined,
            '&:hover': player && onPlayerClick ? { transform: 'scale(1.08)' } : undefined,
          }}>
            <Typography sx={{ fontSize: sz.posFont, fontWeight: 800, color: teamColors.secondary, lineHeight: 1, textAlign: 'center' }}>
              {pos}
            </Typography>
          </Box>
        </Tooltip>
        <Typography sx={{
          fontSize: sz.nameFont, color: 'rgba(255,255,255,0.9)', textAlign: 'center',
          lineHeight: 1, fontWeight: 600,
          width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {player ? shortName(player.name) : ''}
        </Typography>
      </Box>
    );
  }

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
      {BAND_ORDER.map(band => (
        <Box key={band} sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
          {byBand[band].map(({ idx, pos }) => renderSlot(idx, pos))}
        </Box>
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
        {flat[0] && renderSlot(0, flat[0] as FormationPosition)}
      </Box>
    </Box>
  );
}

export default FormationGrid;
