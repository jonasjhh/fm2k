import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import { darken, useTheme } from '@mui/material/styles';

export interface SelectorOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading glyph, e.g. a flag emoji. */
  prefix?: string;
}

/**
 * A compact, single-select control rendered as a (optionally labelled) row of
 * toggle buttons (radio behaviour). The active button is filled with `activeColor`
 * (defaulting to the theme's primary colour). Buttons wrap, so it stays tidy with
 * many options.
 */
export function ButtonSelector<T extends string>({
  label, options, value, onChange, activeColor, activeContrast,
}: {
  label?: string;
  options: SelectorOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Fill colour for the selected button; defaults to the theme primary. */
  activeColor?: string;
  /** Readable text colour on top of `activeColor`; defaults to the theme primary contrast text. */
  activeContrast?: string;
}) {
  const theme = useTheme();
  const primary = activeColor ?? theme.palette.primary.main;
  const contrast = activeContrast ?? theme.palette.primary.contrastText;
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
      {label && (
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 70, flexShrink: 0 }}
        >
          {label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
        {options.map(o => (
          <ToggleButton
            key={o.value}
            value={o.value}
            size="small"
            selected={value === o.value}
            onChange={() => onChange(o.value)}
            sx={{
              textTransform: 'none', px: 1.25, py: 0.3, borderRadius: 2, lineHeight: 1.3,
              border: '1px solid', borderColor: 'divider',
              '&.Mui-selected': {
                bgcolor: primary, color: contrast, borderColor: primary,
                '&:hover': { bgcolor: darken(primary, 0.15) },
              },
            }}
          >
            {o.prefix && <Box component="span" sx={{ mr: 0.5 }}>{o.prefix}</Box>}
            {o.label}
          </ToggleButton>
        ))}
      </Box>
    </Box>
  );
}
