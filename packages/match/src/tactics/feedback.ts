import type { Player } from '../shared/types.ts';
import type { MatchParameterSet } from './match-parameters.ts';
import type { TeamTacticsIntent } from './intent-types.ts';
import type { MatchStatistics } from '../match/types.ts';
import type { ContestedActionType } from '../match/stats.ts';
import { CONTESTED_ACTION_TYPES } from '../match/stats.ts';
import {
  PASS_DUEL, DRIBBLE_DUEL, CROSS_DELIVERY, LONG_BALL_DELIVERY, THROUGH_BALL_DELIVERY,
  type DuelType,
} from '../match/duel/duels.ts';

/** Expected success rate of each contested action in an even matchup — the duel/delivery
 *  baseChance of the check that resolves it in the engine. Baselines for the outlier detector. */
const EXPECTED_SUCCESS: Record<ContestedActionType, number> = {
  short_pass: PASS_DUEL.baseChance,
  long_pass: LONG_BALL_DELIVERY.baseChance,
  through_ball: THROUGH_BALL_DELIVERY.baseChance,
  cross: CROSS_DELIVERY.baseChance,
  dribble: DRIBBLE_DUEL.baseChance,
  back_pass: PASS_DUEL.baseChance,
  progressive_carry: DRIBBLE_DUEL.baseChance,
  cutback: PASS_DUEL.baseChance,
};
import { squadSuitability, defensiveSuitability, attackEffectiveness } from './suitability.ts';
import { TYPICAL_EFF } from './resolve.ts';

export type InsightCategory =
  | 'attack' | 'defense' | 'midfield' | 'press' | 'transition' | 'neutral';

/**
 * A single post-match takeaway, always tied to something concrete (positive or
 * negative) about the player's own XI/squad.
 */
export interface MatchInsight {
  headline: string;
  detail: string;
  category: InsightCategory;
}

/** Everything the insight builder needs, available at the match.completed seam. */
export interface MatchInsightInput {
  playerSide: 'home' | 'away';
  homeScore: number;
  awayScore: number;
  params: MatchParameterSet;
  playerXi: Player[];
  /** The player's chosen tactics — drives the style-matchup verdict. */
  playerIntent?: TeamTacticsIntent;
  /** The opposing XI (best available approximation) — drives the matchup verdict. */
  opponentXi?: Player[];
  /** Match statistics so far (full-time totals, or first-half at the interval). */
  statistics?: MatchStatistics;
  /** Player-side end energy 0..100 per player id (absent at half time). */
  endEnergy?: Record<string, number>;
}

interface ScoredInsight {
  insight: MatchInsight;
  /** Relative importance — the top few scored insights are returned. */
  score: number;
}

/** How many insights a match surfaces at most. */
const MAX_INSIGHTS = 3;

// Detector thresholds. All deliberately conservative: an insight should only fire
// when there's a real story, not on every stat wobble.
const MATCHUP_EDGE = 0.05;          // |eff − typical| before the matchup verdict fires
const ACTION_MIN_ATTEMPTS = 8;      // sample floor before judging an action's success rate
const ACTION_DEVIATION = 0.15;      // |actual − expected| success-rate gap
const FADE_ENERGY = 55;             // mean XI end-energy considered "gassed"
const CORNER_DOMINANCE = 2;         // corners at least double the opponent's
const CORNER_MIN = 6;
const YELLOWS_COSTLY = 3;
const TEMPO_HIGH = 65;               // tempo slider considered deliberately high
const TEMPO_LOW = 35;                // tempo slider considered deliberately low
const SLOPPY_COMPLETION = 0.6;       // pass completion rate that reads as "sloppy" at high tempo
const TIDY_COMPLETION = 0.85;        // pass completion rate that reads as "in control" at low tempo
const DEFENSIVE_LINE_HIGH = 65;      // defensive-line slider considered deliberately high
const BREAK_GOALS_COSTLY = 2;        // fast-break goals conceded before it's a pattern, not bad luck
const DUEL_MIN_TOTAL = 12;           // combined duels of one type before judging who owned it
const DUEL_DOMINANCE = 0.62;         // share of a duel type won that reads as a real edge

const ACTION_LABEL: Record<ContestedActionType, string> = {
  short_pass: 'Short passing',
  long_pass: 'Long balls',
  through_ball: 'Through balls',
  cross: 'Crosses',
  dribble: 'Dribbles',
  back_pass: 'Back passes',
  progressive_carry: 'Progressive carries',
  cutback: 'Cutbacks',
};

const ACTION_CATEGORY: Record<ContestedActionType, InsightCategory> = {
  short_pass: 'midfield',
  long_pass: 'transition',
  through_ball: 'attack',
  cross: 'attack',
  dribble: 'attack',
  back_pass: 'defense',
  progressive_carry: 'transition',
  cutback: 'attack',
};

const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** Verdict on how well the chosen style matched this opponent (the tactics lever made visible). */
function detectStyleMatchup(input: MatchInsightInput): ScoredInsight | null {
  if (!input.playerIntent || !input.opponentXi?.length || input.playerXi.length === 0) { return null; }
  const eff = attackEffectiveness(
    squadSuitability(input.playerIntent, input.playerXi),
    defensiveSuitability(input.opponentXi),
  );
  const edge = eff - TYPICAL_EFF;
  if (Math.abs(edge) < MATCHUP_EDGE) { return null; }
  const style = input.playerIntent.style.replace(/_/g, ' ');
  return {
    score: Math.abs(edge) * 20,
    insight: edge > 0
      ? {
        headline: 'Your game plan suited this opponent',
        detail: `Playing ${style} lined up well against their defensive profile — your chances were worth more than usual. Worth goalkeeping against similar sides.`,
        category: 'attack',
      }
      : {
        headline: 'Your style played into their hands',
        detail: `Playing ${style} suited their defenders — your chances were worth less than usual. A different approach may unlock sides like this.`,
        category: 'neutral',
      },
  };
}

/** The action type whose success rate strayed furthest from its even-matchup baseline. */
function detectActionOutlier(input: MatchInsightInput): ScoredInsight | null {
  const breakdown = input.statistics?.actionBreakdown?.[input.playerSide];
  if (!breakdown) { return null; }
  let best: { type: ContestedActionType; deviation: number; attempts: number; successes: number } | null = null;
  for (const type of CONTESTED_ACTION_TYPES) {
    const { attempts, successes } = breakdown[type];
    if (attempts < ACTION_MIN_ATTEMPTS) { continue; }
    const expected = EXPECTED_SUCCESS[type];
    const deviation = successes / attempts - expected;
    if (Math.abs(deviation) < ACTION_DEVIATION) { continue; }
    if (!best || Math.abs(deviation) > Math.abs(best.deviation)) {
      best = { type, deviation, attempts, successes };
    }
  }
  if (!best) { return null; }
  const expected = EXPECTED_SUCCESS[best.type];
  const label = ACTION_LABEL[best.type];
  return {
    score: Math.abs(best.deviation) * 10 + best.attempts / 20,
    insight: best.deviation > 0
      ? {
        headline: `${label} worked all day`,
        detail: `${best.successes} of ${best.attempts} came off (${pct(best.successes / best.attempts)} vs a typical ${pct(expected)}). Lean into it.`,
        category: ACTION_CATEGORY[best.type],
      }
      : {
        headline: `${label} kept breaking down`,
        detail: `Only ${best.successes} of ${best.attempts} came off (${pct(best.successes / best.attempts)} vs a typical ${pct(expected)}). Consider a style or personnel change there.`,
        category: ACTION_CATEGORY[best.type],
      },
  };
}

/** Conceding late on empty legs — the fitness/rotation signal. */
function detectLateFade(input: MatchInsightInput): ScoredInsight | null {
  if (!input.statistics || !input.endEnergy) { return null; }
  const oppSide = input.playerSide === 'home' ? 'away' : 'home';
  const concededLate = input.statistics.lateGoals[oppSide];
  if (concededLate === 0) { return null; }
  const energies = input.playerXi.map(p => input.endEnergy?.[p.id] ?? 100);
  if (energies.length === 0) { return null; }
  const mean = energies.reduce((s, e) => s + e, 0) / energies.length;
  if (mean >= FADE_ENERGY) { return null; }
  return {
    score: 4 + concededLate,
    insight: {
      headline: 'Your side faded late',
      detail: `Conceded ${concededLate} after the 70th minute with the XI running on empty (average energy ${Math.round(mean)}). Fresher legs — earlier substitutions or squad rotation — would have helped.`,
      category: 'defense',
    },
  };
}

/** Corner dominance that never turned into goals. */
function detectWastedSetPieces(input: MatchInsightInput): ScoredInsight | null {
  const stats = input.statistics;
  if (!stats) { return null; }
  const side = input.playerSide;
  const oppSide = side === 'home' ? 'away' : 'home';
  const ours = stats.corners[side];
  const theirs = stats.corners[oppSide];
  const ourGoals = side === 'home' ? input.homeScore : input.awayScore;
  if (ours < CORNER_MIN || ours < theirs * CORNER_DOMINANCE || ourGoals > 1) { return null; }
  return {
    score: 3 + (ours - theirs) / 4,
    insight: {
      headline: 'Set-piece pressure went unrewarded',
      detail: `You won the corner count ${ours}–${theirs} but scored ${ourGoals === 0 ? 'nothing' : 'just once'}. Better aerial targets in the box would turn that territory into goals.`,
      category: 'attack',
    },
  };
}

/** Cards that changed (or endangered) the match. */
function detectDiscipline(input: MatchInsightInput): ScoredInsight | null {
  const stats = input.statistics;
  if (!stats) { return null; }
  const side = input.playerSide;
  const reds = stats.cards.red[side];
  const yellows = stats.cards.yellow[side];
  if (reds > 0) {
    return {
      score: 8,
      insight: {
        headline: 'A red card changed the match',
        detail: 'Playing a man down undoes any game plan. Aggressive pressing raises the risk — consider easing off with booked players on the pitch.',
        category: 'press',
      },
    };
  }
  if (yellows >= YELLOWS_COSTLY) {
    return {
      score: 2 + yellows / 2,
      insight: {
        headline: 'Discipline is becoming a risk',
        detail: `${yellows} yellow cards in one match invites a sending-off and stacks up suspensions. A heavy press with ill-disciplined defenders is usually the cause.`,
        category: 'press',
      },
    };
  }
  return null;
}

/** Tempo slider vs. how cleanly the team actually kept the ball. */
function detectTempo(input: MatchInsightInput): ScoredInsight | null {
  const sliders = input.playerIntent?.sliders;
  const passes = input.statistics?.passes?.[input.playerSide];
  if (!sliders || !passes || passes.attempted < ACTION_MIN_ATTEMPTS) { return null; }
  const completion = passes.completed / passes.attempted;
  if (sliders.tempo >= TEMPO_HIGH && completion < SLOPPY_COMPLETION) {
    return {
      score: 3 + (SLOPPY_COMPLETION - completion) * 10,
      insight: {
        headline: 'High tempo cost you control',
        detail: `Only ${pct(completion)} of passes found their man at that pace (${passes.completed}/${passes.attempted}). A calmer tempo would keep more of the ball.`,
        category: 'midfield',
      },
    };
  }
  if (sliders.tempo <= TEMPO_LOW && completion >= TIDY_COMPLETION) {
    return {
      score: 2 + (completion - TIDY_COMPLETION) * 10,
      insight: {
        headline: 'Patient tempo kept things tidy',
        detail: `${pct(completion)} pass completion at a slow tempo — sound, but a sharper pace might have created more.`,
        category: 'midfield',
      },
    };
  }
  return null;
}

/** The duel types the dominance detector judges, with their match story. Shot duels are
 *  excluded — shots/on-target already tell that story. */
interface DuelStory {
  won: { headline: string; detail: string };
  lost: { headline: string; detail: string };
  category: InsightCategory;
}

const DUEL_STORY: Partial<Record<DuelType, DuelStory>> = {
  speed: {
    won: {
      headline: 'You won the foot races',
      detail: 'Your players got to the ball first all match — pace like that rewards a direct game and balls in behind.',
    },
    lost: {
      headline: 'They beat you for pace',
      detail: 'Your side came second in the foot races all match. A deeper line protects slow legs; faster players fix it properly.',
    },
    category: 'transition',
  },
  strength: {
    won: {
      headline: 'You won the physical battle',
      detail: 'Your players kept coming out of the shoulder-to-shoulder contests with the ball — long balls and crosses onto that strength will pay.',
    },
    lost: {
      headline: 'You were bullied off the ball',
      detail: 'They outmuscled your side in the physical contests. Keeping the ball on the floor — short passing over aerial duels — hides that weakness.',
    },
    category: 'midfield',
  },
  dribble: {
    won: {
      headline: 'Your side won the one-on-ones',
      detail: 'Take-ons came off and tackles bit all match — attack their full-backs man-to-man while that edge lasts.',
    },
    lost: {
      headline: 'You lost the one-on-ones',
      detail: 'Their dribblers kept beating your tackles, and your take-ons kept dying. Extra cover around the ball — a compact block — limits the damage.',
    },
    category: 'attack',
  },
  pass: {
    won: {
      headline: 'You controlled the passing lanes',
      detail: 'Your passes found their man and your defenders read theirs — the platform for a patient, controlling game.',
    },
    lost: {
      headline: 'They owned the passing lanes',
      detail: 'Your passes kept getting read while theirs found their man. A more direct game bypasses a midfield you cannot out-pass.',
    },
    category: 'midfield',
  },
};

/** Duel dominance (the v2 legibility stat, spoken): the duel type most one-sidedly won
 *  or lost, judged on the duels-won-by-type tallies. */
function detectDuelDominance(input: MatchInsightInput): ScoredInsight | null {
  const duels = input.statistics?.duelsWon;
  if (!duels) { return null; }
  const side = input.playerSide;
  const oppSide = side === 'home' ? 'away' : 'home';
  let best: { type: DuelType; story: DuelStory; share: number; ours: number; theirs: number } | null = null;
  for (const [type, story] of Object.entries(DUEL_STORY) as [DuelType, DuelStory][]) {
    const ours = duels[side][type];
    const theirs = duels[oppSide][type];
    const total = ours + theirs;
    if (total < DUEL_MIN_TOTAL) { continue; }
    const share = ours / total;
    if (share < DUEL_DOMINANCE && share > 1 - DUEL_DOMINANCE) { continue; }
    if (!best || Math.abs(share - 0.5) > Math.abs(best.share - 0.5)) {
      best = { type, story, share, ours, theirs };
    }
  }
  if (!best) { return null; }
  const { story } = best;
  const text = best.share >= DUEL_DOMINANCE ? story.won : story.lost;
  return {
    score: Math.abs(best.share - 0.5) * 12 + (best.ours + best.theirs) / 25,
    insight: {
      headline: text.headline,
      detail: `${text.detail} (${best.ours}–${best.theirs} in ${best.type === 'dribble' ? 'one-on-one' : best.type} duels.)`,
      category: story.category,
    },
  };
}

/** A high defensive line getting punished on the counter. */
function detectDefensiveLine(input: MatchInsightInput): ScoredInsight | null {
  const sliders = input.playerIntent?.sliders;
  const stats = input.statistics;
  if (!sliders || !stats || sliders.defensiveLine < DEFENSIVE_LINE_HIGH) { return null; }
  const conceded = stats.fastBreakGoals[input.playerSide === 'home' ? 'away' : 'home'];
  if (conceded < BREAK_GOALS_COSTLY) { return null; }
  return {
    score: 3 + conceded,
    insight: {
      headline: 'Your high line got exposed on the counter',
      detail: `Conceded ${conceded} from fast breaks after winning the ball back high up the pitch. A deeper line would cut off that space.`,
      category: 'defense',
    },
  };
}

const DETECTORS = [
  detectStyleMatchup,
  detectDuelDominance,
  detectActionOutlier,
  detectLateFade,
  detectWastedSetPieces,
  detectDiscipline,
  detectTempo,
  detectDefensiveLine,
];

/**
 * Build the ranked post-match insights for the player's team: every detector that
 * finds a real story fires, and the top few are returned (strongest first).
 * Pure and rng-free — safe to call from the match-completed seam or at half time
 * (with partial statistics and no end-energy).
 */
export function buildMatchInsights(input: MatchInsightInput): MatchInsight[] {
  return DETECTORS
    .map(d => d(input))
    .filter((s): s is ScoredInsight => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_INSIGHTS)
    .map(s => s.insight);
}
