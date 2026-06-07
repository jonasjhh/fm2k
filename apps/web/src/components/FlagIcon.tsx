import type { CountryId } from '@fm2k/engine';

const ISO: Record<CountryId, string> = {
  norway:  'no',
  england: 'gb',
  germany: 'de',
  france:  'fr',
  spain:   'es',
  italy:   'it',
  sweden:  'se',
  denmark: 'dk',
};

interface FlagIconProps {
  countryId: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function FlagIcon({ countryId, size = 20, style }: FlagIconProps) {
  const iso = ISO[countryId as CountryId] ?? countryId.slice(0, 2).toLowerCase();
  return (
    <span
      className={`fi fi-${iso}`}
      style={{ width: size * 1.33, height: size, display: 'inline-block', borderRadius: 2, flexShrink: 0, ...style }}
    />
  );
}
