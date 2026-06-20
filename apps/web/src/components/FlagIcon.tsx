import { Flag } from '@fm2k/design-system';
import type { CountryKey } from '@fm2k/engine';

// Football-domain mapping from our country ids to ISO codes. The generic <Flag>
// rendering lives in the design system; the domain knowledge stays here.
const ISO: Record<CountryKey, string> = {
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
  const code = ISO[countryId as CountryKey] ?? countryId.slice(0, 2).toLowerCase();
  return <Flag code={code} size={size} style={style} />;
}
