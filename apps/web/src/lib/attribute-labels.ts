import type { PlayerAttributes } from '@fm2k/engine';

/** Display grouping/labels for the 10 base attributes, shared by every component that lists them
 *  (player detail view, the formation tooltip) so there's one place to keep them in sync. */
export const ATTR_GROUPS = [
  {
    label: 'Physical',
    attrs: [
      { key: 'speed', label: 'Speed' },
      { key: 'strength', label: 'Strength' },
      { key: 'agility', label: 'Agility' },
      { key: 'stamina', label: 'Stamina' },
    ],
  },
  {
    label: 'Technical',
    attrs: [
      { key: 'passing', label: 'Passing' },
      { key: 'finishing', label: 'Finishing' },
      { key: 'technique', label: 'Technique' },
      { key: 'defending', label: 'Defending' },
    ],
  },
  {
    label: 'Mental',
    attrs: [
      { key: 'awareness', label: 'Awareness' },
      { key: 'composure', label: 'Composure' },
    ],
  },
] as const;

export const ATTR_LABELS: Record<keyof PlayerAttributes, string> = Object.fromEntries(
  ATTR_GROUPS.flatMap(group => group.attrs.map(({ key, label }) => [key, label])),
) as Record<keyof PlayerAttributes, string>;
