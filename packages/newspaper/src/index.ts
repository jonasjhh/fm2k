export type {
  Article, ArticleCategory, NewArticle, MatchHeadlineInput, TransferHeadlineInput, InjuryHeadlineInput,
  DangerManHeadlineInput, FormWatchHeadlineInput, FormLetter, BookingHeadlineInput,
  InjuryAvertedHeadlineInput, ReturnHeadlineInput,
} from './types.ts';
export {
  matchHeadline, transferHeadline, injuryHeadline,
  dangerManHeadline, formWatchHeadline, bookingHeadline, injuryAvertedHeadline, returnHeadline,
  UPSET_GAP, BLOWOUT_MARGIN, FORM_STREAK,
} from './headlines.ts';
export { isExpired, NEWSPAPER_RETENTION_DAYS } from './retention.ts';
