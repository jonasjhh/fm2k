import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { ArticleCategory } from '@fm2k/newspaper';
import { fmtDate } from '../../utils/formatting';
import { SectionHeader } from '@fm2k/design-system';

const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  blowout: 'Result',
  upset: 'Shock Result',
  transfer: 'Transfer',
  injury: 'Injury News',
};

const CATEGORY_COLOR: Record<ArticleCategory, 'error' | 'warning' | 'success' | 'default'> = {
  blowout: 'error',
  upset: 'warning',
  transfer: 'success',
  injury: 'default',
};

/** A tab whose chrome stays in the app's normal theme — only the "newspaper" surface inside
 *  it (the sepia page) is styled as vintage print. Articles read newest-first, laid out in
 *  newspaper-style columns; each expires a week after its event date (handled server-side). */
export default function NewspaperTab() {
  const { headlines } = useGameStore(useShallow((s) => ({ headlines: s.headlines })));
  const newestFirst = [...headlines].reverse();

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
                <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                  {article.headline}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6b5d4f' }}>
                  {fmtDate(article.timestamp)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
