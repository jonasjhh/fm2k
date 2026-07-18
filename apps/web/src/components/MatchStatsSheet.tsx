import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { MatchStatistics, TeamColors } from '@fm2k/engine';

/** What the ratings list needs to render a player pill: who, where they play
 *  (their effective role, e.g. RWB), and which shirt they wear. */
export interface RatedPlayerInfo {
  name: string;
  position: string;
  colors?: TeamColors;
}

interface Props {
  statistics: MatchStatistics;
  homeName: string;
  awayName: string;
  /** Section heading, e.g. "Match stats" or "First-half stats". */
  title: string;
  /** Resolve a player id for the ratings list; the raw id is shown when unknown. */
  resolvePlayer?: (playerId: string) => RatedPlayerInfo | undefined;
  /** Start with the player ratings section expanded. */
  defaultShowRatings?: boolean;
}

function StatRow({ label, home, away, suffix = '' }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away;
  const homeShare = total === 0 ? 0.5 : home / total;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 36 }}>{home}{suffix}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{away}{suffix}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, height: 6 }}>
        <Box sx={{ flex: Math.max(homeShare, 0.02), bgcolor: 'secondary.main', borderRadius: 3 }} />
        <Box sx={{ flex: Math.max(1 - homeShare, 0.02), bgcolor: 'action.disabled', borderRadius: 3 }} />
      </Box>
    </Box>
  );
}

const completionPct = (t: { attempted: number; completed: number }): number =>
  t.attempted === 0 ? 0 : Math.round((t.completed / t.attempted) * 100);

/** Two-column mirrored match statistics, with a collapsible player-ratings list. */
export default function MatchStatsSheet({ statistics: s, homeName, awayName, title, resolvePlayer, defaultShowRatings = false }: Props) {
  const [showRatings, setShowRatings] = useState(defaultShowRatings);
  const ratings = Object.entries(s.playerRatings).sort((a, b) => b[1] - a[1]);

  return (
    <Box sx={{ p: 1.5 }} data-testid="match-stats-sheet">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '30%' }}>{homeName}</Typography>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.3 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '30%' }}>{awayName}</Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <StatRow label="Possession" home={s.possession.home} away={s.possession.away} suffix="%" />
        <StatRow label="Shots" home={s.shots.home} away={s.shots.away} />
        <StatRow label="On target" home={s.shotsOnTarget.home} away={s.shotsOnTarget.away} />
        <StatRow label="Pass completion" home={completionPct(s.passes.home)} away={completionPct(s.passes.away)} suffix="%" />
        <StatRow label="Corners" home={s.corners.home} away={s.corners.away} />
        <StatRow label="Fouls" home={s.fouls.home} away={s.fouls.away} />
        <StatRow label="Yellow cards" home={s.cards.yellow.home} away={s.cards.yellow.away} />
        {(s.cards.red.home > 0 || s.cards.red.away > 0) && (
          <StatRow label="Red cards" home={s.cards.red.home} away={s.cards.red.away} />
        )}
        {s.duelsWon && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textAlign: 'center', mt: 0.5 }}>
              Duels won
            </Typography>
            <StatRow label="Foot races" home={s.duelsWon.home.speed} away={s.duelsWon.away.speed} />
            <StatRow label="Physical battles" home={s.duelsWon.home.strength} away={s.duelsWon.away.strength} />
            <StatRow label="One-on-ones" home={s.duelsWon.home.dribble} away={s.duelsWon.away.dribble} />
            <StatRow label="Passing lanes" home={s.duelsWon.home.pass} away={s.duelsWon.away.pass} />
          </>
        )}
      </Box>

      {ratings.length > 0 && (
        <>
          <Button size="small" sx={{ mt: 1 }} onClick={() => setShowRatings(v => !v)}
            endIcon={showRatings ? <ExpandLessIcon /> : <ExpandMoreIcon />}>
            Player ratings
          </Button>
          <Collapse in={showRatings}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pt: 0.5 }}>
              {ratings.map(([id, rating]) => {
                const info = resolvePlayer?.(id);
                const label = info ? `${info.name} · ${info.position} · ${rating.toFixed(1)}` : `${id} · ${rating.toFixed(1)}`;
                // Team colours on the pill so the sides are tellable apart at a glance.
                const sx = info?.colors
                  ? { bgcolor: info.colors.primary, color: info.colors.secondary, borderColor: info.colors.secondary, fontWeight: 600 }
                  : { fontWeight: 600 };
                return <Chip key={id} size="small" variant="outlined" label={label} sx={sx} />;
              })}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
}
