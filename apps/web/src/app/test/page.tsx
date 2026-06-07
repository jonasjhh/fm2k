'use client';

import { useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import Link from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  PlayerGenerator, MatchOccurrence, TickEngine, EventLog,
  createGameDateTime, calculateOverall,
} from '@fm2k/engine';
import type { Team, MatchState, OccurrenceEvent } from '@fm2k/engine';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '../../theme';

const KICK_OFF = createGameDateTime(2025, 8, 15, 15, 0);

function makeTeam(id: string, name: string, formation: string, positions: string[]): Team {
  const gen = new PlayerGenerator();
  return {
    id,
    name,
    formation: formation as Team['formation'],
    colors: { primary: '#FFFFFF', secondary: '#000000' },
    starters: positions.map((pos) => gen.generatePlayer(pos as Parameters<typeof gen.generatePlayer>[0])),
    substitutes: ['GK', 'CB', 'CM', 'ST'].map(
      (pos) => gen.generatePlayer(pos as Parameters<typeof gen.generatePlayer>[0]),
    ),
  };
}

type Phase = 'idle' | 'ready' | 'running' | 'done';

interface DisplayState {
  score: { home: number; away: number };
  minute: number;
  phase: string;
  homeTeam: string;
  awayTeam: string;
}

function eventColor(type: string) {
  if (type === 'goal') return '#C8E6C9';
  if (type === 'yellow_card') return '#FFF9C4';
  if (type === 'red_card') return '#FFCDD2';
  if (type === 'half_time' || type === 'full_time') return '#BBDEFB';
  return undefined;
}

export default function MatchTestPage() {
  const tickEngineRef = useRef<InstanceType<typeof TickEngine> | null>(null);
  const matchRef = useRef<InstanceType<typeof MatchOccurrence> | null>(null);
  const homeTeamRef = useRef<Team | null>(null);
  const awayTeamRef = useRef<Team | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [display, setDisplay] = useState<DisplayState | null>(null);
  const [events, setEvents] = useState<OccurrenceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshDisplay = useCallback(() => {
    const match = matchRef.current;
    if (!match) return;
    const state: MatchState = match.getMatchState();
    setDisplay({
      score: { home: state.homeScore, away: state.awayScore },
      minute: state.minute,
      phase: state.phase.replace('_', ' '),
      homeTeam: state.homeTeam.name,
      awayTeam: state.awayTeam.name,
    });
  }, []);

  const generateTeams = useCallback(() => {
    setError(null);
    homeTeamRef.current = makeTeam('home', 'FC Home United', '4-4-2',
      ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST']);
    awayTeamRef.current = makeTeam('away', 'AC Away City', '4-3-3',
      ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'ST', 'RW']);
    setPhase('ready');
    setDisplay(null);
    setEvents([]);
  }, []);

  const startMatch = useCallback(() => {
    if (!homeTeamRef.current || !awayTeamRef.current) return;
    setError(null);
    try {
      const eventLog = new EventLog();
      const engine = new TickEngine({ startTime: KICK_OFF, eventLog });
      const match = new MatchOccurrence({
        id: 'test-match',
        scheduledTime: KICK_OFF,
        homeTeam: homeTeamRef.current,
        awayTeam: awayTeamRef.current,
        eventsPerMinute: 3,
      });
      engine.schedule(match);
      tickEngineRef.current = engine;
      matchRef.current = match;
      setEvents([]);
      setPhase('running');
      refreshDisplay();
    } catch (e) {
      setError(String(e));
    }
  }, [refreshDisplay]);

  const step = useCallback(async (until?: 'half_time' | 'full_time') => {
    const engine = tickEngineRef.current;
    if (!engine) return;
    setError(null);
    try {
      const newEvents: OccurrenceEvent[] = [];
      do {
        if (!engine.hasNext()) break;
        const result = await engine.tickToNext();
        if (!result) break;
        newEvents.push(...result.events);
        if (until && newEvents.some((e) => e.eventType === until)) break;
      } while (until);

      setEvents((prev) => [...prev, ...newEvents]);
      refreshDisplay();

      if (!engine.hasNext()) setPhase('done');
    } catch (e) {
      setError(String(e));
    }
  }, [refreshDisplay]);

  const reset = useCallback(() => {
    tickEngineRef.current = null;
    matchRef.current = null;
    homeTeamRef.current = null;
    awayTeamRef.current = null;
    setPhase('idle');
    setDisplay(null);
    setEvents([]);
    setError(null);
  }, []);

  const homeOvr = homeTeamRef.current
    ? Math.round(homeTeamRef.current.starters.reduce((s, p) => s + calculateOverall(p.attributes), 0) / 11)
    : null;
  const awayOvr = awayTeamRef.current
    ? Math.round(awayTeamRef.current.starters.reduce((s, p) => s + calculateOverall(p.attributes), 0) / 11)
    : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
            <ArrowBackIcon fontSize="small" />
          </Link>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Match Simulator Test</Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Controls */}
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="contained" onClick={generateTeams}>
                Generate Teams
              </Button>
              <Button variant="contained" color="success" disabled={phase !== 'ready'} onClick={startMatch}>
                Start Match
              </Button>
              <ButtonGroup disabled={phase !== 'running'} variant="outlined">
                <Button onClick={() => step()}>Step</Button>
                <Button onClick={() => step('half_time')}>→ Half Time</Button>
                <Button onClick={() => step('full_time')}>→ Full Time</Button>
              </ButtonGroup>
              <Button variant="outlined" color="error" onClick={reset}>
                Reset
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Teams */}
        {homeTeamRef.current && awayTeamRef.current && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { team: homeTeamRef.current, ovr: homeOvr, side: 'Home' },
              { team: awayTeamRef.current, ovr: awayOvr, side: 'Away' },
            ].map(({ team, ovr, side }) => (
              <Grid size={{ xs: 12, sm: 6 }} key={side}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{team.name}</Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip label={side} size="small" color={side === 'Home' ? 'primary' : 'secondary'} />
                        <Chip label={team.formation} size="small" variant="outlined" />
                        <Chip label={`OVR ${ovr}`} size="small" variant="outlined" />
                      </Box>
                    </Box>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell align="center">Pos</TableCell>
                          <TableCell align="center">OVR</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {team.starters.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{p.name}</TableCell>
                            <TableCell align="center"><Chip label={p.position} size="small" variant="outlined" /></TableCell>
                            <TableCell align="center">{Math.round(calculateOverall(p.attributes))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Scoreboard */}
        {display && (
          <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {display.homeTeam} {display.score.home} – {display.score.away} {display.awayTeam}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                <Chip label={`${display.minute}'`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
                <Chip label={display.phase} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
                {phase === 'done' && <Chip label="Full Time" color="warning" />}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Event Log */}
        {events.length > 0 && (
          <Paper variant="outlined">
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Event Log ({events.length} events)
              </Typography>
            </Box>
            <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {events.map((e, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    px: 2,
                    py: 0.75,
                    bgcolor: eventColor(e.eventType),
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    alignItems: 'flex-start',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, pt: 0.25 }}>
                    {e.timestamp ? `${e.timestamp.hour}:${String(e.timestamp.minute).padStart(2, '0')}` : ''}
                  </Typography>
                  <Chip label={e.eventType.replace(/_/g, ' ')} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
                  <Typography variant="body2">{String(e.payload.description ?? '')}</Typography>
                </Box>
              ))}
            </Box>
            <Divider />
            <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
              {['goal', 'yellow_card', 'red_card', 'half_time'].map((t) => (
                <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: eventColor(t) ?? '#eee' }} />
                  <Typography variant="caption">{t.replace(/_/g, ' ')}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}
      </Box>
    </ThemeProvider>
  );
}
