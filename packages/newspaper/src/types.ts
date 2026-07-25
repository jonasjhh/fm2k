import type { GameDateTime } from '@fm2k/timeline';

export type ArticleCategory = 'blowout' | 'upset' | 'transfer' | 'injury' | 'preview' | 'form' | 'discipline';

/** Entity references embedded in a headline — used by the UI to make names clickable.
 *  All fields are optional; only the entities that actually appear in the headline are set. */
export interface ArticleRefs {
  /** Team IDs whose names appear in the headline, keyed by the display name used. */
  teams?: Record<string, string>;
  /** Player IDs whose names appear in the headline, keyed by the display name used. */
  players?: Record<string, string>;
}

/** A generated newspaper article, ready to display. `id` is assigned by the caller (the backend
 *  session, mirroring how it assigns `notifications` ids) since this package stays pure. */
export interface Article {
  id: number;
  category: ArticleCategory;
  headline: string;
  timestamp: GameDateTime;
  /** Clickable entity references — team/player names mapped to their IDs. */
  refs?: ArticleRefs;
}

/** What a generator function produces — the caller stamps an `id` on top of this. */
export type NewArticle = Omit<Article, 'id'>;

export interface MatchHeadlineInput {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  /** 1-based league table positions at kickoff; omitted for knockout fixtures (no upset detection then). */
  homePosition?: number;
  awayPosition?: number;
  timestamp: GameDateTime;
}

export interface TransferHeadlineInput {
  playerName: string;
  /** The club the headline is about (the signing club). */
  teamName: string;
  fee: number;
  /** Whether the player's own managed club is the buyer or seller — picks a more personal template. */
  isPlayerClub: boolean;
  timestamp: GameDateTime;
}

export interface InjuryHeadlineInput {
  playerName: string;
  injuryType: string;
  timestamp: GameDateTime;
}

export interface DangerManHeadlineInput {
  playerName: string;
  teamName: string;
  /** The player's card position (e.g. "ST", "CM") — flavours the phrasing. */
  position: string;
  timestamp: GameDateTime;
}

/** Oldest→newest recent results, as produced by the engine's `recentForm` — declared
 *  structurally here so this package stays dependent on @fm2k/timeline only. */
export type FormLetter = 'W' | 'D' | 'L';

export interface FormWatchHeadlineInput {
  teamName: string;
  form: FormLetter[];
  timestamp: GameDateTime;
}

export interface BookingHeadlineInput {
  playerName: string;
  timestamp: GameDateTime;
}

export interface InjuryAvertedHeadlineInput {
  playerName: string;
  injuryType: string;
  timestamp: GameDateTime;
}

export interface ReturnHeadlineInput {
  playerName: string;
  matchesMissed: number;
  timestamp: GameDateTime;
}
