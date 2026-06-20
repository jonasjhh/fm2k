'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Divider from '@mui/material/Divider';
import Link from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '@fm2k/design-system';
import {
  simulateMatch, runDistribution, mulberry32, selectStartingXIWithSlots,
  STYLE_TENDENCIES, TACTICAL_STYLE_IDS,
} from '@fm2k/engine';
import type {
  Team, Player, PlayerPosition, Formation, TacticalStyleId, TeamTacticsIntent,
  SimulateMatchResult, DistributionResult, PlayerMatchUpdate, InjuryReport,
} from '@fm2k/engine';

function hasInjury(u: PlayerMatchUpdate): u is PlayerMatchUpdate & { injury: InjuryReport } {
  return !!u.injury;
}

const theme = createAppTheme('light');

const FORMATIONS: Formation[] = [
  '4-4-2', '4-3-3', '4-5-1', '4-2-3-1', '4-1-4-1', '4-4-1-1', '4-2-4',
  '3-5-2', '3-4-3', '3-4-2-1', '5-3-2', '5-4-1',
];

// A generous squad at a uniform strength; selectStartingXIWithSlots picks the XI for the formation.
const SQUAD_POSITIONS: PlayerPosition[] = [
  'GK', 'GK', 'LB', 'RB', 'CB', 'CB', 'CB', 'CM', 'CM', 'CM', 'CM',
  'CM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'ST',
];

function makeTeam(id: string, strength: number, formation: Formation): { team: Team; starters: Player[] } {
  const squad: Player[] = SQUAD_POSITIONS.map((position, i) => ({
    id: `${id}-${i}`, name: `${id} ${i}`, nationality: 'n', age: 25, position, potential: 80,
    attributes: {
      speed: strength, strength, agility: strength, passing: strength, finishing: strength,
      technique: strength, defending: strength, stamina: strength, awareness: strength, composure: strength,
    },
  }));
  const { starters } = selectStartingXIWithSlots(squad, formation);
  return { team: { id, name: id, formation, squad, colors: { primary: '#fff', secondary: '#000' } }, starters };
}

interface SideState {
  strength: number;
  formation: Formation;
  style: TacticalStyleId;
  tempo: number;
  risk: number;
  defensiveLine: number;
}

const defaultSide = (strength: number, formation: Formation): SideState =>
  ({ strength, formation, style: 'balanced', tempo: 50, risk: 50, defensiveLine: 50 });

const intentOf = (s: SideState): TeamTacticsIntent =>
  ({ formation: s.formation, style: s.style, sliders: { tempo: s.tempo, risk: s.risk, defensiveLine: s.defensiveLine } });

function SidePanel({ label, side, onChange }: { label: string; side: SideState; onChange: (s: SideState) => void }) {
  const set = <K extends keyof SideState>(k: K, v: SideState[K]) => onChange({ ...side, [k]: v });
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 260 }}>
      <Typography variant="h6" gutterBottom>{label}</Typography>
      <Typography variant="caption" color="text.secondary">Squad strength: {side.strength}</Typography>
      <Slider size="small" min={1} max={99} value={side.strength} onChange={(_, v) => set('strength', v as number)} />
      <Box sx={{ display: 'flex', gap: 1, my: 1 }}>
        <Select size="small" fullWidth value={side.formation} onChange={e => set('formation', e.target.value as Formation)}>
          {FORMATIONS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
        </Select>
        <Select size="small" fullWidth value={side.style} onChange={e => set('style', e.target.value as TacticalStyleId)}>
          {TACTICAL_STYLE_IDS.map(s => <MenuItem key={s} value={s}>{STYLE_TENDENCIES[s].label}</MenuItem>)}
        </Select>
      </Box>
      {(['tempo', 'risk', 'defensiveLine'] as const).map(k => (
        <Box key={k}>
          <Typography variant="caption" color="text.secondary">{k}: {side[k]}</Typography>
          <Slider size="small" min={0} max={100} value={side[k]} onChange={(_, v) => set(k, v as number)} />
        </Box>
      ))}
    </Paper>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 90 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

export default function MatchSandboxPage() {
  const [home, setHome] = useState<SideState>(defaultSide(60, '4-4-2'));
  const [away, setAway] = useState<SideState>(defaultSide(55, '4-3-3'));
  const [single, setSingle] = useState<SimulateMatchResult | null>(null);
  const [dist, setDist] = useState<DistributionResult | null>(null);
  const [seed, setSeed] = useState(1);

  const homeSide = useMemo(() => makeTeam('Home', home.strength, home.formation), [home.strength, home.formation]);
  const awaySide = useMemo(() => makeTeam('Away', away.strength, away.formation), [away.strength, away.formation]);

  const runOne = () => {
    const s = seed + 1; setSeed(s);
    setSingle(simulateMatch({
      home: { team: homeSide.team, starters: homeSide.starters, intent: intentOf(home) },
      away: { team: awaySide.team, starters: awaySide.starters, intent: intentOf(away) },
      rng: mulberry32(s),
    }));
  };

  const runMany = (n: number) => {
    setDist(runDistribution({
      home: { team: homeSide.team, starters: homeSide.starters, intent: intentOf(home) },
      away: { team: awaySide.team, starters: awaySide.starters, intent: intentOf(away) },
    }, n));
  };

  const interesting = new Set(['goal', 'penalty', 'yellow_card', 'red_card', 'half_time', 'full_time']);
  const ticker = single?.events.filter(e => interesting.has(e.type)) ?? [];
  const injuries = single ? [...single.playerUpdates.home, ...single.playerUpdates.away].filter(hasInjury) : [];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
        <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>Back</Button>
        <Typography variant="h4" gutterBottom>Match simulator sandbox</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Pick each side&apos;s strength, formation, style and sliders, then simulate one match or run a 1000-match distribution.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', my: 2 }}>
          <SidePanel label="Home" side={home} onChange={setHome} />
          <SidePanel label="Away" side={away} onChange={setAway} />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Button variant="contained" onClick={runOne}>Simulate one match</Button>
          <Button variant="outlined" onClick={() => runMany(1000)}>Run 1000 (distribution)</Button>
        </Box>

        {single && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="h5" gutterBottom>
              Home {single.score.home} – {single.score.away} Away
            </Typography>
            {injuries.length > 0 && (
              <Typography variant="body2" color="error">
                Injuries: {injuries.map(u => `${u.playerId} (${u.injury.type}, ${u.injury.baseDuration})`).join(', ')}
              </Typography>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
              {ticker.map((e, i) => (
                <Typography key={i} variant="body2" sx={{ py: 0.2 }}>
                  <b>{e.minute}&apos;</b> [{e.team}] {e.description}
                </Typography>
              ))}
            </Box>
          </Paper>
        )}

        {dist && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Distribution over {dist.n} matches</Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Stat label="Goals (mean)" value={dist.goals.totalMean.toFixed(2)} />
              <Stat label="Goals (med/max)" value={`${dist.goals.totalMedian}/${dist.goals.totalMax}`} />
              <Stat label="Home / Draw / Away" value={`${(dist.homeWinPct * 100).toFixed(0)}/${(dist.drawPct * 100).toFixed(0)}/${(dist.awayWinPct * 100).toFixed(0)}%`} />
              <Stat label="Shots H–A" value={`${dist.shotsHome.toFixed(1)}–${dist.shotsAway.toFixed(1)}`} />
              <Stat label="Possession H" value={`${dist.possessionHome.toFixed(0)}%`} />
              <Stat label="Fouls" value={dist.foulsPerMatch.toFixed(1)} />
              <Stat label="Yellow / Red" value={`${dist.yellowsPerMatch.toFixed(2)} / ${dist.redsPerMatch.toFixed(3)}`} />
              <Stat label="Penalties" value={dist.penaltiesPerMatch.toFixed(2)} />
              <Stat label="Corners" value={dist.cornersPerMatch.toFixed(1)} />
              <Stat label="Injuries" value={dist.injuriesPerMatch.toFixed(2)} />
              <Stat label="End energy H–A" value={`${dist.endEnergyHome.toFixed(0)}–${dist.endEnergyAway.toFixed(0)}`} />
            </Box>
          </Paper>
        )}
      </Box>
    </ThemeProvider>
  );
}
