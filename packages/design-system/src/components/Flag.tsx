import type { CSSProperties } from 'react';

interface FlagProps {
  /** ISO 3166-1 alpha-2 country code, lowercase (e.g. "no", "gb"). */
  code: string;
  size?: number;
  style?: CSSProperties;
}

/**
 * Generic flag chip rendered via the `flag-icons` CSS classes. The consuming app
 * must import `flag-icons/css/flag-icons.min.css` once at its root. This component
 * is domain-agnostic — callers resolve their own identifiers to an ISO code.
 */
export function Flag({ code, size = 20, style }: FlagProps) {
  return (
    <span
      className={`fi fi-${code}`}
      style={{ width: size * 1.33, height: size, display: 'inline-block', borderRadius: 2, flexShrink: 0, ...style }}
    />
  );
}
