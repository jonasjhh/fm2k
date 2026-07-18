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
  deriveRolesForShape, BAND_ORDER, BAND_OF_ROLE, emptySlotKey, SECONDARY_POSITIONS, ROLE_CANONICAL_LATERAL,
} from '@fm2k/engine';
import { ATTR_LABELS } from '../../lib/attribute-labels';

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

/** Eligible role options for a player circle: the geometry-derived role + their natural
 *  position + SECONDARY_POSITIONS secondaries, deduped. */
const LEFT_ROLES = new Set<FormationPosition>(['LM', 'LW', 'LB', 'LWB']);
const RIGHT_ROLES = new Set<FormationPosition>(['RM', 'RW', 'RB', 'RWB']);

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

export function TacticsPitch({
  formation, startingXI, shapes, squad, teamColors, roleOverrides, onPlayerMove, onRoleOverride,
}: {
  formation: Formation;
  startingXI: (string | null)[];
  shapes: TeamShapes | null;
  squad: Player[];
  teamColors: { primary: string; secondary: string };
  roleOverrides: Record<string, FormationPosition>;
  onPlayerMove: (shape: keyof TeamShapes, playerId: string, geometry: PlayerGeometry) => void;
  onRoleOverride: (playerId: string, role: FormationPosition | null) => void;
}) {
  const [activeShape, setActiveShape] = useState<keyof TeamShapes>('defending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const derivedRoles = useMemo(() => deriveRolesForShape(geometry, roleOverrides), [geometry, roleOverrides]);
  // geometry-derived roles without overrides — used to detect which role is the "natural" one
  const baseRoles = useMemo(() => deriveRolesForShape(geometry), [geometry]);

  const getEffectiveLateral = (member: BandMember): number => {
    if (member.kind === 'player') {
      const override = roleOverrides[member.id];
      if (override !== undefined) { return ROLE_CANONICAL_LATERAL[override]; }
    }
    return member.geometry.lateral;
  };

  const byBand = useMemo(() => {
    const out: Record<Exclude<Band, 'GK'>, BandMember[]> = {
      DEF: [], DM: [], MID: [], AM: [], ATT: [],
    };
    for (const [id, g] of Object.entries(geometry)) { out[g.band].push({ kind: 'player', id, geometry: g }); }
    const canon = canonicalGeometry(formation);
    startingXI.forEach((id, i) => {
      if (id || i === 0) { return; }
      const canonSlot = canon[i - 1];
      if (!canonSlot) { return; }
      out[canonSlot.band].push({ kind: 'empty', slotIndex: i, geometry: canonSlot });
    });
    // Sort by effective lateral so overridden players appear in the correct relative order.
    for (const band of BAND_ORDER) { out[band].sort((a, b) => getEffectiveLateral(a) - getEffectiveLateral(b)); }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, startingXI, formation, roleOverrides]);

  const gkId = startingXI[0] ?? null;
  const gk = gkId ? playerById.get(gkId) ?? null : null;

  const rowRefs = useRef<Record<Exclude<Band, 'GK'>, HTMLDivElement | null>>({
    DEF: null, DM: null, MID: null, AM: null, ATT: null,
  });

  const [drag, setDrag] = useState<DragState | null>(null);

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
        onPlayerMove(activeShape, drag.playerId, { band, lateral });
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
    const isExpanded = expandedId === anchorKey;
    const spacing = sz.circle + 8;
    return (
      <Box sx={{ position: 'relative', width: sz.circle, height: sz.circle, flexShrink: 0 }}>
        <Tooltip title={isExpanded ? '' : (dimmed ? '' : keyAttributesTooltip(role))} arrow>
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

  function renderMember(member: BandMember, rank: number, bandCount: number) {
    if (member.kind === 'empty') {
      return (
        <Box key={emptySlotKey(member.slotIndex)} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative' }}>
          {renderPicker(emptySlotKey(member.slotIndex), member.geometry.band as FormationPosition, [], true, false, () => {})}
          <Typography sx={{ fontSize: sz.nameFont, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1, fontStyle: 'italic' }}>
            Unassigned
          </Typography>
        </Box>
      );
    }

    const player = playerById.get(member.id);
    if (!player) { return null; }

    const role = derivedRoles[member.id] ?? (player.position as FormationPosition);
    const baseRole = baseRoles[member.id] ?? (player.position as FormationPosition);
    const isOverridden = member.id in roleOverrides;
    const roleOptions = eligibleRoles(player.position as FormationPosition, baseRole, rank, bandCount);
    const isDragging = drag?.playerId === member.id && drag.moved;

    return (
      <Box
        key={member.id}
        onClick={e => e.stopPropagation()}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: sz.slotW, position: 'relative', zIndex: expandedId === member.id ? 10 : 1 }}
      >
        <Box sx={{ opacity: isDragging ? 0.35 : 1 }}>
          {renderPicker(
            member.id, role, roleOptions, false, isOverridden,
            (opt) => {
              if (opt === baseRole) {
                onRoleOverride(member.id, null);
              } else {
                onRoleOverride(member.id, opt);
              }
            },
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
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <ButtonGroup size="small">
          <Button
            variant={activeShape === 'defending' ? 'contained' : 'outlined'}
            onClick={() => { setActiveShape('defending'); setExpandedId(null); }}
            sx={{ px: 2, fontSize: 12, fontWeight: 700 }}
          >
            Defending
          </Button>
          <Button
            variant={activeShape === 'attacking' ? 'contained' : 'outlined'}
            onClick={() => { setActiveShape('attacking'); setExpandedId(null); }}
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
        onClick={() => setExpandedId(null)}
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
