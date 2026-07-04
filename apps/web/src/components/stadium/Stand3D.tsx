import React, { useMemo } from 'react';
import type { StadiumSectorConfig } from '@fm2k/engine';
import type { SectorKey } from '../../utils/stadium';
import {
  computeStandFaces,
  computeCornerFacets,
  computeCornerRoofFaces,
  STAND_PLACEMENTS,
  CORNER_FANS,
  isCornerKey,
  type CornerKey,
  type Face,
} from './geometry';
import SeatDeckSvg from './SeatDeckSvg';
import VipBoothStrip from './VipBoothStrip';

export interface StandColors {
  structure: string // concrete walls
  roof: string
  trim: string // VIP gold
  primary: string // selection
  pending: string // edited-but-not-applied marker
  emptyBorder: string
}

interface Props {
  sectorKey: SectorKey
  sector: StadiumSectorConfig
  colorA: string
  colorB: string
  isActive: boolean
  isPending: boolean
  colors: StandColors
  onSelect: (key: SectorKey) => void
}

interface FaceProps {
  face: Face
  background?: string
  tint?: string
  children?: React.ReactNode
  sectorKey: SectorKey
  onClick: () => void
}

/** One absolutely-positioned plane in the stand's local 3D frame. */
function StandFace({ face, background, tint, children, sectorKey, onClick }: FaceProps) {
  return (
    <div
      data-sector-face={sectorKey}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: face.left,
        top: face.top,
        width: face.width,
        height: face.height,
        transformOrigin: face.origin,
        transform: face.transform,
        background,
        clipPath: face.clipPath,
        cursor: 'pointer',
      }}
    >
      {children}
      {/* baked lighting: fixed sun, never recomputed while orbiting */}
      {face.brightness < 1 && (
        <div style={{ position: 'absolute', inset: 0, background: `rgba(5,8,18,${(1 - face.brightness) * 0.85})`, pointerEvents: 'none' }} />
      )}
      {tint && <div style={{ position: 'absolute', inset: 0, background: tint, pointerEvents: 'none' }} />}
    </div>
  );
}

// Ground ring shape: corners get a large radius on their outer corner so the
// footprint matches the rounded bowl.
const CORNER_RING_RADIUS: Record<CornerKey, string> = {
  NW: '85% 6px 6px 6px',
  NE: '6px 85% 6px 6px',
  SW: '6px 6px 6px 85%',
  SE: '6px 6px 85% 6px',
};

interface Piece {
  rotZ: number
  origin: string
  left: number
  top: number
  width: number
  height: number
  faces: Face[]
}

/**
 * A single stand as real extruded CSS-3D geometry: raked seating decks,
 * riser/rear/side walls, roof slab and (for executive suites) a glowing VIP
 * booth facade. Corners are a fan of wedge facets rotating around the pitch
 * corner, forming a rounded bowl. Memoized — never re-renders on camera moves.
 */
const Stand3D = React.memo(function Stand3D({ sectorKey, sector, colorA, colorB, isActive, isPending, colors, onSelect }: Props) {
  const placement = STAND_PLACEMENTS[sectorKey];
  const corner = isCornerKey(sectorKey);

  const pieces = useMemo<Piece[]>(() => {
    if (!corner) {
      return [{
        rotZ: 0,
        origin: '50% 50%',
        left: 0,
        top: 0,
        width: placement.w,
        height: placement.depth,
        faces: computeStandFaces(sector.type, placement.w, placement.scale),
      }];
    }
    const fan = CORNER_FANS[sectorKey];
    const facets: Piece[] = computeCornerFacets(fan, sector.type).map(facet => ({
      rotZ: facet.rotZ,
      // the facet hangs from its apex (top-center); rotation swings it into
      // place inside the corner square
      origin: `${facet.w / 2}px 0px`,
      left: fan.apexX - facet.w / 2,
      top: fan.apexY,
      width: facet.w,
      height: facet.depth,
      faces: computeStandFaces(sector.type, facet.w, facet.scale, { halfAngleDeg: facet.halfAngleDeg }),
    }));
    // one merged quarter-annulus roof over the whole fan — no facet lines
    facets.push({
      rotZ: 0,
      origin: '50% 50%',
      left: 0,
      top: 0,
      width: placement.w,
      height: placement.depth,
      faces: computeCornerRoofFaces(fan, sector.type),
    });
    return facets;
  }, [corner, sectorKey, sector.type, placement.w, placement.depth, placement.scale]);

  const isEmpty = pieces.every(p => p.faces.length === 0);
  const selectionTint = isActive ? `${colors.primary}33` : undefined;
  const select = () => onSelect(sectorKey);

  const renderFace = (face: Face, key: string, piece: number) => {
    if (face.kind === 'deck') {
      return (
        <StandFace key={key} face={face} tint={selectionTint} sectorKey={sectorKey} onClick={select}>
          <SeatDeckSvg
            standType={sector.type}
            densityValue={sector.densityValue}
            colorA={colorA}
            colorB={colorB}
            width={face.width}
            height={face.height}
            idPrefix={`${sectorKey}-p${piece}-t${face.tier}`}
          />
        </StandFace>
      );
    }
    if (face.kind === 'booth') {
      return (
        <StandFace key={key} face={face} tint={selectionTint} sectorKey={sectorKey} onClick={select}>
          <VipBoothStrip width={face.width} height={face.height} idPrefix={`${sectorKey}-p${piece}-vip`} trimColor={colors.trim} />
        </StandFace>
      );
    }
    const background = face.kind === 'roof' || face.kind === 'fascia' ? colors.roof : colors.structure;
    return <StandFace key={key} face={face} background={background} tint={selectionTint} sectorKey={sectorKey} onClick={select} />;
  };

  return (
    <div
      data-sector={sectorKey}
      style={{
        position: 'absolute',
        left: placement.cx - placement.w / 2,
        top: placement.cy - placement.depth / 2,
        width: placement.w,
        height: placement.depth,
        transform: `rotateZ(${placement.rotZ}deg)`,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* ground ring: selection / pending state (reads flat on the pitch plane) */}
      <div
        style={{
          position: 'absolute',
          inset: -4,
          transform: 'translateZ(0.5px)',
          borderRadius: corner ? CORNER_RING_RADIUS[sectorKey] : 6,
          border: isActive
            ? `3px solid ${colors.primary}`
            : isPending
              ? `2px dashed ${colors.pending}`
              : isEmpty ? `2px dashed ${colors.emptyBorder}` : 'none',
          boxShadow: isActive ? `0 0 24px ${colors.primary}, inset 0 0 18px ${colors.primary}40` : 'none',
          background: isEmpty ? 'rgba(127,127,127,0.06)' : 'rgba(0,0,0,0.28)',
          pointerEvents: 'none',
        }}
      />

      {pieces.map((piece, pi) => (
        <div
          key={pi}
          style={{
            position: 'absolute',
            left: piece.left,
            top: piece.top,
            width: piece.width,
            height: piece.height,
            transformOrigin: piece.origin,
            transform: `rotateZ(${piece.rotZ}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {piece.faces.map((face, i) => renderFace(face, `${pi}-${i}`, pi))}
        </div>
      ))}

      {/* flat click plate: ground-level hit target (empty sectors, front rows) */}
      <div
        data-sector-plate={sectorKey}
        onClick={select}
        style={{
          position: 'absolute',
          inset: -4,
          transform: 'translateZ(2px)',
          borderRadius: corner ? CORNER_RING_RADIUS[sectorKey] : 6,
          cursor: 'pointer',
        }}
      />
    </div>
  );
});

export default Stand3D;
