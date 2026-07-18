# TASK 6 — Deeper match insights: opponent-aware levers + passing risk (per-player detectors still parked)

> Conventions and commands: see the backlog index (Claude plan file). Run everything via `mise exec -- pnpm <cmd>`, never commit. Detector substrate: `packages/match/src/tactics/feedback.ts` (7 detectors today: style matchup, action outlier, late fade, wasted set pieces, discipline, tempo, defensive line; max 3 shown, scored/ranked); `MatchInsightInput` already carries `playerIntent` (sliders), `opponentXi`, `statistics` (incl. `fastBreakGoals` from `StatsAccumulator`, `packages/match/src/match/stats.ts`) and `endEnergy`. Tests colocated in `feedback.test.ts`/`stats.test.ts`.

Two distinct pieces, in order of readiness:

## 6a. Opponent-aware tactical-lever insights (feasible now — no new stat tracking needed)

**User direction (2026-07-09)**: the tempo, defensive-line and (new) passing-risk insights shouldn't only measure the lever against your own team's output — they should account for **who the opponent is and how well they're equipped to punish the setting**. A physically superior opponent "abuses" a high tempo or a high line; the same settings against an inferior side are fine. Possibly the same treatment for style.

What already exists to build on: `MatchInsightInput.opponentXi` (the opposing XI, best available approximation) is already populated at both the half-time and full-time seams — so opponent attribute aggregates (pace, strength, stamina via the `PlayerAttributes` fields) are computable inside a detector with zero plumbing. The style-matchup detector (`detectStyleMatchup`) is already opponent-aware by construction (`attackEffectiveness(squadSuitability(you), defensiveSuitability(them))`).

Sketch when picked up:
- **Passing risk (new detector)**: correlate the `risk` slider with through-ball/dribble outcomes from `actionBreakdown` — but condition the verdict on the opponent's defensive quality (e.g. high risk + low through-ball success against a strong/quick defence → "their back line ate your ambitious passing — keep it simpler against sides like this"; the same numbers against a weak defence → a squad-quality story instead).
- **Tempo, opponent-conditioned**: extend `detectTempo` so the "high tempo cost you control" verdict names the opponent's physical edge when it exists (their mean speed/strength/stamina vs yours) — "at that pace against a fitter side, your passing fell apart"; conversely, high tempo working against an inferior side can be praised as the right call.
- **Defensive line, opponent-conditioned**: extend `detectDefensiveLine` to check the opponent's pace before phrasing — conceding fast breaks to a quick side on a high line is "their pace punished your line"; to a slow side, "even a slow side got in behind — the line was simply too high."
- Keep the conservative-thresholds philosophy: opponent-conditioning should sharpen the story and its advice, not make detectors fire more often.

## 6b. Per-player / player-instruction detectors (parked; needs new stat tracking first)

Individual players / player instructions have NO detector today — `actionBreakdown` stats are team-wide, not per-player, so there's no data to say "your LWB got isolated." Needs per-player action/positional tracking added to `StatsAccumulator` first; scope as its own piece of work when picked up.
