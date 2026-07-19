import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import type { Formation } from '@fm2k/engine';
import { FORMATION_LINES } from '@fm2k/engine';

const FORMATIONS_QUICK = Object.keys(FORMATION_LINES) as Formation[];

/** Formation button row + Custom status chip. Shared between TacticsTab and the
 *  match overlay so formation changes are reachable during a live match. */
export default function FormationSelector({
  effectiveLabel,
  onFormation,
  disabled = false,
}: {
  effectiveLabel: string;
  onFormation: (f: Formation) => void;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      {FORMATIONS_QUICK.map((f) => (
        <Button
          key={f}
          variant={effectiveLabel === f ? 'contained' : 'outlined'}
          onClick={() => onFormation(f)}
          disabled={disabled}
          sx={{ px: 1.5, py: 0.75, minWidth: 54, fontSize: 12, fontWeight: 700, lineHeight: 1 }}
        >
          {f}
        </Button>
      ))}
      <Chip
        label="Custom"
        color={effectiveLabel === 'custom' ? 'secondary' : 'default'}
        variant={effectiveLabel === 'custom' ? 'filled' : 'outlined'}
        sx={{ fontSize: 12, fontWeight: 700 }}
      />
    </Box>
  );
}
