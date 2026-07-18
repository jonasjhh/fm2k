import { ButtonSelector as DsButtonSelector } from '@fm2k/design-system';
import type { SelectorOption } from '@fm2k/design-system';
import type { ComponentProps } from 'react';
import { useClubColors } from '../../hooks/useClubColors';

export type { SelectorOption };

/** The design-system ButtonSelector with the managing club's colours injected,
 *  so every selector row in the app is automatically club-themed. */
export function ButtonSelector<T extends string>(
  props: Omit<ComponentProps<typeof DsButtonSelector<T>>, 'activeColor' | 'activeContrast'>,
) {
  const { primary, contrast } = useClubColors();
  return <DsButtonSelector {...props} activeColor={primary} activeContrast={contrast} />;
}

export default ButtonSelector;
