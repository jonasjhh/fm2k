'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { Article, ArticleCategory } from '@fm2k/newspaper';
import { fmtDate } from '../../utils/formatting';
import TeamLineupDialog from '../TeamLineupDialog';
import ScoutedPlayerModal from '../ui/ScoutedPlayerModal';

const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  blowout: 'Result',
  upset: 'Shock Result',
  transfer: 'Transfer',
  injury: 'Injury News',
  preview: 'Preview',
  form: 'Form Watch',
  discipline: 'Discipline',
};

const CATEGORY_COLOR: Record<ArticleCategory, 'error' | 'warning' | 'success' | 'info' | 'default'> = {
  blowout: 'error',
  upset: 'warning',
  transfer: 'success',
  injury: 'default',
  preview: 'info',
  form: 'info',
  discipline: 'error',
};

const LINK_SX = {
  color: '#4a2c0a',
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  cursor: 'pointer',
  fontWeight: 700,
  '&:hover': { color: '#1a0c02' },
} as const;

/** Split a headline string into segments, marking the ones that match known entity names. */
function splitHeadline(
  headline: string,
  refs: Article['refs'],
): Array<{ text: string; teamId?: string; playerId?: string }> {
  // Build a list of all known names sorted longest-first to avoid partial matches.
  const entries: Array<{ name: string; teamId?: string; playerId?: string }> = [
    ...Object.entries(refs?.teams ?? {}).map(([name, teamId]) => ({ name, teamId })),
    ...Object.entries(refs?.players ?? {}).map(([name, playerId]) => ({ name, playerId })),
  ].sort((a, b) => b.name.length - a.name.length);

  if (entries.length === 0) { return [{ text: headline }]; }

  // Walk through the headline string, consuming matches greedily.
  const result: Array<{ text: string; teamId?: string; playerId?: string }> = [];
  let remaining = headline;

  while (remaining.length > 0) {
    let matched = false;
    for (const entry of entries) {
      const idx = remaining.indexOf(entry.name);
      if (idx === -1) { continue; }
      if (idx > 0) { result.push({ text: remaining.slice(0, idx) }); }
      result.push({ text: entry.name, teamId: entry.teamId, playerId: entry.playerId });
      remaining = remaining.slice(idx + entry.name.length);
      matched = true;
      break;
    }
    if (!matched) {
      result.push({ text: remaining });
      remaining = '';
    }
  }

  return result;
}

function HeadlineText({
  article,
  onTeamClick,
  onPlayerClick,
}: {
  article: Article;
  onTeamClick: (teamId: string) => void;
  onPlayerClick: (playerId: string) => void;
}) {
  const segments = splitHeadline(article.headline, article.refs);
  return (
    <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
      {segments.map((seg, i) => {
        if (seg.teamId) {
          return (
            <Box key={i} component="span" sx={LINK_SX} onClick={() => onTeamClick(seg.teamId as string)}>
              {seg.text}
            </Box>
          );
        }
        if (seg.playerId) {
          return (
            <Box key={i} component="span" sx={LINK_SX} onClick={() => onPlayerClick(seg.playerId as string)}>
              {seg.text}
            </Box>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </Typography>
  );
}

/** A tab whose chrome stays in the app's normal theme — only the "newspaper" surface inside
 *  it (the sepia page) is styled as vintage print. Articles read newest-first, laid out in
 *  newspaper-style columns; each expires a week after its event date (handled server-side). */
export default function NewspaperTab() {
  const { headlines, editableCountries } = useGameStore(useShallow((s) => ({
    headlines: s.headlines,
    editableCountries: s.editableCountries,
  })));
  const newestFirst = [...headlines].reverse();

  const [teamDialogId, setTeamDialogId] = useState<string | null>(null);
  const [playerDialogId, setPlayerDialogId] = useState<string | null>(null);

  // Find the squad for a clicked player so ScoutedPlayerModal has context.
  const playerForModal = playerDialogId
    ? editableCountries.flatMap(c => c.divisions.flatMap(d => d.teams)).find(t => t.squad.some(p => p.id === playerDialogId))
    : null;

  return (
    <Box>
      <Paper
        elevation={3}
        sx={{
          bgcolor: '#f4ecd8',
          color: '#2b2118',
          p: { xs: 2, sm: 3 },
          border: '1px solid #c9b896',
          borderRadius: 0,
        }}
      >
        <Typography
          variant="h4"
          align="center"
          sx={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 800, letterSpacing: 1 }}
        >
          THE WEEKLY FOOTBALL TIMES
        </Typography>
        <Box sx={{ borderTop: '3px double #2b2118', borderBottom: '1px solid #2b2118', my: 1.5 }} />

        {newestFirst.length === 0 ? (
          <Typography align="center" sx={{ fontFamily: 'Georgia, serif', py: 4, fontStyle: 'italic' }}>
            No news to report this week. Quiet on all fronts.
          </Typography>
        ) : (
          <Box sx={{ columns: { xs: 1, sm: 2, md: 3 }, columnGap: '2rem' }}>
            {newestFirst.map((article) => (
              <Box
                key={article.id}
                sx={{
                  breakInside: 'avoid',
                  mb: 2.5,
                  pb: 1.5,
                  borderBottom: '1px solid #c9b896',
                  fontFamily: 'Georgia, serif',
                }}
              >
                <Chip
                  label={CATEGORY_LABEL[article.category]}
                  color={CATEGORY_COLOR[article.category]}
                  size="small"
                  sx={{ mb: 0.5, fontWeight: 700 }}
                />
                <HeadlineText
                  article={article}
                  onTeamClick={setTeamDialogId}
                  onPlayerClick={setPlayerDialogId}
                />
                <Typography variant="caption" sx={{ color: '#6b5d4f' }}>
                  {fmtDate(article.timestamp)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <TeamLineupDialog teamId={teamDialogId} onClose={() => setTeamDialogId(null)} />

      {playerForModal && (
        <ScoutedPlayerModal
          squad={playerForModal.squad}
          playerId={playerDialogId}
          onClose={() => setPlayerDialogId(null)}
          teamId={playerForModal.id}
          isOwnTeam={false}
        />
      )}
    </Box>
  );
}
