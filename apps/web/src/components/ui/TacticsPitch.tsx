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
  positionAttributeImportance, seedShapesFromFormation,
  deriveRolesForShape, BAND_ORDER, BAND_OF_ROLE, SECONDARY_POSITIONS, ROLE_CANONICAL_LATERAL,
} from '@fm2k/engine';
import { ATTR_LABELS } from '../../lib/attribute-labels';

const CLICK_THRESHOLD_PX = 6;

const BAND_ROW_INDEX: Record<Exclude<Band, 'GK'>, number> = { ATT: 0, AM: 1, MID: 2, DM: 3, DEF: 4 };

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

/** Eligible role options for a player circle: the geometry-derived role + their natural
 *  position + SECONDARY_POSITIONS secondaries, deduped. */
const LEFT_ROLES = new Set<FormationPosition>(['LM', 'LW', 'LB']);
const RIGHT_ROLES = new Set<FormationPosition>(['RM', 'RW', 'RB']);

/** `rank` is the player's 0-based index among all players in their band (sorted left→right).
 *  Only the leftmost player (rank 0) is offered left-flank secondaries; only the rightmost
 *  (rank === bandCount-1) is offered right-flank secondaries. Everything else is central. */
function eligibleRoles(
  naturalPos: FormationPosition,
  derivedRole: FormationPosition,
  rank: number,
  bandCount: number,
): FormationPosition[] {
  const derivedBand = BAND_OF_ROLE[derivedRole];
  const includeNatural = BAND_OF_ROLE[naturalPos] === derivedBand;
  let secondaries = (SECONDARY_POSITIONS[naturalPos as keyof typeof SECONDARY_POSITIONS] ?? []) as FormationPosition[];
  secondaries = secondaries.filter(r => BAND_OF_ROLE[r] === derivedBand);
  const isLeft  = rank === 0 && bandCount > 1;
  const isRight = rank === bandCount - 1 && bandCount > 1;
  if (isLeft && !isRight)       { secondaries = secondaries.filter(r => !RIGHT_ROLES.has(r)); }
  else if (isRight && !isLeft)  { secondaries = secondaries.filter(r => !LEFT_ROLES.has(r)); }
  else                          { secondaries = secondaries.filter(r => !LEFT_ROLES.has(r) && !RIGHT_ROLES.has(r)); }
  const seen = new Set<FormationPosition>();
  const roles: FormationPosition[] = [];
  for (const r of [derivedRole, ...(includeNatural ? [naturalPos] : []), ...secondaries]) {
    if (!seen.has(r)) { seen.add(r); roles.push(r); }
  }
  return roles;
}

interface DragState {
  slotIndex: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

/** One outfield slot (1–10) on the pitch: its geometry (slot-keyed, always present) plus the
 *  player filling it, if any. The layout belongs to the slot, not the player. */
type BandMember = { slotIndex: number; playerId: string | null; geometry: PlayerGeometry };

export function TacticsPitch({
  formation, startingXI, shapes, squad, teamColors, roleOverrides, onSlotMove, onSlotRoleOverride,
}: {
  formation: Formation;
  startingXI: (string | null)[];
  shapes: TeamShapes | null;
  squad: Player[];
  teamColors: { primary: string; secondary: string };
  roleOverrides: Record<number, FormationPosition>;
  onSlotMove: (shape: keyof TeamShapes, slot: number, geometry: PlayerGeometry) => void;
  onSlotRoleOverride: (slot: number, role: FormationPosition | null) => void;
}) {
  const [activeShape, setActiveShape] = useState<keyof TeamShapes>('defending');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    squad.forEach(p => m.set(p.id, p));
    return m;
  }, [squad]);

  const effectiveShapes = useMemo(
    () => shapes ?? seedShapesFromFormation(formation),
    [shapes, formation],
  );
  const geometry = effectiveShapes[activeShape];
  const otherGeometry = effectiveShapes[activeShape === 'defending' ? 'attacking' : 'defending'];

  // Slot-keyed geometry → slot-keyed derived roles (deriveRolesForShape is key-agnostic).
  const derivedRoles = useMemo(() => deriveRolesForShape(geometry, roleOverrides), [geometry, roleOverrides]);
  // geometry-derived roles without overrides — used to detect which role is the "natural" one
  const baseRoles = useMemo(() => deriveRolesForShape(geometry), [geometry]);

  const getEffectiveLateral = (member: BandMember): number => {
    const override = roleOverrides[member.slotIndex];
    if (override !== undefined) { return ROLE_CANONICAL_LATERAL[override]; }
    return member.geometry.lateral;
  };

  const byBand = useMemo(() => {
    const out: Record<Exclude<Band, 'GK'>, BandMember[]> = {
      DEF: [], DM: [], MID: [], AM: [], ATT: [],
    };
    // Every outfield slot 1–10 has geometry (the shape is fully seeded); the player may be null.
    for (let slot = 1; slot <= 10; slot++) {
      const g = geometry[slot];
      if (!g) { continue; }
      out[g.band].push({ slotIndex: slot, playerId: startingXI[slot] ?? null, geometry: g });
    }
    // Sort by effective lateral so overridden slots appear in the correct relative order.
    for (const band of BAND_ORDER) { out[band].sort((a, b) => getEffectiveLateral(a) - getEffectiveLateral(b)); }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, startingXI, roleOverrides]);

  const gkId = startingXI[0] ?? null;
  const gk = gkId ? playerById.get(gkId) ?? null : null;

  const rowRefs = useRef<Record<Exclude<Band, 'GK'>, HTMLDivElement | null>>({
    DEF: null, DM: null, MID: null, AM: null, ATT: null,
  });

  const [drag, setDrag] = useState<DragState | null>(null);

  function onPointerDown(e: React.PointerEvent, slotIndex: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ slotIndex, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false });
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
      setExpandedKey(k => k === String(drag.slotIndex) ? null : String(drag.slotIndex));
      setDrag(null);
      return;
    }
    for (const band of BAND_ORDER) {
      const el = rowRefs.current[band];
      if (!el) { continue; }
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const lateral = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
        onSlotMove(activeShape, drag.slotIndex, { band, lateral });
        break;
      }
    }
    setDrag(null);
  }

  const sz = { circle: 46, slotW: 72, posFont: 13, nameFont: 11 };

  /** Fan-out role picker: anchor circle shrinks away and role option circles spread out
   *  horizontally. Clicking a role option calls onPick and collapses. */
  function renderPicker(
    anchorKey: string,
    role: FormationPosition,
    roleOptions: FormationPosition[],
    dimmed: boolean,
    isOverridden: boolean,
    onPick: (role: FormationPosition) => void,
    onAnchorPointerDown?: (e: React.PointerEvent) => void,
  ) {
    const isExpanded = expandedKey === anchorKey;
    const spacing = sz.circle + 8;
    return (
      <Box sx={{ position: 'relative', width: sz.circle, height: sz.circle, flexShrink: 0 }}>
        <Tooltip title={isExpanded ? '' : (dimmed ? '' : keyAttributesTooltip(role))} arrow>
          <Box
            onPointerDown={onAnchorPointerDown}
            onPointerMove={onAnchorPointerDown ? onPointerMove : undefined}
            onPointerUp={onAnchorPointerDown ? onPointerUp : undefined}
            onClick={onAnchorPointerDown ? undefined : () => setExpandedKey(id => id === anchorKey ? null : anchorKey)}
            sx={{
              position: 'absolute', top: 0, left: 0,
              width: sz.circle, height: sz.circle, borderRadius: '50%',
              bgcolor: dimmed ? 'rgba(255,255,255,0.12)' : teamColors.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: dimmed ? '2px dashed' : '2px solid',
              borderColor: dimmed
                ? 'rgba(255,255,255,0.4)'
                : isOverridden ? 'warning.main' : teamColors.secondary,
              cursor: onAnchorPointerDown ? 'grab' : 'pointer',
              touchAction: 'none', userSelect: 'none',
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
              onClick={() => { onPick(opt); setExpandedKey(null); }}
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

  function renderMember(member: BandMember, rank: number, bandCount: number) {
    const slotKey = String(member.slotIndex);
    const player = member.playerId ? playerById.get(member.playerId) ?? null : null;
    const role = derivedRoles[member.slotIndex] ?? (member.geometry.band as FormationPosition);
    const isDragging = drag?.slotIndex === member.slotIndex && drag.moved;
    const otherBand = otherGeometry[member.slotIndex]?.band;
    const bandDelta = otherBand !== undefined && otherBand !== member.geometry.band
      ? BAND_ROW_INDEX[member.geometry.band] - BAND_ROW_INDEX[otherBand]
      : 0;

    const arrow = bandDelta !== 0 ? (
      <Typography sx={{
        position: 'absolute', top: -4, right: -6, fontSize: 12, fontWeight: 900,
        lineHeight: 1, color: 'rgba(255,255,255,0.85)', pointerEvents: 'none',
        textShadow: '0 0 3px rgba(0,0,0,0.8)',
      }}>
        {bandDelta > 0 ? '↑' : '↓'}
      </Typography>
    ) : null;

    // Empty slot: still a real, draggable position in the shape — the layout is the slot's,
    // not the player's, so it persists and stays editable even with nobody assigned.
    if (!player) {
      return (
        <Box key={slotKey} onClick={e => e.stopPropagation()}
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative', zIndex: expandedKey === slotKey ? 10 : 1 }}>
          <Box sx={{ opacity: isDragging ? 0.35 : 1, position: 'relative' }}>
            {renderPicker(slotKey, role, [], true, false, () => {}, (e) => onPointerDown(e, member.slotIndex))}
            {arrow}
          </Box>
          <Typography sx={{ fontSize: sz.nameFont, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1, fontStyle: 'italic' }}>
            Unassigned
          </Typography>
        </Box>
      );
    }

    const baseRole = baseRoles[member.slotIndex] ?? (player.position as FormationPosition);
    const isOverridden = member.slotIndex in roleOverrides;
    const roleOptions = eligibleRoles(player.position as FormationPosition, baseRole, rank, bandCount);

    return (
      <Box
        key={slotKey}
        onClick={e => e.stopPropagation()}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative', zIndex: expandedKey === slotKey ? 10 : 1 }}
      >
        <Box sx={{ opacity: isDragging ? 0.35 : 1, position: 'relative' }}>
          {renderPicker(
            slotKey, role, roleOptions, false, isOverridden,
            (opt) => onSlotRoleOverride(member.slotIndex, opt === baseRole ? null : opt),
            (e) => onPointerDown(e, member.slotIndex),
          )}
          {arrow}
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
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <ButtonGroup size="small">
          <Button
            variant={activeShape === 'defending' ? 'contained' : 'outlined'}
            onClick={() => { setActiveShape('defending'); setExpandedKey(null); }}
            sx={{ px: 2, fontSize: 12, fontWeight: 700 }}
          >
            Defending
          </Button>
          <Button
            variant={activeShape === 'attacking' ? 'contained' : 'outlined'}
            onClick={() => { setActiveShape('attacking'); setExpandedKey(null); }}
            sx={{ px: 2, fontSize: 12, fontWeight: 700 }}
          >
            Attacking
          </Button>
        </ButtonGroup>
      </Box>

      <Box
        sx={{
          background: 'linear-gradient(180deg, #2d6a2d 0%, #1e4d1e 100%)',
          borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column',
          justifyContent: 'space-evenly', border: '2px solid', borderColor: 'success.dark',
          minHeight: 460, position: 'relative',
        }}
        onClick={() => setExpandedKey(null)}
      >
        {BAND_ORDER.map(band => (
          <Box
            key={band}
            ref={(el: HTMLDivElement | null) => { rowRefs.current[band] = el; }}
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, minHeight: sz.circle + 24 }}
          >
            {byBand[band].map((member, i) => renderMember(member, i, byBand[band].length))}
          </Box>
        ))}

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

        {drag?.moved && (() => {
          const role = derivedRoles[drag.slotIndex] ?? (geometry[drag.slotIndex]?.band as FormationPosition);
          if (!role) { return null; }
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
