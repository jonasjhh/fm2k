import type { Player } from '../shared/types.ts';
import type { MatchEvent, MatchState } from './types.ts';
import {
  INJURY_BY_ID, INJURY_SEVERITIES, INJURY_TABLE, TRIGGER_EXPOSURE,
  type InjurySeverity, type InjuryTrigger,
} from './injury-catalogue.ts';

export type { InjurySeverity, InjuryTrigger } from './injury-catalogue.ts';
export { INJURY_TYPES } from './injury-catalogue.ts';

/** An injury picked up in a match — duration is *pre-mitigation* (before medical facilities).
 *  The mitigation clamps travel on the report rather than being looked up club-side, so the
 *  engine needs no catalogue import and a report can outlive a change to the catalogue. */
export interface InjuryReport {
  playerId: string;
  type: string;
  /** Matches out, before any club medical-facility mitigation. */
  baseDuration: number;
  severity: InjurySeverity;
  /** Ceiling on how much of this the club's medical estate can ever prevent. */
  maxAvertChance: number;
  /** Floor on treated duration, as a fraction of `baseDuration`. */
  minDurationFraction: number;
}

/** An in-match injury: the report plus where/when/how it happened on the pitch. */
export interface MatchInjury extends InjuryReport {
  team: 'home' | 'away';
  minute: number;
  /** What the player was doing — drives the ticker text. */
  cause: InjuryTrigger;
}

/** Pick one injury from a situation's severity slot, weighted. */
function pickInjury(
  trigger: InjuryTrigger, severity: InjurySeverity, rng: () => number,
): Omit<InjuryReport, 'playerId'> | undefined {
  const candidates = INJURY_TABLE[trigger][severity];
  if (candidates.length === 0) { return undefined; }
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  let picked = candidates[candidates.length - 1];
  for (const c of candidates) { r -= c.weight; if (r <= 0) { picked = c; break; } }
  const [lo, hi] = picked.def.duration;
  return {
    type: picked.def.id,
    baseDuration: lo + Math.floor(rng() * (hi - lo + 1)),
    severity: picked.def.severity,
    maxAvertChance: picked.def.maxAvertChance,
    minDurationFraction: picked.def.minDurationFraction,
  };
}

// ── triggers ───────────────────────────────────────────────────────────────────
// Injuries are consequences of what actually happened: each risky involvement in a
// minute's events rolls against its situation's exposure. Challenges carry the highest
// risk (and cards mark the nasty ones); sprints strain muscles; aerial duels knock
// heads; keepers pick up rare impact knocks.

const CAUSE_TEXT: Record<InjuryTrigger, string> = {
  tackled: 'comes off worse in the challenge',
  tackling: 'lands awkwardly making the tackle',
  foul: 'stays down after the foul',
  yellow_foul: 'is caught by a reckless challenge',
  red_foul: 'is left in a heap by a shocking tackle',
  sprint: 'pulls up mid-run',
  through_run: 'pulls up sprinting onto the through ball',
  aerial: 'lands badly after the aerial duel',
  save: 'is hurt making the save',
};

export function injuryDescription(playerName: string, injury: MatchInjury): string {
  const label = INJURY_BY_ID[injury.type]?.name ?? injury.type.replace(/_/g, ' ');
  return `Injury! ${playerName} ${CAUSE_TEXT[injury.cause]} — ${label}, out ${injury.baseDuration} match${injury.baseDuration === 1 ? '' : 'es'}`;
}

/**
 * Fatigue multiplier on every injury roll: low stamina and empty legs are where
 * players break down (same shape the old end-of-match model used).
 */
export function fatigueRiskFactor(player: Player, energy: number): number {
  const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));
  const staminaFactor = clamp(0.7, 1.5, 1 + (50 - player.attributes.stamina) / 160);
  const energyFactor = clamp(0.7, 2, 1 + (55 - energy) / 70);
  return staminaFactor * energyFactor;
}

export interface InjuryExposure {
  playerId: string;
  team: 'home' | 'away';
  trigger: InjuryTrigger;
}

/** Every risky involvement in one minute's (flattened) event list. */
export function collectExposures(events: MatchEvent[]): InjuryExposure[] {
  const out: InjuryExposure[] = [];
  const cardedFoulers = new Set(
    events.filter(e => e.type === 'yellow_card' || e.type === 'red_card').map(e => e.playerId),
  );
  const redFoulers = new Set(events.filter(e => e.type === 'red_card').map(e => e.playerId));

  for (const e of events) {
    const attackerId = e.metadata?.attackerId as string | undefined;
    const attackingTeam = e.metadata?.attackingTeam as 'home' | 'away' | undefined;

    switch (e.type) {
    case 'tackle':
      // The challenged carrier takes the brunt; the tackler risks a different set of injuries
      // (planted ankles and knees rather than dead legs), at lower exposure.
      if (attackerId && attackingTeam) {
        out.push({ playerId: attackerId, team: attackingTeam, trigger: 'tackled' });
      }
      if (e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'tackling' });
      }
      break;
    case 'foul': {
      // The fouled player: a card marks the challenge as nasty — its own situation, with its
      // own exposure, and the only route to a broken leg.
      if (!attackerId || !attackingTeam) { break; }
      const trigger: InjuryTrigger = redFoulers.has(e.playerId) ? 'red_foul'
        : cardedFoulers.has(e.playerId) ? 'yellow_foul'
          : 'foul';
      out.push({ playerId: attackerId, team: attackingTeam, trigger });
      break;
    }
    case 'dribble':
      if (e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'sprint' });
      }
      break;
    case 'through_ball': {
      const receiverId = e.metadata?.receiverId as string | undefined;
      if (receiverId) {
        out.push({ playerId: receiverId, team: e.team, trigger: 'through_run' });
      }
      break;
    }
    case 'shot':
      if (e.metadata?.aerial && e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'aerial' });
      }
      break;
    case 'save':
      if (e.playerId) {
        out.push({ playerId: e.playerId, team: e.team, trigger: 'save' });
      }
      break;
    }
  }
  return out;
}

/** A state's in-match injuries split per side, stripped to the report shape the
 *  club layer consumes (medical mitigation happens there). */
export function injuriesBySide(state: MatchState): { home: InjuryReport[]; away: InjuryReport[] } {
  const all = state.matchInjuries ?? [];
  const strip = (
    { playerId, type, baseDuration, severity, maxAvertChance, minDurationFraction }: MatchInjury,
  ): InjuryReport => (
    { playerId, type, baseDuration, severity, maxAvertChance, minDurationFraction }
  );
  return {
    home: all.filter(i => i.team === 'home').map(strip),
    away: all.filter(i => i.team === 'away').map(strip),
  };
}

/** Worst first, so a serious injury is never masked by a knock rolled in the same involvement. */
const SEVERITY_ORDER: readonly InjurySeverity[] = [...INJURY_SEVERITIES].reverse();

/**
 * Roll one minute's exposures against the dedicated injury rng. Each involvement rolls the three
 * severity bands independently, so knock frequency can be tuned without disturbing how often
 * serious injuries happen. At most one injury per player per match (`alreadyInjured` seeds the
 * exclusion — pass everyone already off the pitch too). Deterministic under `injuryRng`; consumes
 * no main-stream rng.
 */
export function rollInjuries(
  events: MatchEvent[],
  state: MatchState,
  alreadyInjured: ReadonlySet<string>,
  injuryRng: () => number,
): MatchInjury[] {
  const out: MatchInjury[] = [];
  const hit = new Set(alreadyInjured);

  for (const exp of collectExposures(events)) {
    if (hit.has(exp.playerId)) { continue; }
    const player = state.currentPlayers[exp.team].find(p => p.id === exp.playerId);
    if (!player) { continue; }
    const energy = state.energy?.[exp.team]?.[exp.playerId] ?? 100;
    const fatigue = fatigueRiskFactor(player, energy);

    for (const severity of SEVERITY_ORDER) {
      // A slot with no candidates (a keeper cannot pick up a serious injury from a save) is
      // skipped without consuming a draw, so empty slots stay free of side effects.
      if (INJURY_TABLE[exp.trigger][severity].length === 0) { continue; }
      const chance = TRIGGER_EXPOSURE[exp.trigger][severity] * fatigue;
      if (injuryRng() >= chance) { continue; }

      const picked = pickInjury(exp.trigger, severity, injuryRng);
      if (!picked) { continue; }
      hit.add(exp.playerId);
      out.push({
        playerId: exp.playerId,
        team: exp.team,
        minute: state.minute,
        cause: exp.trigger,
        ...picked,
      });
      break;
    }
  }
  return out;
}
