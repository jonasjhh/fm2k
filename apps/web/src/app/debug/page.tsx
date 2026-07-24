'use client';

import { useState, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Link from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '@fm2k/design-system';
import {
  DuelMatchSimulator, mulberry32, selectStartingXIWithSlots, NEUTRAL_MATCH_FORM,
  slotGeometryFromFormation,
} from '@fm2k/engine';
import type {
  Team, Player, PlayerPosition, Formation, PlayerGeometry,
  MatchState, BallState, XY, MatchEvent,
} from '@fm2k/engine';

const theme = createAppTheme('light');

const FORMATIONS: Formation[] = [
  '4-4-2', '4-3-3', '4-5-1', '4-2-3-1', '4-1-4-1', '4-4-1-1', '4-2-4',
  '3-5-2', '3-4-3', '3-4-2-1', '5-3-2', '5-4-1',
];

const SQUAD_POSITIONS: PlayerPosition[] = [
  'GK', 'GK', 'LB', 'RB', 'CB', 'CB', 'CB', 'CM', 'CM', 'CM', 'CM',
  'CM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'ST',
];

const BAND_Y: Record<string, number> = {
  GK: 0.04, DEF: 0.2, DM: 0.34, MID: 0.5, AM: 0.66, ATT: 0.82,
};

function slotToXY(g: PlayerGeometry, side: 'home' | 'away'): XY {
  const x = (g.lateral + 1) / 2;
  const yTeam = BAND_Y[g.band] ?? 0.5;
  return { x, y: side === 'away' ? 1 - yTeam : yTeam };
}

interface SideConfig {
  strength: number;
  defFormation: Formation;
  atkFormation: Formation;
}

interface TickSnapshot {
  positions: { home: Record<string, XY>; away: Record<string, XY> };
  ball: BallState;
}

function makeTeam(id: string, cfg: SideConfig): { team: Team; starters: Player[] } {
  const squad: Player[] = SQUAD_POSITIONS.map((position, i) => ({
    id: `${id}-${i}`, name: `${id.slice(0, 1)}${i}`, nationality: 'n', age: 25, position, potential: 80,
    attributes: {
      speed: cfg.strength, strength: cfg.strength, stamina: cfg.strength, passing: cfg.strength,
      technique: cfg.strength, finishing: cfg.strength, defending: cfg.strength, goalkeeping: cfg.strength,
    },
  }));
  const { starters } = selectStartingXIWithSlots(squad, cfg.defFormation);
  const shapes = {
    defending: slotGeometryFromFormation(cfg.defFormation),
    attacking: slotGeometryFromFormation(cfg.atkFormation),
  };
  return {
    team: {
      id, name: id, formation: cfg.defFormation, squad, shapes,
      colors: { primary: '#fff', secondary: '#000' },
    },
    starters,
  };
}

function carrierXY(ball: BallState, positions: { home: Record<string, XY>; away: Record<string, XY> }): XY | null {
  if (ball.mode !== 'carried') { return null; }
  return positions[ball.side][ball.carrierId] ?? null;
}

const W = 420;
const H = 280;

function PitchSvg({
  snapshot, homeStarters, awayStarters,
  homeDefSlots, homeAtkSlots, awayDefSlots, awayAtkSlots, showArrows,
}: {
  snapshot: TickSnapshot | null;
  homeStarters: Player[];
  awayStarters: Player[];
  homeDefSlots: Record<number, PlayerGeometry>;
  homeAtkSlots: Record<number, PlayerGeometry>;
  awayDefSlots: Record<number, PlayerGeometry>;
  awayAtkSlots: Record<number, PlayerGeometry>;
  showArrows: boolean;
}) {
  const positions = snapshot?.positions ?? null;
  const ball = snapshot?.ball ?? null;
  const ballPos = ball && positions
    ? (ball.mode === 'free' ? ball.at : carrierXY(ball, positions))
    : null;

  function arrows(
    starters: Player[],
    defSlots: Record<number, PlayerGeometry>,
    atkSlots: Record<number, PlayerGeometry>,
    side: 'home' | 'away',
    markerId: string,
  ) {
    return starters.slice(1).map((p, i) => {
      const slot = i + 1;
      const def = defSlots[slot];
      const atk = atkSlots[slot];
      if (!def || !atk) { return null; }
      const from = slotToXY(def, side);
      const to = slotToXY(atk, side);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) { return null; }
      const shorten = 8 / Math.max(len * W, 1);
      return (
        <line key={p.id}
          x1={from.x * W} y1={from.y * H}
          x2={(to.x - dx * shorten) * W} y2={(to.y - dy * shorten) * H}
          stroke={side === 'home' ? '#90caf9' : '#ef9a9a'}
          strokeWidth={1.5} opacity={0.75}
          markerEnd={`url(#${markerId})`}
        />
      );
    });
  }

  return (
    <svg width={W} height={H} style={{ display: 'block', border: '1px solid #ccc', background: '#2d7a2d' }}>
      <defs>
        <marker id="arr-home" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#90caf9" />
        </marker>
        <marker id="arr-away" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#ef9a9a" />
        </marker>
      </defs>
      <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="white" strokeWidth={1} />
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="white" strokeWidth={1} />
      <circle cx={W / 2} cy={H / 2} r={32} fill="none" stroke="white" strokeWidth={1} />
      <rect x={W * 0.2} y={0} width={W * 0.6} height={H * 0.17} fill="none" stroke="white" strokeWidth={1} />
      <rect x={W * 0.2} y={H * 0.83} width={W * 0.6} height={H * 0.17} fill="none" stroke="white" strokeWidth={1} />

      {showArrows && arrows(homeStarters, homeDefSlots, homeAtkSlots, 'home', 'arr-home')}
      {showArrows && arrows(awayStarters, awayDefSlots, awayAtkSlots, 'away', 'arr-away')}

      {positions && homeStarters.map(p => {
        const pos = positions.home[p.id];
        if (!pos) { return null; }
        return (
          <g key={p.id}>
            <circle cx={pos.x * W} cy={pos.y * H} r={6} fill="#2196f3" stroke="white" strokeWidth={1} />
            <title>{p.name}</title>
          </g>
        );
      })}
      {positions && awayStarters.map(p => {
        const pos = positions.away[p.id];
        if (!pos) { return null; }
        return (
          <g key={p.id}>
            <circle cx={pos.x * W} cy={pos.y * H} r={6} fill="#f44336" stroke="white" strokeWidth={1} />
            <title>{p.name}</title>
          </g>
        );
      })}
      {ballPos && (
        <circle cx={ballPos.x * W} cy={ballPos.y * H} r={5} fill="yellow" stroke="#333" strokeWidth={1} />
      )}
    </svg>
  );
}

function SidePanel({ label, cfg, onChange }: { label: string; cfg: SideConfig; onChange: (c: SideConfig) => void }) {
  const set = <K extends keyof SideConfig>(k: K, v: SideConfig[K]) => onChange({ ...cfg, [k]: v });
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 240 }}>
      <Typography variant="h6" gutterBottom>{label}</Typography>
      <Typography variant="caption">Strength: {cfg.strength}</Typography>
      <Slider size="small" min={1} max={99} value={cfg.strength}
        onChange={(_, v) => set('strength', v as number)} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Defensive shape</Typography>
          <Select size="small" fullWidth value={cfg.defFormation}
            onChange={e => set('defFormation', e.target.value as Formation)}>
            {FORMATIONS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </Select>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Attacking shape</Typography>
          <Select size="small" fullWidth value={cfg.atkFormation}
            onChange={e => set('atkFormation', e.target.value as Formation)}>
            {FORMATIONS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </Select>
        </Box>
      </Box>
    </Paper>
  );
}

export default function DebugPage() {
  const [home, setHome] = useState<SideConfig>({ strength: 60, defFormation: '4-4-2', atkFormation: '4-2-4' });
  const [away, setAway] = useState<SideConfig>({ strength: 60, defFormation: '4-5-1', atkFormation: '4-3-3' });
  const [showArrows, setShowArrows] = useState(true);

  // Sim is created once per "Start match"; onTick pushes into this mutable ref.
  const simRef = useRef<DuelMatchSimulator | null>(null);
  const tickCollector = useRef<TickSnapshot[]>([]);

  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [minuteEvents, setMinuteEvents] = useState<MatchEvent[]>([]);
  const [homeStarters, setHomeStarters] = useState<Player[]>([]);
  const [awayStarters, setAwayStarters] = useState<Player[]>([]);
  const [homeShapes, setHomeShapes] = useState({ def: slotGeometryFromFormation('4-4-2'), atk: slotGeometryFromFormation('4-2-4') });
  const [awayShapes, setAwayShapes] = useState({ def: slotGeometryFromFormation('4-5-1'), atk: slotGeometryFromFormation('4-3-3') });
  const [done, setDone] = useState(false);
  const [seed, setSeed] = useState(1);

  // Tick-level navigation within the current minute.
  const [tickSnapshots, setTickSnapshots] = useState<TickSnapshot[]>([]);
  const [tickIndex, setTickIndex] = useState(0);

  // What the pitch currently shows — either the current tick or the pre-match blank.
  const currentSnapshot: TickSnapshot | null = tickSnapshots.length > 0
    ? tickSnapshots[tickIndex]
    : null;

  const startMatch = () => {
    tickCollector.current = [];
    const h = makeTeam('Home', home);
    const a = makeTeam('Away', away);
    const sim = new DuelMatchSimulator({
      matchDuration: 90,
      eventsPerMinute: 13,
      homeTeam: h.team,
      awayTeam: a.team,
      homeStarters: h.starters,
      awayStarters: a.starters,
      homeForm: NEUTRAL_MATCH_FORM,
      awayForm: NEUTRAL_MATCH_FORM,
      rng: mulberry32(seed),
      onTick: snap => tickCollector.current.push(snap),
    });
    simRef.current = sim;
    setHomeStarters(h.starters);
    setAwayStarters(a.starters);
    setHomeShapes({ def: slotGeometryFromFormation(home.defFormation), atk: slotGeometryFromFormation(home.atkFormation) });
    setAwayShapes({ def: slotGeometryFromFormation(away.defFormation), atk: slotGeometryFromFormation(away.atkFormation) });
    setMatchState(sim.getCurrentState());
    setTickSnapshots([]);
    setTickIndex(0);
    setMinuteEvents([]);
    setDone(false);
  };

  const stepMinute = () => {
    const sim = simRef.current;
    if (!sim || !matchState || done) { return; }
    tickCollector.current = [];
    const { events, nextState } = sim.simulateMinute(matchState);
    const snaps = [...tickCollector.current];
    setTickSnapshots(snaps);
    setTickIndex(0);
    setMatchState(nextState);
    setMinuteEvents(events);
    if (nextState.phase === 'full_time' || nextState.phase === 'extra_time_full') { setDone(true); }
  };

  const playToEnd = () => {
    const sim = simRef.current;
    if (!sim || !matchState || done) { return; }
    let current = matchState;
    let lastEvents: MatchEvent[] = [];
    tickCollector.current = [];
    while (current.phase !== 'full_time' && current.phase !== 'extra_time_full') {
      const { events, nextState } = sim.simulateMinute(current);
      current = nextState;
      lastEvents = events;
    }
    const snaps = [...tickCollector.current];
    setTickSnapshots(snaps);
    setTickIndex(snaps.length > 0 ? snaps.length - 1 : 0);
    setMatchState(current);
    setMinuteEvents(lastEvents);
    setDone(true);
  };

  const scoreLabel = matchState
    ? `Home ${matchState.homeScore} – ${matchState.awayScore} Away | Minute ${matchState.minute}`
    : 'Not started';

  const hasTicks = tickSnapshots.length > 0;
  const ball = currentSnapshot?.ball ?? null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
        <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>Back</Button>
        <Typography variant="h4" gutterBottom>Match step-through debugger</Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'flex-start' }}>
          <SidePanel label="Home" cfg={home} onChange={setHome} />
          <SidePanel label="Away" cfg={away} onChange={setAway} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center' }}>
            <Typography variant="caption">Seed: {seed}</Typography>
            <Slider size="small" min={1} max={999} value={seed}
              onChange={(_, v) => setSeed(v as number)} sx={{ width: 120 }} />
            <Button variant="contained" onClick={startMatch}>Start match</Button>
            <FormControlLabel
              control={<Switch size="small" checked={showArrows} onChange={e => setShowArrows(e.target.checked)} />}
              label={<Typography variant="caption">Shape arrows</Typography>}
            />
          </Box>
        </Box>

        {matchState && (
          <>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {scoreLabel}{done ? ' — Full time' : ''}
            </Typography>

            {/* Minute controls */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="outlined" onClick={stepMinute} disabled={done}>Step minute</Button>
              <Button variant="outlined" onClick={playToEnd} disabled={done}>Play to end</Button>
            </Box>

            {/* Tick controls — visible once a minute has been stepped */}
            {hasTicks && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                <Button size="small" variant="outlined"
                  disabled={tickIndex === 0}
                  onClick={() => setTickIndex(i => i - 1)}>← Prev tick</Button>
                <Typography variant="body2" sx={{ minWidth: 90, textAlign: 'center' }}>
                  Tick {tickIndex + 1} / {tickSnapshots.length}
                </Typography>
                <Button size="small" variant="outlined"
                  disabled={tickIndex === tickSnapshots.length - 1}
                  onClick={() => setTickIndex(i => i + 1)}>Next tick →</Button>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Box>
                <PitchSvg
                  snapshot={currentSnapshot}
                  homeStarters={homeStarters}
                  awayStarters={awayStarters}
                  homeDefSlots={homeShapes.def}
                  homeAtkSlots={homeShapes.atk}
                  awayDefSlots={awayShapes.def}
                  awayAtkSlots={awayShapes.atk}
                  showArrows={showArrows}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Blue = home · Red = away · Yellow = ball
                  {showArrows ? ' · Arrows: def → atk shape' : ''}
                </Typography>
                {ball && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Ball: {ball.mode === 'carried'
                      ? `carried by ${ball.carrierId} (${ball.side})`
                      : `free at (${ball.at.x.toFixed(2)}, ${ball.at.y.toFixed(2)})`}
                  </Typography>
                )}
              </Box>

              <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 260, maxHeight: H, overflowY: 'auto' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Minute {matchState.minute} events ({minuteEvents.length})
                </Typography>
                <Divider sx={{ mb: 1 }} />
                {minuteEvents.length === 0
                  ? <Typography variant="body2" color="text.secondary">No events this minute</Typography>
                  : minuteEvents.slice().reverse().map((e, i) => (
                    <Typography key={i} variant="body2" sx={{ py: 0.15 }}>
                      <b>[{e.team}]</b> {e.type} — {e.description}
                    </Typography>
                  ))}
              </Paper>
            </Box>
          </>
        )}
      </Box>
    </ThemeProvider>
  );
}
