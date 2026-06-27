import type {
  MatchHeadlineInput, TransferHeadlineInput, InjuryHeadlineInput, NewArticle,
} from './types.ts';

/** Position-gap (1-based table places) above which a win counts as an upset. */
export const UPSET_GAP = 8;
/** Goal margin at/above which a result counts as a blowout. */
export const BLOWOUT_MARGIN = 4;

type BlowoutTemplate = (winner: string, loser: string, winnerScore: number, loserScore: number, margin: number) => string;
type UpsetTemplate = (underdog: string, underdogPos: number, favourite: string, favouritePos: number) => string;
type TransferTemplate = (player: string, team: string, fee: number) => string;
type InjuryTemplate = (player: string, injury: string) => string;

const money = (fee: number) => `£${fee.toLocaleString()}`;

// ── hardcoded headline templates ────────────────────────────────────────────────
// Several phrasings per category so the same fixture type doesn't repeat noticeably
// over a season — just add more entries here to widen the pool further.

const BLOWOUT_TEMPLATES: readonly BlowoutTemplate[] = [
  (w, l, ws, ls) => `${w} put ${ws - ls} past hapless ${l}`,
  (w, l, ws, ls) => `${w} HUMILIATE ${l} ${ws}-${ls}`,
  (w, l, ws, ls) => `${w} run riot, thrash ${l} ${ws}-${ls}`,
  (w, l, _ws, _ls, m) => `${l} battered as ${w} hit ${m}`,
  (w, l, ws, ls) => `Massacre at the match: ${w} ${ws} ${l} ${ls}`,
  (w, l, _ws, _ls, m) => `${w} send ${l} packing in ${m}-goal romp`,
  (w, l) => `No mercy! ${w} demolish ${l}`,
  (w, l) => `${l} left red-faced after ${w} rampage`,
  (w, l, ws, ls) => `${w} in ruthless form, crush ${l} ${ws}-${ls}`,
  (w, l, ws, ls) => `Goal rush: ${w} bury ${l} ${ws}-${ls}`,
];

const UPSET_TEMPLATES: readonly UpsetTemplate[] = [
  (u, up, f) => `SHOCK RESULT: ${u} (${up}th) stun ${f}`,
  (u, _up, f) => `${u} topple high-flying ${f} in major upset`,
  (u) => `Giant-killers ${u} send shockwaves through the league`,
  (u, _up, f) => `${f} stunned by lowly ${u}`,
  (u, _up, f) => `Form turned on its head as ${u} beat ${f}`,
  (u, _up, f) => `${u} prove the doubters wrong, beat ${f}`,
  (u, _up, f) => `Upset of the season? ${u} shock ${f}`,
  (u, _up, f) => `${f} humbled by struggling ${u}`,
  (u, _up, f) => `Nobody saw this coming: ${u} beat ${f}`,
  (u, _up, f) => `${u} announce themselves with famous win over ${f}`,
];

const TRANSFER_TEMPLATES: readonly TransferTemplate[] = [
  (p, t) => `${t} complete the signing of ${p}`,
  (p, t, fee) => `${t} swoop for ${p} in a ${money(fee)} deal`,
  (p, t) => `${p} pens deal with ${t}`,
  (p, t) => `${t} bolster squad with ${p} signing`,
  (p, t) => `Done deal: ${p} joins ${t}`,
  (p, t) => `${t} land their man as ${p} signs`,
  (p, t) => `${p} set for fresh start at ${t}`,
  (p, t) => `Transfer coup: ${t} secure ${p}`,
  (p, t, fee) => `${t} announce ${money(fee)} signing of ${p}`,
  (p, t, fee) => `${p} arrives at ${t} for ${money(fee)}`,
];

const PERSONAL_TRANSFER_TEMPLATES: readonly TransferTemplate[] = [
  (p) => `You've completed the signing of ${p}!`,
  (p, _t, fee) => `${p} joins your ranks for ${money(fee)}`,
  (p) => `New arrival: ${p} signs for the club`,
  (p) => `Fans rejoice as ${p} puts pen to paper`,
  (p) => `${p} is officially one of yours`,
  (p) => `Big news: you've landed ${p}`,
  (p, _t, fee) => `${p} joins for a fee of ${money(fee)}`,
  (p) => `Welcome aboard, ${p}!`,
  (p) => `${p} signs on the dotted line`,
  (p) => `Club completes deal to sign ${p}`,
];

const INJURY_TEMPLATES: readonly InjuryTemplate[] = [
  (p) => `Blow for the boss: ${p} ruled out`,
  (p, i) => `${p} faces spell on the sidelines with ${i}`,
  (p) => `Injury scare: ${p} forced off`,
  (p, i) => `Setback as ${p} picks up ${i}`,
  (p, i) => `${p} sidelined by ${i}`,
  (p) => `Medical room busy: ${p} latest injury concern`,
  (p, i) => `${p} to miss action through ${i}`,
  (p, i) => `Fitness worry: ${p} struggling with ${i}`,
  (p) => `${p} added to the treatment table`,
  (p, i) => `Bad news: ${p} sustains ${i}`,
];

function pickTemplate<T>(templates: readonly T[], rng: () => number): T {
  const idx = Math.min(templates.length - 1, Math.floor(rng() * templates.length));
  return templates[idx];
}

/** A completed match's headline, if it's actually newsworthy — an upset (a much lower-ranked
 *  side won) takes priority over a blowout (large goal margin); at most one article per match.
 *  Returns `null` for an unremarkable result (most matches). */
export function matchHeadline(input: MatchHeadlineInput, rng: () => number = Math.random): NewArticle | null {
  const { homeTeamName, awayTeamName, homeScore, awayScore, homePosition, awayPosition, timestamp } = input;
  if (homeScore === awayScore) { return null; }
  const homeWon = homeScore > awayScore;

  if (homePosition !== undefined && awayPosition !== undefined) {
    const gap = Math.abs(homePosition - awayPosition);
    const winnerIsUnderdog = homeWon ? homePosition > awayPosition : awayPosition > homePosition;
    if (gap >= UPSET_GAP && winnerIsUnderdog) {
      const underdog = homeWon ? homeTeamName : awayTeamName;
      const underdogPos = homeWon ? homePosition : awayPosition;
      const favourite = homeWon ? awayTeamName : homeTeamName;
      const favouritePos = homeWon ? awayPosition : homePosition;
      const headline = pickTemplate(UPSET_TEMPLATES, rng)(underdog, underdogPos, favourite, favouritePos);
      return { category: 'upset', headline, timestamp };
    }
  }

  const margin = Math.abs(homeScore - awayScore);
  if (margin >= BLOWOUT_MARGIN) {
    const winner = homeWon ? homeTeamName : awayTeamName;
    const loser = homeWon ? awayTeamName : homeTeamName;
    const winnerScore = homeWon ? homeScore : awayScore;
    const loserScore = homeWon ? awayScore : homeScore;
    const headline = pickTemplate(BLOWOUT_TEMPLATES, rng)(winner, loser, winnerScore, loserScore, margin);
    return { category: 'blowout', headline, timestamp };
  }

  return null;
}

/** A player changing club — phrased personally when the player's own managed club is involved. */
export function transferHeadline(input: TransferHeadlineInput, rng: () => number = Math.random): NewArticle {
  const templates = input.isPlayerClub ? PERSONAL_TRANSFER_TEMPLATES : TRANSFER_TEMPLATES;
  const headline = pickTemplate(templates, rng)(input.playerName, input.teamName, input.fee);
  return { category: 'transfer', headline, timestamp: input.timestamp };
}

/** A player picking up an injury (player's own club only — there's no injury modeling for AI squads). */
export function injuryHeadline(input: InjuryHeadlineInput, rng: () => number = Math.random): NewArticle {
  const headline = pickTemplate(INJURY_TEMPLATES, rng)(input.playerName, input.injuryType);
  return { category: 'injury', headline, timestamp: input.timestamp };
}
