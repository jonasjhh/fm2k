import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type {
  Player, PlayerAttributes, FormationPosition, Formation, PlayerGeometry, Band,
} from '@fm2k/engine';
import {
  positionAttributeImportance, seedGeometryFromFormation, canonicalGeometry,
  rankInBand, eligibleRoles, ROLE_OPTIONS_BY_BAND, BAND_ORDER, emptySlotKey,
} from '@fm2k/engine';
import { ATTR_LABELS } from '../../lib/attribute-labels';

// BAND_ORDER (imported above) is attack-to-defense; this component renders bands top (attack)
// to bottom (defense) — mirrors how FormationGrid stacks its rows. GK has no band of its own
// here; it's rendered as a fixed row below DEF.

/** Anything within this many px of the pointer-down position is a click, not a drag —
 *  lets a tap-to-expand-instructions gesture coexist with free dragging. */
const CLICK_THRESHOLD_PX = 6;

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
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

type BandMember =
  | { kind: 'player'; id: string; geometry: PlayerGeometry }
  | { kind: 'empty'; slotIndex: number; geometry: PlayerGeometry };

/** The editable counterpart to FormationGrid: lets the manager drag each outfielder to any
 *  band/lateral position (free positioning) and click a circle to swap its role instruction
 *  (e.g. LB <-> LWB) without moving it. The GK is always fixed, never draggable. Unfilled
 *  starter slots render as dimmed placeholders at their canonical template position — clicking
 *  one lets the manager pre-set a role that's inherited once a player is assigned there; it has
 *  no effect on its own. */
export function TacticsPitch({
  formation, startingXI, customSlots, emptySlotRoles, squad, teamColors, onPlayerMove, onPlayerRoleChange, onEmptySlotRoleChange,
}: {
  formation: Formation;
  startingXI: (string | null)[];
  customSlots: Record<string, PlayerGeometry> | null;
  emptySlotRoles: Partial<Record<number, PlayerGeometry>> | null;
  squad: Player[];
  teamColors: { primary: string; secondary: string };
  onPlayerMove: (playerId: string, geometry: { band: Exclude<Band, 'GK'>; lateral: number }) => void;
  onPlayerRoleChange: (playerId: string, role: FormationPosition) => void;
  onEmptySlotRoleChange: (slotIndex: number, role: FormationPosition) => void;
}) {
  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    squad.forEach(p => m.set(p.id, p));
    return m;
  }, [squad]);

  const geometry = useMemo(
    () => customSlots ?? seedGeometryFromFormation(formation, startingXI),
    [customSlots, formation, startingXI],
  );

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
      const geometry = emptySlotRoles?.[i] ?? canonicalSlot;
      out[geometry.band].push({ kind: 'empty', slotIndex: i, geometry });
    });
    for (const band of BAND_ORDER) { out[band].sort((a, b) => a.geometry.lateral - b.geometry.lateral); }
    return out;
  }, [geometry, startingXI, formation, emptySlotRoles]);

  const gkId = startingXI[0] ?? null;
  const gk = gkId ? playerById.get(gkId) ?? null : null;

  const rowRefs = useRef<Record<Exclude<Band, 'GK'>, HTMLDivElement | null>>({
    DEF: null, DM: null, MID: null, AM: null, ATT: null,
  });

  const [drag, setDrag] = useState<DragState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function onPointerDown(e: React.PointerEvent, playerId: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ playerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) { return; }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const moved = drag.moved || Math.hypot(dx, dy) > CLICK_THRESHOLD_PX;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) { return; }
    if (!drag.moved) {
      // A click, not a drag — toggle the role-instruction picker for this circle.
      setExpandedId(id => id === drag.playerId ? null : drag.playerId);
      setDrag(null);
      return;
    }
    for (const band of BAND_ORDER) {
      const el = rowRefs.current[band];
      if (!el) { continue; }
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const lateral = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
        onPlayerMove(drag.playerId, { band, lateral });
        break;
      }
    }
    setDrag(null);
  }

  const sz = { circle: 46, slotW: 72, posFont: 13, nameFont: 11 };

  /** A circle for a fan-out role picker, shared by both occupied and empty-slot rendering —
   *  only the anchor's label/tooltip/name and the click handlers differ between the two. */
  function renderPicker(
    anchorKey: string, role: FormationPosition, roleOptions: FormationPosition[], dimmed: boolean,
    onPick: (role: FormationPosition) => void, onAnchorPointerDown?: (e: React.PointerEvent) => void,
  ) {
    const isExpanded = expandedId === anchorKey;
    const spacing = sz.circle + 8;
    return (
      <Box sx={{ position: 'relative', width: sz.circle, height: sz.circle, flexShrink: 0 }}>
        <Tooltip title={isExpanded ? '' : keyAttributesTooltip(role)} arrow>
          <Box
            onPointerDown={onAnchorPointerDown}
            onPointerMove={onAnchorPointerDown ? onPointerMove : undefined}
            onPointerUp={onAnchorPointerDown ? onPointerUp : undefined}
            onClick={onAnchorPointerDown ? undefined : () => setExpandedId(id => id === anchorKey ? null : anchorKey)}
            sx={{
              position: 'absolute', top: 0, left: 0,
              width: sz.circle, height: sz.circle, borderRadius: '50%',
              bgcolor: dimmed ? 'rgba(255,255,255,0.12)' : teamColors.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: dimmed ? '2px dashed' : '2px solid',
              borderColor: dimmed ? 'rgba(255,255,255,0.4)' : teamColors.secondary,
              cursor: onAnchorPointerDown ? 'grab' : 'pointer', touchAction: 'none', userSelect: 'none',
              opacity: isExpanded ? 0 : 1,
              transform: isExpanded ? 'scale(0.5)' : 'scale(1)',
              pointerEvents: isExpanded ? 'none' : 'auto',
              transition: 'transform 0.18s ease, opacity 0.18s ease',
              '&:hover': { transform: isExpanded ? 'scale(0.5)' : 'scale(1.08)' },
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

        {roleOptions.map((opt, i) => {
          const offset = (i - (roleOptions.length - 1) / 2) * spacing;
          return (
            <Box
              key={opt}
              onClick={() => { onPick(opt); setExpandedId(null); }}
              sx={{
                position: 'absolute', top: 0, left: 0,
                width: sz.circle, height: sz.circle, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid', borderColor: teamColors.secondary,
                bgcolor: opt === role ? teamColors.secondary : teamColors.primary,
                cursor: 'pointer',
                opacity: isExpanded ? 1 : 0,
                transform: `translateX(${isExpanded ? offset : 0}px) scale(${isExpanded ? 1 : 0.4})`,
                pointerEvents: isExpanded ? 'auto' : 'none',
                transition: 'transform 0.18s ease, opacity 0.18s ease',
                '&:hover': { transform: `translateX(${offset}px) scale(1.08)` },
              }}
            >
              <Typography sx={{
                fontSize: sz.posFont, fontWeight: 800, lineHeight: 1, textAlign: 'center',
                color: opt === role ? teamColors.primary : teamColors.secondary,
              }}>
                {opt}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  function renderMember(member: BandMember, band: Exclude<Band, 'GK'>, members: BandMember[]) {
    if (member.kind === 'empty') {
      const role = member.geometry.role;
      return (
        <Box key={emptySlotKey(member.slotIndex)} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative' }}>
          {renderPicker(
            emptySlotKey(member.slotIndex), role, ROLE_OPTIONS_BY_BAND[band], true,
            (opt) => onEmptySlotRoleChange(member.slotIndex, opt),
          )}
          <Typography sx={{ fontSize: sz.nameFont, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1, fontStyle: 'italic' }}>
            Unassigned
          </Typography>
        </Box>
      );
    }

    const player = playerById.get(member.id);
    if (!player) { return null; }
    const role = member.geometry.role;
    const rank = rankInBand(member.id, members.filter(m => m.kind === 'player').map(m => ({ id: m.id, lateral: m.geometry.lateral })));
    const playerCount = members.filter(m => m.kind === 'player').length;
    const roleOptions: FormationPosition[] = eligibleRoles(band, rank, playerCount);
    const isDragging = drag?.playerId === member.id && drag.moved;

    return (
      <Box
        key={member.id}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative', zIndex: expandedId === member.id ? 10 : 1 }}
      >
        <Box sx={{ opacity: isDragging ? 0.35 : 1 }}>
          {renderPicker(
            member.id, role, roleOptions, false,
            (opt) => onPlayerRoleChange(member.id, opt),
            (e) => onPointerDown(e, member.id),
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

  return (
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
          {byBand[band].map(member => renderMember(member, band, byBand[band]))}
        </Box>
      ))}

      {/* GK is fixed — never draggable, never has role options, even when unfilled. */}
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
      {drag?.moved && (() => {
        const player = playerById.get(drag.playerId);
        if (!player) { return null; }
        const role = geometry[drag.playerId]?.role ?? player.position;
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
  );
}

export default TacticsPitch;
