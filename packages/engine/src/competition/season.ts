import { isBefore } from '@fm2k/timeline';
import type { GameDateTime } from '@fm2k/timeline';
import type { CompetitionManager } from './competition-manager.ts';

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
  private readonly comps: CompetitionManager[];

  constructor(config: SeasonConfig) {
    this.nationId = config.nationId;
    this.startDate = config.startDate;
    this.comps = config.competitions;
  }

  competitions(): readonly CompetitionManager[] { return this.comps; }

  byId(competitionId: string): CompetitionManager | undefined {
    return this.comps.find(c => c.getState().competitionId === competitionId);
  }

  hasNext(): boolean { return this.comps.some(c => c.hasNext()); }

  /** Earliest upcoming kickoff across this season's competitions. */
  peekNextTickTime(): GameDateTime | null {
    let min: GameDateTime | null = null;
    for (const c of this.comps) {
      const t = c.peekNextTickTime();
      if (t && (min === null || isBefore(t, min))) { min = t; }
    }
    return min;
  }

  /** Play every competition's block due at or before `target`. */
  async advanceTo(target: GameDateTime): Promise<void> {
    await Promise.all(this.comps.map(c => c.advanceTo(target)));
  }
}
