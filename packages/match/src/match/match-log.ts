import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import { isTerminalPhase, type MatchConfig, type MatchEvent } from './types.ts';
import type { BallState } from './duel/flow.ts';
import type { XY } from './duel/field.ts';

export interface TickSnapshot {
  positions: { home: Record<string, XY>; away: Record<string, XY> };
  ball: BallState;
}

export interface MatchMinuteLog {
  minute: number;
  events: MatchEvent[];
  ticks: TickSnapshot[];
  positionsAfter: { home: Record<string, XY>; away: Record<string, XY> };
  ballAfter: BallState;
}

export type MatchLog = MatchMinuteLog[];

export function createMatchLog(config: MatchConfig): MatchLog {
  const log: MatchLog = [];
  let tickBuffer: TickSnapshot[] = [];

  const sim = new DuelMatchSimulator({
    ...config,
    onTick: (snap) => {
      tickBuffer.push({ positions: snap.positions, ball: { ...snap.ball } });
    },
  });
  let state = sim.getCurrentState();

  while (!isTerminalPhase(state.phase)) {
    tickBuffer = [];
    const { events, nextState } = sim.simulateMinute(state);
    const { positions, ball } = sim.getLiveState();
    log.push({
      minute: nextState.minute,
      events,
      ticks: tickBuffer,
      positionsAfter: positions,
      ballAfter: ball,
    });
    state = nextState;
  }

  return log;
}
