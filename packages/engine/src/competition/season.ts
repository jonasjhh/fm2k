import { isBefore } from '@fm2k/timeline';
import type { GameDateTime, OccurrenceEvent } from '@fm2k/timeline';
import type { CompetitionManager } from './competition-manager.ts';
import type { LiveMatch } from './competition-types.ts';

export interface SeasonConfig {
  readonly nationId: string;
  /** Per-nation season start. Today all nations share one date; this is the seam
   *  for shifting individual nations' seasons forward/backward later. */
  readonly startDate: GameDateTime;
  readonly competitions: CompetitionManager[];
}

/**
 * A single nation's season: the bundle of competitions (its league divisions plus
 * its national cup) that share a start date. The unit the game advances per nation.
 */
export class Season {
  readonly nationId: string;
  readonly startDate: GameDateTime;
  private comps: CompetitionManager[];

  constructor(config: SeasonConfig) {
    this.nationId = config.nationId;
    this.startDate = config.startDate;
    this.comps = config.competitions;
  }

  competitions(): readonly CompetitionManager[] { return this.comps; }

  /** Append a competition created after the season started (e.g. a qualifier,
   *  whose participants are only known once the league standings are final). */
  addCompetition(comp: CompetitionManager): void {
    this.comps = [...this.comps, comp];
  }

  byId(competitionId: string): CompetitionManager | undefined {
    return this.comps.find(c => c.getState().competitionId === competitionId);
  }

  hasNext(): boolean { return this.comps.some(c => c.hasNext()); }

  hasLive(): boolean { return this.comps.some(c => c.hasLive()); }

  /** Earliest upcoming kickoff across this season's competitions. */
  peekNextTickTime(): GameDateTime | null {
    return this.minTime(c => c.peekNextTickTime());
  }

  /** Start time of the next not-yet-started match across this season's competitions. */
  peekNextKickoff(): GameDateTime | null {
    return this.minTime(c => c.peekNextKickoff());
  }

  liveMatches(): LiveMatch[] {
    return this.comps.flatMap(c => c.getLiveMatches());
  }

  /** Advance every competition's clock to `target` (matches may be left in progress). */
  async tickTo(target: GameDateTime): Promise<readonly OccurrenceEvent[]> {
    const perComp = await Promise.all(this.comps.map(c => c.tickTo(target)));
    return perComp.flat();
  }

  /** Like tickTo but discards event arrays — no allocation of result collections. */
  async drainTo(target: GameDateTime): Promise<void> {
    await Promise.all(this.comps.map(c => c.drainTo(target)));
  }

  private minTime(pick: (c: CompetitionManager) => GameDateTime | null): GameDateTime | null {
    let min: GameDateTime | null = null;
    for (const c of this.comps) {
      const t = pick(c);
      if (t && (min === null || isBefore(t, min))) { min = t; }
    }
    return min;
  }
}
