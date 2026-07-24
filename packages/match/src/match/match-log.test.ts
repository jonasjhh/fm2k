import { describe, it } from 'vitest';
import type { Player, PlayerAttributes, PlayerPosition, Team } from '../shared/types.ts';
import { createMatchLog } from './match-log.ts';
import type { BallState } from './duel/flow.ts';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: 10 };
}
const F: [PlayerPosition, number][] = [['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2]];
function makeTeam(id: string, v: number): Team {
  const squad: Player[] = [];
  F.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      squad.push({ id: `${id}-${pos}${i}`, name: `${id} ${pos}${i}`, nationality: 'n', age: 25, position: pos, potential: 70, attributes: attrs(v) });
    }
  });
  return { id, name: id, formation: '4-4-2', squad, colors: { primary: '#fff', secondary: '#000' } };
}

function ballStr(b: BallState): string {
  if (b.mode === 'carried') { return `carried by ${b.side}:${b.carrierId} `; }
  return `free @ (${b.at.x.toFixed(2)}, ${b.at.y.toFixed(2)})`;
}

// Diagnostic tool — run with `.only` during investigation, skipped in CI.
describe('match-log (diagnostic):', () => {
  it.skip('logs a full match tick by tick and prints penalty events', () => {
    const home = makeTeam('home', 60);
    const away = makeTeam('away', 60);
    const log = createMatchLog({
      matchDuration: 90,
      eventsPerMinute: 13,
      homeTeam: home,
      awayTeam: away,
      homeStarters: home.squad,
      awayStarters: away.squad,
      rng: mulberry32(42),
    });

    for (const frame of log) {
      const penalties = frame.events.filter(e => e.type === 'penalty');
      if (penalties.length > 0) {
        console.log(`[minute ${frame.minute}] PENALTY events:`);
        for (const p of penalties) {
          console.log('  ', JSON.stringify(p));
        }
        console.log('  ball at minute end:', JSON.stringify(frame.ballAfter));
      }
    }

    const allPenalties = log.flatMap(f => f.events.filter(e => e.type === 'penalty'));
    console.log(`Total penalty events: ${allPenalties.length} over ${log.length} minutes`);
  });

  it.skip('prints full event + tick log to investigate weird passes and transitions', () => {
    const home = makeTeam('home', 60);
    const away = makeTeam('away', 60);
    const log = createMatchLog({
      matchDuration: 90,
      eventsPerMinute: 13,
      homeTeam: home,
      awayTeam: away,
      homeStarters: home.squad,
      awayStarters: away.squad,
      rng: mulberry32(42),
    });

    let totalEvents = 0;
    let penalties = 0;
    let possessionFlips = 0;
    let hiccups = 0;
    const hiccupCauses: Record<string, number> = {};

    for (const frame of log) {
      const hasPenalty = frame.events.some(e => e.type === 'penalty');
      const hasGoal = frame.events.some(e => e.type === 'goal');
      const hasRedCard = frame.events.some(e => e.type === 'red_card');

      // Log any minute with notable events
      const notable = hasPenalty || hasGoal || hasRedCard || frame.events.length > 6;
      if (notable) {
        console.log(`\n=== MINUTE ${frame.minute} (${frame.events.length} events) ===`);
        for (const e of frame.events) {
          console.log(`  [${e.team}] ${e.type}: ${e.description}`);
          if (e.chainedEvent) {
            console.log(`    └─ chained: [${e.chainedEvent.team}] ${e.chainedEvent.type}: ${e.chainedEvent.description}`);
          }
        }
      }

      // Scan ticks for possession flips and hiccups (flip then immediate flip-back within 2 ticks)
      interface FlipRecord { tick: number; from: string; to: string; cause: string; }
      const frameFlips: FlipRecord[] = [];
      let prevTick = frame.ticks[0];
      for (let i = 1; i < frame.ticks.length; i++) {
        const curTick = frame.ticks[i];
        if (!prevTick) { prevTick = curTick; continue; }
        const prev = prevTick.ball;
        const cur = curTick.ball;

        // Possession side flip — tag with the event that caused it
        if (prev.mode === 'carried' && cur.mode === 'carried' && prev.side !== cur.side) {
          possessionFlips++;
          const cause = curTick.events.length > 0 ? curTick.events[curTick.events.length - 1].type : 'unknown';
          frameFlips.push({ tick: i, from: prev.side, to: cur.side, cause });
        }

        // Ball jumping from carried to free on other side of pitch
        if (prev.mode === 'carried' && cur.mode === 'free') {
          const dy = Math.abs(cur.at.y - (prev.side === 'home' ? 0.8 : 0.2));
          if (dy > 0.4) {
            console.log(`  [min ${frame.minute} tick ${i}] ball teleport (carried→free far end): ${ballStr(prev)} → ${ballStr(cur)}`);
          }
        }

        // Two consecutive free-ball positions that jump > 0.5 in distance
        if (prev.mode === 'free' && cur.mode === 'free') {
          const dx = cur.at.x - prev.at.x;
          const dy = cur.at.y - prev.at.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.5) {
            console.log(`  [min ${frame.minute} tick ${i}] free ball jump ${dist.toFixed(2)}: (${prev.at.x.toFixed(2)},${prev.at.y.toFixed(2)}) → (${cur.at.x.toFixed(2)},${cur.at.y.toFixed(2)})`);
          }
        }

        prevTick = curTick;
      }

      // Detect hiccups: flip A→B followed by flip B→A within 2 ticks
      for (let f = 0; f < frameFlips.length - 1; f++) {
        const a = frameFlips[f];
        const b = frameFlips[f + 1];
        if (a.to === b.from && a.from === b.to && b.tick - a.tick <= 2) {
          hiccups++;
          hiccupCauses[a.cause] = (hiccupCauses[a.cause] ?? 0) + 1;
          hiccupCauses[b.cause] = (hiccupCauses[b.cause] ?? 0) + 1;
        }
      }

      totalEvents += frame.events.length;
      if (hasPenalty) { penalties += frame.events.filter(e => e.type === 'penalty').length; }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Total events: ${totalEvents} over ${log.length} minutes`);
    console.log(`Penalties: ${penalties}`);
    console.log(`Possession flips logged: ${possessionFlips}`);
    console.log(`Hiccups (flip+flipback ≤2 ticks): ${hiccups}`);
    console.log('Hiccup causes:');
    for (const [cause, count] of Object.entries(hiccupCauses).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cause}: ${count}`);
    }

    // Per-type event count
    const counts: Record<string, number> = {};
    for (const frame of log) {
      for (const e of frame.events) {
        counts[e.type] = (counts[e.type] ?? 0) + 1;
        if (e.chainedEvent) { counts[e.chainedEvent.type] = (counts[e.chainedEvent.type] ?? 0) + 1; }
      }
    }
    for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  });
});

describe('match-log (tier comparison):', () => {
  it.skip('compares goals/shots/conversion across bad/medium/good skill tiers', () => {
    const SEEDS = 1000;
    const tiers = [
      { label: 'bad   (30v30)', v: 30 },
      { label: 'medium(55v55)', v: 55 },
      { label: 'good  (75v75)', v: 75 },
    ];

    for (const { label, v } of tiers) {
      let goals = 0, shots = 0, penalties = 0, flips = 0;
      // Flip cause buckets — keyed by the last event type in the tick that flipped possession.
      const flipCauses: Record<string, number> = {};

      for (let seed = 0; seed < SEEDS; seed++) {
        const home = makeTeam('home', v);
        const away = makeTeam('away', v);
        const log = createMatchLog({
          matchDuration: 90,
          eventsPerMinute: 13,
          homeTeam: home,
          awayTeam: away,
          homeStarters: home.squad,
          awayStarters: away.squad,
          rng: mulberry32(seed * 7 + 1337),
        });

        for (const frame of log) {
          for (const e of frame.events) {
            if (e.type === 'goal') { goals++; }
            if (e.type === 'shot') { shots++; }
            if (e.type === 'penalty') { penalties++; }
          }
          let prev = frame.ticks[0];
          for (let i = 1; i < frame.ticks.length; i++) {
            const cur = frame.ticks[i];
            if (prev && prev.ball.mode === 'carried' && cur.ball.mode === 'carried' && prev.ball.side !== cur.ball.side) {
              flips++;
              // Tag by the last flow event in the tick that caused the flip.
              const cause = cur.events.length > 0
                ? cur.events[cur.events.length - 1].type
                : 'unknown';
              flipCauses[cause] = (flipCauses[cause] ?? 0) + 1;
            }
            prev = cur;
          }
        }
      }

      const gpg = (goals / SEEDS).toFixed(2);
      const spg = (shots / SEEDS).toFixed(2);
      const conv = shots > 0 ? ((goals / shots) * 100).toFixed(1) : '0';
      const ppg = (penalties / SEEDS).toFixed(2);
      const fpg = (flips / SEEDS).toFixed(1);
      console.log(`${label}: goals/g=${gpg}  shots/g=${spg}  conv=${conv}%  penalties/g=${ppg}  flips/g=${fpg}`);
      const sorted = Object.entries(flipCauses).sort((a, b) => b[1] - a[1]);
      for (const [cause, count] of sorted) {
        console.log(`  flip cause: ${cause.padEnd(22)} ${(count / SEEDS).toFixed(1)}/g  (${((count / flips) * 100).toFixed(1)}%)`);
      }
      // Reset for next tier.
      for (const k of Object.keys(flipCauses)) { delete flipCauses[k]; }
    }
  });
});
