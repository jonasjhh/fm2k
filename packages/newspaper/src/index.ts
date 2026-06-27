export type {
  Article, ArticleCategory, NewArticle, MatchHeadlineInput, TransferHeadlineInput, InjuryHeadlineInput,
} from './types.ts';
export {
  matchHeadline, transferHeadline, injuryHeadline, UPSET_GAP, BLOWOUT_MARGIN,
} from './headlines.ts';
export { isExpired, NEWSPAPER_RETENTION_DAYS } from './retention.ts';
