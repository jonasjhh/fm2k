import React from 'react';

export const BENCH_TYPES = new Set(['open-bleacher', 'kop']);

interface Props {
  standType: string
  densityValue: number // 10 (dense) … 50 (sparse), as stored in the engine
  colorA: string
  colorB: string
  width: number
  height: number // slant length of the deck face
  idPrefix: string // unique per sector+tier: SVG pattern ids are document-global
}

/**
 * Seating surface of one raked deck. Pattern fills keep the element count O(1)
 * regardless of density: packed individual seat rows for seated stands, long
 * sparse slats for bench stands (bleachers, kop).
 */
const SeatDeckSvg = React.memo(function SeatDeckSvg({ standType, densityValue, colorA, colorB, width, height, idPrefix }: Props) {
  const bench = BENCH_TYPES.has(standType);
  const isKop = standType === 'kop';
  // dense (10) → tight rows, sparse (50) → wide-open bench spacing
  const rowPitch = bench ? 10 + densityValue * 0.35 : 6 + densityValue * 0.2;
  const seatPitch = rowPitch * 0.9;
  const pid = `${idPrefix}-seats`;
  const gid = `${idPrefix}-wash`;

  const aisleXs = width > 260 ? [0.25, 0.5, 0.75] : [0.5];

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        {bench ? (
          <pattern id={pid} width={width} height={rowPitch * 2} patternUnits="userSpaceOnUse">
            <rect x={5} y={rowPitch * 0.25} width={width - 10} height={3.2} rx={1.6} fill={colorA} />
            <rect x={5} y={rowPitch * 1.25} width={width - 10} height={3.2} rx={1.6} fill={colorB} />
          </pattern>
        ) : (
          <pattern id={pid} width={seatPitch * 2} height={rowPitch * 2} patternUnits="userSpaceOnUse">
            <rect x={0.6} y={1} width={seatPitch - 1.6} height={rowPitch - 2.4} rx={1.4} fill={colorA} />
            <rect x={seatPitch + 0.6} y={1} width={seatPitch - 1.6} height={rowPitch - 2.4} rx={1.4} fill={colorB} />
            <rect x={0.6} y={rowPitch + 1} width={seatPitch - 1.6} height={rowPitch - 2.4} rx={1.4} fill={colorB} />
            <rect x={seatPitch + 0.6} y={rowPitch + 1} width={seatPitch - 1.6} height={rowPitch - 2.4} rx={1.4} fill={colorA} />
          </pattern>
        )}
        {isKop && (
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colorA} stopOpacity="0.35" />
            <stop offset="50%" stopColor="transparent" />
            <stop offset="100%" stopColor={colorB} stopOpacity="0.35" />
          </linearGradient>
        )}
      </defs>

      <rect width={width} height={height} fill="rgba(15,20,30,0.92)" />
      <rect width={width} height={height} fill={`url(#${pid})`} />
      {isKop && <rect width={width} height={height} fill={`url(#${gid})`} />}

      {aisleXs.map(fx => (
        <rect key={fx} x={width * fx - 3} y={0} width={6} height={height} fill="rgba(0,0,0,0.4)" />
      ))}
      {/* front rail */}
      <rect x={0} y={0} width={width} height={2.5} fill="rgba(255,255,255,0.55)" />
      {/* rear edge shadow line */}
      <rect x={0} y={height - 2} width={width} height={2} fill="rgba(0,0,0,0.5)" />
    </svg>
  );
});

export default SeatDeckSvg;
