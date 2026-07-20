# TASK 11 — Possession scaling + duel spread tuning

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit, never run the calibration harness unprompted. Tuning loop: edit knobs → `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.

## What this is

The match engine's duel system produces outcomes that are too flat relative to skill gaps. Three problems:

1. **Win rate too low at gap-20**: 65v45 gives 57% wins for the stronger side; real football reference is ~65–75%.
2. **Possession doesn't scale**: the better team doesn't visibly dominate shots and attacking events — only wins scale, not the game texture.
3. **Pass difficulty is undifferentiated**: a 20-point OVR gap only shifts short-pass completion by 1.7%. GK long balls are slightly too accurate at baseline.

## Root cause

Every duel has a **spread** constant: larger spread = skill matters less per duel. Current values in `packages/match/src/match/duel/duels.ts`:

| Duel | Current spread | 20-pt OVR gap shifts chance by |
|------|---------------|-------------------------------|
| PASS_DUEL | 1200 | 1.7% |
| DRIBBLE_DUEL | 1000 | 2.0% |
| SPEED/STRENGTH | 900 | 2.2% |
| SHOT_DUEL | 800 | 2.5% (keep — goals well calibrated) |
| PENALTY | 300 | — (keep) |

A **smaller** spread = skill matters **more** per duel.

## Changes

### 1. Spread tightening (`packages/match/src/match/duel/duels.ts`)

| Duel | Current | Target | 20-pt gap after |
|------|---------|--------|----------------|
| PASS_DUEL spread | 1200 | 500 | 4.0% |
| DRIBBLE_DUEL spread | 1000 | 500 | 4.0% |
| SPEED_DUEL spread | 900 | 700 | 2.9% (kept wider — 1v1 counter drama) |
| STRENGTH_DUEL spread | 900 | 700 | 2.9% |
| SHOT_DUEL | unchanged | — | don't touch |

Speed/strength kept wider deliberately: a weaker team's striker who wins the ball on a counter should still have a meaningful 1v1 chance. The upset potential comes from the counter, not from the eventual shot.

### 2. GK long ball baseline (`packages/match/src/match/duel/duels.ts`)

`LONG_BALL_DELIVERY.baseChance`: 0.60 → **0.55**

A GK long kick is closer to 50/50 — the existing passing attribute already modifies it from there via the spread. A good-passing GK climbs toward 60-65%; a poor one drops to 45-50%.

### 3. Calibration gate update (`packages/match/src/match/distribution.calibration.test.ts`)

After tuning, tighten: `homeWinPct > 0.50` → `> 0.62` for the gap-20 matchup.

## How to tune

1. Apply the spread changes above.
2. Run `mise exec -- pnpm --filter @fm2k/engine calibration-report`.
3. Check **all three gap rows** in the report together:
   - Gap 10 (60v50): don't let win rate exceed ~55%
   - Gap 20 (65v45): target ~65% wins
   - Gap 30 (70v40): don't push above ~80%
4. Also verify even-match rows: draw rate ~20–27%, total goals ~2.7–3.1, possession near 50/50.
5. Look at the `shotsHome`/`shotsAway` columns for gap rows — home should visibly out-shoot away.
6. Adjust spreads further as needed, then update the test gate.

## New calibration scenarios to add

Two test cases to add to `packages/match/src/match/scale-calibration.test.ts` (these gate scenario-specific engine behaviour, not just the aggregate distribution):

### Scenario A — Two defensive teams produce fewer goals

```ts
it('given two defensive tactical setups then goals per match are meaningfully lower', () => {
  // Counter-attack and defend-deep styles both suppress shot volume.
  // Two defensive teams playing each other should average well under 2 goals combined
  // and produce a realistic share of 0-0 results.
  // Implementation: use runDistribution with both teams on style:'defend_deep',
  // sliders { tempo: 20, risk: 20, defensiveLine: 25, pressIntensity: 25 }.
  // Target: totalMean < 1.8, zeroPct > 0.12 (i.e. >12% of matches end 0-0).
});
```

Uses `runDistribution` (not `series`) because it needs `TeamTacticsIntent` to set the defensive sliders.

### Scenario B — Strong striker vs weak GK amplifies goals

```ts
it('given a team with a finishing-90 striker against a team with a goalkeeping-20 keeper then home goals spike', () => {
  // Individual position quality at the decisive moment (shot → keeper) should cause
  // significantly more goals for the strong-striker side than a baseline even match.
  // Build home team with all attributes = 55 except one ST has finishing = 90.
  // Build away team with all attributes = 55 except GK has goalkeeping = 20.
  // Target: home goals per match > 2.0 (baseline even match is ~1.3–1.5 per side).
});
```

Uses `series` from scale-calibration.test.ts (needs per-player attribute overrides — add a `teamWithOverrides` helper).

## Things to be careful about

- **Even-match feel**: if spread gets too tight, even matches between equal teams become more predictable. Football's charm is that 50v50 is still genuinely uncertain.
- **Counter-attack preservation**: a weaker team that wins the ball and breaks should still score occasionally. Tight speed/strength spreads would kill that — hence 700 not 500 for those duels.
- **Cascade on cards**: how often duels are decisively won/lost affects foul probability. Re-check reds/match after tuning.
- **Recalibrate after**: TASK_07 locks the new gates — run it after this task.
