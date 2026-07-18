import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type {
  Player, PlayerAttributes, FormationPosition, Formation, PlayerGeometry, TeamShapes, Band,
} from '@fm2k/engine';
import {
  positionAttributeImportance, seedShapesFromFormation, canonicalGeometry,
  deriveRolesForShape, BAND_ORDER, emptySlotKey,
} from '@fm2k/engine';
import { ATTR_LABELS } from '../../lib/attribute-labels';

// BAND_ORDER (imported above) is attack-to-defense; this component renders bands top (attack)
// to bottom (defense) — mirrors how FormationGrid stacks its rows. GK has no band of its own
// here; it's rendered as a fixed row below DEF.

function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0];
}

function keyAttributesTooltip(pos: string): string {
  const importance = positionAttributeImportance(pos as FormationPosition);
  const top = Object.entries(importance)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([key]) => ATTR_LABELS[key as keyof PlayerAttributes]);
  return `${pos} — key attributes: ${top.join(', ')}`;
}

interface DragState {
  playerId: string;
  x: number;
  y: number;
}

type BandMember =
  | { kind: 'player'; id: string; geometry: PlayerGeometry }
  | { kind: 'empty'; slotIndex: number; geometry: PlayerGeometry };

const BAND_ROW_INDEX: Record<Exclude<Band, 'GK'>, number> = { ATT: 0, AM: 1, MID: 2, DM: 3, DEF: 4 };

/** The editable counterpart to FormationGrid: a dual-shape anchor editor. The manager picks
 *  Defending or Attacking and drags each outfielder to any band/lateral anchor in that shape;
 *  role labels are derived from the geometry, never chosen. A small ↑/↓ marker on a circle
 *  means the player sits in a different band in the other shape (the FM-style "arrow").
 *  The GK is always fixed, never draggable. Unfilled starter slots render as dimmed,
 *  non-interactive placeholders at their canonical template position. */
export function TacticsPitch({
  formation, startingXI, shapes, squad, teamColors, onPlayerMove,
}: {
  formation: Formation;
  startingXI: (string | null)[];
  shapes: TeamShapes | null;
  squad: Player[];
  teamColors: { primary: string; secondary: string };
  onPlayerMove: (shape: keyof TeamShapes, playerId: string, geometry: PlayerGeometry) => void;
}) {
  const [activeShape, setActiveShape] = useState<keyof TeamShapes>('defending');

  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    squad.forEach(p => m.set(p.id, p));
    return m;
  }, [squad]);

  const effectiveShapes = useMemo(
    () => shapes ?? seedShapesFromFormation(formation, startingXI),
    [shapes, formation, startingXI],
  );
  const geometry = effectiveShapes[activeShape];
  const otherGeometry = effectiveShapes[activeShape === 'defending' ? 'attacking' : 'defending'];

  const derivedRoles = useMemo(() => deriveRolesForShape(geometry), [geometry]);

  const byBand = useMemo(() => {
    const out: Record<Exclude<Band, 'GK'>, BandMember[]> = {
      DEF: [], DM: [], MID: [], AM: [], ATT: [],
    };
    for (const [id, g] of Object.entries(geometry)) { out[g.band].push({ kind: 'player', id, geometry: g }); }
    const canon = canonicalGeometry(formation);
    startingXI.forEach((id, i) => {
      if (id || i === 0) { return; } // filled, or the GK slot (handled separately below)
      const canonicalSlot = canon[i - 1];
      if (!canonicalSlot) { return; }
      out[canonicalSlot.band].push({ kind: 'empty', slotIndex: i, geometry: canonicalSlot });
    });
    for (const band of BAND_ORDER) { out[band].sort((a, b) => a.geometry.lateral - b.geometry.lateral); }
    return out;
  }, [geometry, startingXI, formation]);

  const gkId = startingXI[0] ?? null;
  const gk = gkId ? playerById.get(gkId) ?? null : null;

  const rowRefs = useRef<Record<Exclude<Band, 'GK'>, HTMLDivElement | null>>({
    DEF: null, DM: null, MID: null, AM: null, ATT: null,
  });

  const [drag, setDrag] = useState<DragState | null>(null);

  function onPointerDown(e: React.PointerEvent, playerId: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ playerId, x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) { return; }
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) { return; }
    for (const band of BAND_ORDER) {
      const el = rowRefs.current[band];
      if (!el) { continue; }
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const lateral = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
        onPlayerMove(activeShape, drag.playerId, { band, lateral });
        break;
      }
    }
    setDrag(null);
  }

  const sz = { circle: 46, slotW: 72, posFont: 13, nameFont: 11 };

  function renderCircle(role: string, dimmed: boolean, handlers?: {
    onPointerDown: (e: React.PointerEvent) => void;
  }) {
    return (
      <Tooltip title={dimmed ? '' : keyAttributesTooltip(role)} arrow>
        <Box
          onPointerDown={handlers?.onPointerDown}
          onPointerMove={handlers ? onPointerMove : undefined}
          onPointerUp={handlers ? onPointerUp : undefined}
          sx={{
            width: sz.circle, height: sz.circle, borderRadius: '50%',
            bgcolor: dimmed ? 'rgba(255,255,255,0.12)' : teamColors.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: dimmed ? '2px dashed' : '2px solid',
            borderColor: dimmed ? 'rgba(255,255,255,0.4)' : teamColors.secondary,
            cursor: handlers ? 'grab' : 'default', touchAction: 'none', userSelect: 'none',
            flexShrink: 0, position: 'relative',
            transition: 'transform 0.15s ease',
            '&:hover': handlers ? { transform: 'scale(1.08)' } : undefined,
          }}
        >
          <Typography sx={{
            fontSize: sz.posFont, fontWeight: 800, lineHeight: 1, textAlign: 'center',
            color: dimmed ? 'rgba(255,255,255,0.7)' : teamColors.secondary,
          }}>
            {role}
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  function renderMember(member: BandMember) {
    if (member.kind === 'empty') {
      return (
        <Box key={emptySlotKey(member.slotIndex)} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW }}>
          {renderCircle(derivedRolesForEmpty(member), true)}
          <Typography sx={{ fontSize: sz.nameFont, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1, fontStyle: 'italic' }}>
            Unassigned
          </Typography>
        </Box>
      );
    }

    const player = playerById.get(member.id);
    if (!player) { return null; }
    const role = derivedRoles[member.id] ?? player.position;
    const isDragging = drag?.playerId === member.id;

    // FM-style arrow hint: this player anchors in a different band in the other shape.
    const otherBand = otherGeometry[member.id]?.band;
    const bandDelta = otherBand !== undefined && otherBand !== member.geometry.band
      ? BAND_ROW_INDEX[member.geometry.band] - BAND_ROW_INDEX[otherBand]
      : 0;

    return (
      <Box
        key={member.id}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative' }}
      >
        <Box sx={{ opacity: isDragging ? 0.35 : 1, position: 'relative' }}>
          {renderCircle(role, false, { onPointerDown: (e) => onPointerDown(e, member.id) })}
          {bandDelta !== 0 && (
            <Typography sx={{
              position: 'absolute', top: -4, right: -6, fontSize: 12, fontWeight: 900,
              lineHeight: 1, color: 'rgba(255,255,255,0.85)', pointerEvents: 'none',
              textShadow: '0 0 3px rgba(0,0,0,0.8)',
            }}>
              {/* In the other shape this player sits higher (↑) or deeper (↓) on the pitch. */}
              {bandDelta > 0 ? '↑' : '↓'}
            </Typography>
          )}
        </Box>
        <Typography sx={{
          fontSize: sz.nameFont, color: 'rgba(255,255,255,0.9)', textAlign: 'center',
          lineHeight: 1, fontWeight: 600, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shortName(player.name)}
        </Typography>
      </Box>
    );
  }

  /** Empty slots have no player to derive from — label them by their canonical band alone. */
  function derivedRolesForEmpty(member: Extract<BandMember, { kind: 'empty' }>): string {
    return member.geometry.band;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <ButtonGroup size="small">
          <Button
            variant={activeShape === 'defending' ? 'contained' : 'outlined'}
            onClick={() => setActiveShape('defending')}
            sx={{ px: 2, fontSize: 12, fontWeight: 700 }}
          >
            Defending
          </Button>
          <Button
            variant={activeShape === 'attacking' ? 'contained' : 'outlined'}
            onClick={() => setActiveShape('attacking')}
            sx={{ px: 2, fontSize: 12, fontWeight: 700 }}
          >
            Attacking
          </Button>
        </ButtonGroup>
      </Box>

      <Box sx={{
        background: 'linear-gradient(180deg, #2d6a2d 0%, #1e4d1e 100%)',
        borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column',
        justifyContent: 'space-evenly', border: '2px solid', borderColor: 'success.dark',
        minHeight: 460, position: 'relative',
      }}>
        {BAND_ORDER.map(band => (
          <Box
            key={band}
            ref={(el: HTMLDivElement | null) => { rowRefs.current[band] = el; }}
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, minHeight: sz.circle + 24 }}
          >
            {byBand[band].map(member => renderMember(member))}
          </Box>
        ))}

        {/* GK is fixed — never draggable, even when unfilled. */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW }}>
            <Box sx={{
              width: sz.circle, height: sz.circle, borderRadius: '50%',
              bgcolor: gk ? teamColors.primary : 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: gk ? '2px solid' : '2px dashed',
              borderColor: gk ? teamColors.secondary : 'rgba(255,255,255,0.4)', flexShrink: 0,
            }}>
              <Typography sx={{ fontSize: sz.posFont, fontWeight: 800, color: gk ? teamColors.secondary : 'rgba(255,255,255,0.7)', lineHeight: 1 }}>
                GK
              </Typography>
            </Box>
            <Typography sx={{
              fontSize: sz.nameFont, textAlign: 'center', lineHeight: 1, fontWeight: gk ? 600 : 400,
              color: gk ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
              fontStyle: gk ? 'normal' : 'italic',
            }}>
              {gk ? shortName(gk.name) : 'Unassigned'}
            </Typography>
          </Box>
        </Box>

        {/* Floating copy of the dragged circle, following the pointer. */}
        {drag && (() => {
          const player = playerById.get(drag.playerId);
          if (!player) { return null; }
          const role = derivedRoles[drag.playerId] ?? player.position;
          return (
            <Box sx={{
              position: 'fixed', left: drag.x, top: drag.y, transform: 'translate(-50%, -50%)',
              width: sz.circle, height: sz.circle, borderRadius: '50%', bgcolor: teamColors.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid', borderColor: teamColors.secondary,
              pointerEvents: 'none', zIndex: 1300, boxShadow: 3,
            }}>
              <Typography sx={{ fontSize: sz.posFont, fontWeight: 800, color: teamColors.secondary, lineHeight: 1 }}>
                {role}
              </Typography>
            </Box>
          );
        })()}
      </Box>
    </Box>
  );
}

export default TacticsPitch;
