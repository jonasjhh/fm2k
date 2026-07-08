import type {
  MatchHeadlineInput, TransferHeadlineInput, InjuryHeadlineInput, NewArticle,
  DangerManHeadlineInput, FormWatchHeadlineInput, BookingHeadlineInput,
  InjuryAvertedHeadlineInput, ReturnHeadlineInput,
} from './types.ts';

/** Position-gap (1-based table places) above which a win counts as an upset. */
export const UPSET_GAP = 8;
/** Goal margin at/above which a result counts as a blowout. */
export const BLOWOUT_MARGIN = 4;
/** Wins (or winless results) in the last 5 before an opponent's form is a story. */
export const FORM_STREAK = 4;

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

type DangerManTemplate = (player: string, team: string, position: string) => string;
type FormWatchTemplate = (team: string, wins: number) => string;
type BookingTemplate = (player: string) => string;
type ReturnTemplate = (player: string, missed: number) => string;

const DANGER_MAN_TEMPLATES: readonly DangerManTemplate[] = [
  (p, t) => `Danger man: ${p} the one to watch as ${t} come to town`,
  (p, t) => `Stop ${p}, stop ${t} — scouts single out star man`,
  (p, t, pos) => `${t}'s ${pos} ${p} poses the biggest threat, say pundits`,
  (p) => `All eyes on ${p} ahead of the big match`,
  (p, t) => `Beware ${p}: ${t}'s talisman in the spotlight`,
  (p, t) => `${t} will look to ${p} for inspiration`,
  (p) => `Keep ${p} quiet and the points are there for the taking`,
  (p, t) => `${p} headlines the ${t} team sheet — can anyone contain him?`,
];

const HOT_FORM_TEMPLATES: readonly FormWatchTemplate[] = [
  (t, w) => `${t} arrive in red-hot form with ${w} wins from their last 5`,
  (t) => `Form guide: ${t} are the league's team of the moment`,
  (t, w) => `${w} wins in 5 — ${t} will fancy their chances`,
  (t) => `In-form ${t} promise a stern test`,
  (t) => `${t}'s winning machine rolls into town`,
  (t) => `Momentum with ${t} ahead of the weekend`,
];

const COLD_FORM_TEMPLATES: readonly FormWatchTemplate[] = [
  (t) => `Crisis club ${t} desperate to stop the rot`,
  (t) => `${t} in freefall — winless in almost all of their last 5`,
  (t) => `Pressure mounts on struggling ${t}`,
  (t) => `${t} limp into the fixture on a dismal run`,
  (t) => `Beware the wounded animal: ${t} out to end their slump`,
  (t) => `Form guide: ${t} the league's strugglers right now`,
];

const BOOKING_TEMPLATES: readonly BookingTemplate[] = [
  (p) => `${p} sees red as tempers flare`,
  (p) => `Early bath for ${p} after moment of madness`,
  (p) => `${p} sent off — suspension looms`,
  (p) => `Disciplinary woe: ${p} shown a straight red`,
  (p) => `${p}'s dismissal leaves the boss fuming`,
  (p) => `Ten men after ${p} sees red`,
  (p) => `${p} loses his head and pays the price`,
  (p) => `Referee points to the tunnel: ${p} off`,
];

const INJURY_AVERTED_TEMPLATES: readonly InjuryTemplate[] = [
  (p) => `Relief as ${p}'s knock proves minor`,
  (p, i) => `${p} shakes off ${i} scare`,
  (p) => `Scan results in: ${p} given the all-clear`,
  (p, i) => `Feared ${i} for ${p} comes to nothing`,
  (p) => `Medical staff work their magic on ${p}`,
  (p) => `Injury scare over: ${p} fit to feature`,
];

const RETURN_TEMPLATES: readonly ReturnTemplate[] = [
  (p, m) => `Boost for the boss: ${p} back after ${m}-match layoff`,
  (p) => `${p} returns from the treatment table at last`,
  (p, m) => `${p} fit again after missing ${m} matches`,
  (p) => `Like a new signing: ${p} back in contention`,
  (p) => `The long wait is over — ${p} declared fit`,
  (p, m) => `${p} ends ${m}-match absence`,
];

/** Pre-matchday preview naming the opposition's stand-out player. */
export function dangerManHeadline(input: DangerManHeadlineInput, rng: () => number = Math.random): NewArticle {
  const headline = pickTemplate(DANGER_MAN_TEMPLATES, rng)(input.playerName, input.teamName, input.position);
  return { category: 'preview', headline, timestamp: input.timestamp };
}

/** Pre-matchday look at the opposition's recent results — only when their form is a real
 *  story (a hot streak or a slump); a mixed or short record returns `null`. */
export function formWatchHeadline(input: FormWatchHeadlineInput, rng: () => number = Math.random): NewArticle | null {
  if (input.form.length < 5) { return null; }
  const wins = input.form.filter(r => r === 'W').length;
  const winless = input.form.filter(r => r !== 'W').length;
  if (wins >= FORM_STREAK) {
    return { category: 'form', headline: pickTemplate(HOT_FORM_TEMPLATES, rng)(input.teamName, wins), timestamp: input.timestamp };
  }
  if (winless >= FORM_STREAK) {
    return { category: 'form', headline: pickTemplate(COLD_FORM_TEMPLATES, rng)(input.teamName, wins), timestamp: input.timestamp };
  }
  return null;
}

/** One of the manager's own players sent off (red cards only — a yellow isn't a story). */
export function bookingHeadline(input: BookingHeadlineInput, rng: () => number = Math.random): NewArticle {
  const headline = pickTemplate(BOOKING_TEMPLATES, rng)(input.playerName);
  return { category: 'discipline', headline, timestamp: input.timestamp };
}

/** A reported injury the medical staff cleared before it ever took hold. */
export function injuryAvertedHeadline(input: InjuryAvertedHeadlineInput, rng: () => number = Math.random): NewArticle {
  const headline = pickTemplate(INJURY_AVERTED_TEMPLATES, rng)(input.playerName, input.injuryType);
  return { category: 'injury', headline, timestamp: input.timestamp };
}

/** A long-term absentee back in contention (short knocks aren't newsworthy). */
export function returnHeadline(input: ReturnHeadlineInput, rng: () => number = Math.random): NewArticle {
  const headline = pickTemplate(RETURN_TEMPLATES, rng)(input.playerName, input.matchesMissed);
  return { category: 'injury', headline, timestamp: input.timestamp };
}
