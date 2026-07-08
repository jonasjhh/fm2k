import type { OccurrenceEvent } from './occurrence.ts';
import type { GameDateTime } from './game-date-time.ts';
import { compareGameDateTime } from './game-date-time.ts';

export interface EventLogQuery {
  readonly fromTime?: GameDateTime
  readonly toTime?: GameDateTime
  readonly occurrenceId?: string
  readonly occurrenceType?: string
  readonly eventType?: string
}

interface SerializedEventLog {
  readonly version: number
  readonly entries: readonly OccurrenceEvent[]
}

const CURRENT_VERSION = 1;

export interface EventLogOptions {
  /** Keep only events this predicate accepts (e.g. goals/cards) — the log is the
   *  substrate for season records/top scorers, not a firehose of every pass. */
  readonly keep?: (event: OccurrenceEvent) => boolean;
}

export class EventLog {
  private entries: OccurrenceEvent[] = [];
  private readonly keep?: (event: OccurrenceEvent) => boolean;

  constructor(options: EventLogOptions = {}) {
    this.keep = options.keep;
  }

  append(event: OccurrenceEvent): void {
    if (this.keep && !this.keep(event)) { return; }
    this.entries.push(event);
  }

  query(filter: EventLogQuery = {}): OccurrenceEvent[] {
    return this.entries.filter(entry => {
      if (filter.fromTime !== undefined && compareGameDateTime(entry.timestamp, filter.fromTime) < 0) {
        return false;
      }
      if (filter.toTime !== undefined && compareGameDateTime(entry.timestamp, filter.toTime) > 0) {
        return false;
      }
      if (filter.occurrenceId !== undefined && entry.occurrenceId !== filter.occurrenceId) {
        return false;
      }
      if (filter.occurrenceType !== undefined && entry.occurrenceType !== filter.occurrenceType) {
        return false;
      }
      if (filter.eventType !== undefined && entry.eventType !== filter.eventType) {
        return false;
      }
      return true;
    });
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  serialize(): string {
    const data: SerializedEventLog = {
      version: CURRENT_VERSION,
      entries: this.entries,
    };
    return JSON.stringify(data);
  }

  static deserialize(json: string): EventLog {
    const data: SerializedEventLog = JSON.parse(json);
    if (data.version !== CURRENT_VERSION) {
      throw new Error(`Unsupported EventLog version: ${data.version}`);
    }
    const log = new EventLog();
    for (const entry of data.entries) {
      log.append(entry);
    }
    return log;
  }
}
