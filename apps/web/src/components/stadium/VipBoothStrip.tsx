import React from 'react';

interface Props {
  width: number
  height: number
  idPrefix: string
  trimColor: string // gold rails, from theme.palette.warning
}

/**
 * Executive-suite booth facade: a dark wall with a row of glowing glass
 * booths, mullions and gold trim rails. Rendered on the vertical face between
 * the lower and upper tiers.
 */
const VipBoothStrip = React.memo(function VipBoothStrip({ width, height, idPrefix, trimColor }: Props) {
  const gid = `${idPrefix}-glow`;
  const boothW = 26;
  const gap = 10;
  const count = Math.max(2, Math.floor((width - gap) / (boothW + gap)));
  const span = count * boothW + (count - 1) * gap;
  const x0 = (width - span) / 2;
  const winH = height * 0.55;
  const winY = height * 0.18;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7c2d12" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      {/* dark facade */}
      <rect width={width} height={height} fill="#1e1b2e" />
      {/* gold trim rails */}
      <rect x={0} y={0} width={width} height={2.5} fill={trimColor} />
      <rect x={0} y={height - 2.5} width={width} height={2.5} fill={trimColor} />

      {Array.from({ length: count }, (_, i) => {
        const x = x0 + i * (boothW + gap);
        return (
          <g key={i}>
            {/* glowing glass */}
            <rect x={x} y={winY} width={boothW} height={winH} rx={2} fill={`url(#${gid})`} />
            {/* glass reflection */}
            <rect x={x + 2} y={winY + 1.5} width={boothW - 4} height={winH * 0.28} rx={1.5} fill="rgba(255,255,255,0.3)" />
            {/* mullion */}
            <rect x={x + boothW / 2 - 0.6} y={winY} width={1.2} height={winH} fill="rgba(30,27,46,0.85)" />
            {/* sill */}
            <rect x={x - 1.5} y={winY + winH} width={boothW + 3} height={2} fill="rgba(255,255,255,0.25)" />
          </g>
        );
      })}
    </svg>
  );
});

export default VipBoothStrip;
