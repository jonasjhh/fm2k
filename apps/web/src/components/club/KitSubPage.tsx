import { useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Snackbar from '@mui/material/Snackbar';
import { alpha } from '@mui/material/styles';
import { SectionHeader } from '@fm2k/design-system';
import { useGameStore } from '@/store/game-store';
import { useClubColors } from '../../hooks/useClubColors';
import { useShallow } from 'zustand/react/shallow';

// ─── kit model ──────────────────────────────────────────────────────────────
// `primary`/`secondary` mirror the team's saved colors (used by the rest of the
// UI). The remaining fields + pattern are preview-only: they live in
// localStorage so they survive tab switches but never hit the save file.

type Pattern = 'solid' | 'stripes' | 'hoops' | 'checker' | 'sash' | 'split';

interface Kit {
  primary: string;
  secondary: string;
  collar: string;
  sleeves: string;
  shorts: string;
  shortsTrim: string;
  socks: string;
  socksTrim: string;
  text: string;
  pattern: Pattern;
}

type ExtraField = Exclude<keyof Kit, 'primary' | 'secondary' | 'pattern'>;

const COLOR_FIELDS: { key: keyof Kit; label: string }[] = [
  { key: 'primary', label: 'Jersey' },
  { key: 'secondary', label: 'Pattern' },
  { key: 'collar', label: 'Trims' },
  { key: 'sleeves', label: 'Sleeves' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'shortsTrim', label: 'Sh. Trim' },
  { key: 'socks', label: 'Socks' },
  { key: 'socksTrim', label: 'So. Trim' },
  { key: 'text', label: 'Print' },
];

const PATTERNS: { value: Pattern; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'stripes', label: 'Stripes' },
  { value: 'hoops', label: 'Hoops' },
  { value: 'checker', label: 'Checker' },
  { value: 'sash', label: 'Sash' },
  { value: 'split', label: 'Split' },
];

const storageKey = (teamId: string) => `fm2k-kit-${teamId}`;

/** Sensible extras + pattern derived purely from the team's two colors. */
function defaultExtras(primary: string, secondary: string): Pick<Kit, ExtraField | 'pattern'> {
  return {
    collar: secondary,
    sleeves: primary,
    shorts: secondary,
    shortsTrim: primary,
    socks: secondary,
    socksTrim: primary,
    text: secondary,
    pattern: 'solid',
  };
}

/** Load the preview-only extras for a team, falling back to derived defaults. */
function loadExtras(teamId: string, primary: string, secondary: string): Pick<Kit, ExtraField | 'pattern'> {
  const base = defaultExtras(primary, secondary);
  if (typeof window === 'undefined') { return base; }
  try {
    const raw = window.localStorage.getItem(storageKey(teamId));
    if (!raw) { return base; }
    const parsed = JSON.parse(raw) as Partial<Pick<Kit, ExtraField | 'pattern'>>;
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}

function saveExtras(teamId: string, kit: Kit): void {
  if (typeof window === 'undefined') { return; }
  const extras: Pick<Kit, ExtraField | 'pattern'> = {
    collar: kit.collar,
    sleeves: kit.sleeves,
    shorts: kit.shorts,
    shortsTrim: kit.shortsTrim,
    socks: kit.socks,
    socksTrim: kit.socksTrim,
    text: kit.text,
    pattern: kit.pattern,
  };
  window.localStorage.setItem(storageKey(teamId), JSON.stringify(extras));
}

export default function KitSubPage() {
  const { playerTeamId, updateTeamColors } = useGameStore(useShallow((s) => ({
    playerTeamId: s.playerTeamId,
    updateTeamColors: s.updateTeamColors,
  })));

  const teamColors = useClubColors();

  const [kit, setKit] = useState<Kit>(() => {
    const { primary, secondary } = teamColors;
    return { primary, secondary, ...loadExtras(playerTeamId ?? '', primary, secondary) };
  });
  const savedColors = useRef({ primary: teamColors.primary, secondary: teamColors.secondary });
  const [dirty, setDirty] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  if (!playerTeamId) { return null; }

  const update = (field: keyof Kit, value: string) => {
    setKit((prev) => {
      const next = { ...prev, [field]: value } as Kit;
      saveExtras(playerTeamId, next);
      setDirty(true);
      return next;
    });
  };

  const setPattern = (pattern: Pattern) => {
    setKit((prev) => {
      const next = { ...prev, pattern };
      saveExtras(playerTeamId, next);
      setDirty(true);
      return next;
    });
  };

  const saveKit = () => {
    updateTeamColors(playerTeamId, { primary: kit.primary, secondary: kit.secondary });
    setSavedOpen(true);
    savedColors.current = { primary: kit.primary, secondary: kit.secondary };
    setDirty(false);
  };

  const resetColors = () => {
    const { primary, secondary } = savedColors.current;
    const reset = { primary, secondary, ...loadExtras(playerTeamId, primary, secondary) };
    setKit(reset);
    setDirty(false);
  };

  return (
    <Box>
      <SectionHeader title="Kit Designer" />
      <Grid container spacing={2}>
        {/* ── controls ─────────────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Pattern
            </Typography>
            <ToggleButtonGroup
              value={kit.pattern}
              exclusive
              onChange={(_, v: Pattern | null) => v && setPattern(v)}
              size="small"
              sx={{ mt: 1, flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 2, border: '1px solid', borderColor: 'divider', px: 1.5 } }}
            >
              {PATTERNS.map((p) => (
                <ToggleButton key={p.value} value={p.value}>{p.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Kit colors
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {COLOR_FIELDS.map(({ key, label }) => (
                <Grid size={{ xs: 4, sm: 3 }} key={key}>
                  <Box
                    component="label"
                    sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                      p: 1, borderRadius: 2, cursor: 'pointer',
                      bgcolor: (t) => alpha(t.palette.text.primary, 0.04),
                      '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.08) },
                    }}
                  >
                    <Box
                      component="input"
                      type="color"
                      value={kit[key]}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(key, e.target.value)}
                      sx={{ width: 28, height: 28, border: '2px solid', borderColor: 'divider', borderRadius: 1, cursor: 'pointer', p: 0, background: 'none' }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1 }}>
                      {label}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={saveKit} disabled={!dirty}>
                Save kit
              </Button>
              <Button variant="text" onClick={resetColors} disabled={!dirty}>
                Reset to saved
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Saving applies Jersey &amp; Pattern as your club&apos;s colors across the game.
            </Typography>
          </Paper>
        </Grid>

        {/* ── live preview ─────────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3, bgcolor: '#064e3b', minHeight: 420,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.4)', p: 2,
            }}
          >
            <KitSvg kit={kit} />
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={savedOpen}
        autoHideDuration={2000}
        onClose={() => setSavedOpen(false)}
        message="Kit saved"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

// ─── the SVG kit engine (ported from the prototype) ─────────────────────────

const PATTERN_FILL: Partial<Record<Pattern, string>> = {
  stripes: 'url(#pat-vertical)',
  hoops: 'url(#pat-hoops)',
  checker: 'url(#pat-checker)',
};

function KitSvg({ kit }: { kit: Kit }) {
  const vars: CSSProperties = {
    '--primary-color': kit.primary,
    '--secondary-color': kit.secondary,
    '--collar-color': kit.collar,
    '--sleeves-color': kit.sleeves,
    '--shorts-color': kit.shorts,
    '--shorts-trim-color': kit.shortsTrim,
    '--socks-color': kit.socks,
    '--socks-trim-color': kit.socksTrim,
    '--text-color': kit.text,
    width: '60%',
    maxHeight: 380,
    filter: 'drop-shadow(0 20px 25px rgba(0,0,0,0.4))',
  } as CSSProperties;

  const patternFill = PATTERN_FILL[kit.pattern];

  return (
    <svg viewBox="80 30 280 470" style={vars}>
      <defs>
        <clipPath id="front-body-clip">
          <path d="M 155,70 L 135,130 C 135,130 155,200 165,280 Q 220,288 275,280 C 285,200 305,130 305,130 L 285,70 Q 220,85 155,70 Z" />
        </clipPath>

        <pattern id="pat-vertical" width="30" height="40" patternUnits="userSpaceOnUse">
          <rect width="15" height="40" fill="var(--primary-color)" />
          <rect x="15" width="15" height="40" fill="var(--secondary-color)" />
        </pattern>
        <pattern id="pat-hoops" width="40" height="30" patternUnits="userSpaceOnUse">
          <rect width="40" height="15" fill="var(--primary-color)" />
          <rect y="15" width="40" height="15" fill="var(--secondary-color)" />
        </pattern>
        <pattern id="pat-checker" width="30" height="30" patternUnits="userSpaceOnUse">
          <rect width="15" height="15" fill="var(--primary-color)" />
          <rect x="15" y="15" width="15" height="15" fill="var(--primary-color)" />
          <rect x="15" width="15" height="15" fill="var(--secondary-color)" />
          <rect y="15" width="15" height="15" fill="var(--secondary-color)" />
        </pattern>

        <pattern id="pat-fabric-mesh" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.6" fill="#000" opacity="0.1" />
        </pattern>
        <linearGradient id="fabric-shading-front" x1="0" y1="0" x2="1" y2="0.1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.3" />
          <stop offset="15%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#000000" stopOpacity="0.0" />
          <stop offset="85%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Sleeve Left */}
      <path d="M 155,70 L 105,115 L 120,135 L 135,130 Z" fill="var(--sleeves-color)" />
      <path d="M 105,115 L 120,135" stroke="var(--collar-color)" strokeWidth="4" strokeLinecap="round" />

      {/* Sleeve Right */}
      <path d="M 285,70 L 335,115 L 320,135 L 305,130 Z" fill="var(--sleeves-color)" />
      <path d="M 335,115 L 320,135" stroke="var(--collar-color)" strokeWidth="4" strokeLinecap="round" />

      {/* Body */}
      <g clipPath="url(#front-body-clip)">
        <rect x="100" y="50" width="240" height="250" fill="var(--primary-color)" />

        {patternFill && (
          <rect x="100" y="50" width="240" height="250" fill={patternFill} />
        )}
        {kit.pattern === 'sash' && (
          <path d="M 155,70 L 195,70 L 305,280 L 265,280 Z" fill="var(--secondary-color)" />
        )}
        {kit.pattern === 'split' && (
          <rect x="220" y="50" width="100" height="250" fill="var(--secondary-color)" />
        )}

        <rect x="100" y="50" width="240" height="250" fill="url(#pat-fabric-mesh)" />
        <rect x="100" y="50" width="240" height="250" fill="url(#fabric-shading-front)" pointerEvents="none" style={{ mixBlendMode: 'multiply' }} />
        <path d="M 155,70 C 185,90 180,200 180,270" fill="none" stroke="#ffffff" strokeWidth="6" opacity="0.1" />
      </g>

      {/* V-Collar */}
      <path d="M 185,76 Q 220,110 255,76 L 245,71 Q 220,95 195,71 Z" fill="var(--collar-color)" />

      {/* Chest crest + number */}
      <circle cx="175" cy="115" r="11" fill="none" stroke="var(--text-color)" strokeWidth="2" />
      <path d="M 170,115 Q 175,123 180,115 M 175,107 L 175,123" fill="none" stroke="var(--text-color)" strokeWidth="1.5" />
      <path d="M 255,111 Q 263,113 266,108 Q 260,119 252,117 Z" fill="var(--text-color)" />
      <text x="220" y="175" textAnchor="middle" fill="var(--text-color)" fontSize="38" fontWeight="bold" fontFamily="'Teko', sans-serif">10</text>

      {/* Shorts */}
      <path d="M 165,280 L 150,370 L 215,370 L 220,330 L 225,370 L 290,370 L 275,280 Z" fill="var(--shorts-color)" />
      <path d="M 165,280 Q 220,290 275,280 L 273,288 Q 220,298 167,288 Z" fill="var(--shorts-color)" opacity="0.9" />
      <path d="M 150,370 L 215,370" stroke="var(--shorts-trim-color)" strokeWidth="5" strokeLinecap="round" />
      <path d="M 290,370 L 225,370" stroke="var(--shorts-trim-color)" strokeWidth="5" strokeLinecap="round" />

      {/* Socks */}
      <rect x="162" y="390" width="26" height="85" rx="4" fill="var(--socks-color)" />
      <rect x="162" y="390" width="26" height="10" fill="var(--socks-trim-color)" />
      <rect x="252" y="390" width="26" height="85" rx="4" fill="var(--socks-color)" />
      <rect x="252" y="390" width="26" height="10" fill="var(--socks-trim-color)" />
    </svg>
  );
}
