import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

/** A team name rendered as an inline, accessible button that opens the lineup view. */
export default function TeamNameButton({
  name, onClick, sx,
}: {
  name: string;
  onClick: () => void;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        font: 'inherit',
        color: 'inherit',
        background: 'none',
        border: 'none',
        p: 0,
        m: 0,
        cursor: 'pointer',
        textAlign: 'inherit',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        '&:hover, &:focus-visible': { textDecoration: 'underline' },
        ...sx,
      }}
    >
      {name}
    </Box>
  );
}
