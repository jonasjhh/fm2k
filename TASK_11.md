# TASK 11 — Possession scaling + spread tuning + match-form variance ✅ DONE (2026-07-21)

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit, never run the calibration harness unprompted. Tuning loop: edit knobs → `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`.

## ✅ Outcome (settled values)

- **Spreads** (`duels.ts`): pass 1200→**850**, dribble 1000→**750**, speed/strength 900→**700**, shot baseChance 0.10→**0.095**, `LONG_BALL_DELIVERY` 0.60→**0.55**.
- **Soft-knee gap saturation** (`saturateGap`, KNEE 22 / SOFTNESS 3) in `duelChance` *and* `deliveryCheck` — replaced the idea of a hard cap. Big gaps taper (gap-40/50 saturate ~78–80% wins, never 100%); upsets get rarer as the gap widens but never vanish.
- **Match-form variance** (`rng.ts` `MatchForm`/`drawMatchForm`, σ=0.05, clamp ±0.10) — per-team, per-match conversion-only variance folded into the shot-duel bonus (`shotBonus`), never territory. Injectable three-way (inject / draw / `NEUTRAL_MATCH_FORM`). Gives demolitions + 0-0s + upsets without moving possession.
- **Header conversion blend** (`headerFinishAttr = 0.5·strength + 0.5·finishing`) — a won header finishes off strength+finishing so a physical striker is an aerial threat despite ground-biased finishing. `str==fin` → no-op (calibration-safe). NOT the spread — the spread idea was a symptom-fix, dropped.
- **Result**: gap-10 ~63%, gap-20 ~72%, gap-30 ~73%, gap-40/50 ~78–80% (saturated); even matches ~3.1 goals, draws ~20–24%.
- **Tests**: gap gates retuned; two scenarios added (defensive teams → more 0-0s; lethal striker vs leaky keeper); flaky generated-player aerial test replaced by a hard-coded engine conversion test (match) + a fast generator stat test (players); `headerFinishAttr` unit test locks the `str==fin` invariant.
- **Next**: TASK_07 re-locks all gates once the engine stops moving.

---

## Original brief (for reference)

## What this is

The match engine's duel system produces outcomes that are too flat relative to skill gaps,
and too *narrow* in scoreline. Four problems:

1. **Possession doesn't scale**: the better team didn't visibly dominate shots — only wins
   scaled, not the game texture. → fixed by spread tightening (§1).
2. **Pass difficulty undifferentiated**: a 20-pt gap only shifted short-pass completion by
   1.7%; GK long balls slightly too accurate. → §1 + §2.
3. **Win rate curve wrong at gap-20**: after tightening spreads it *over*shot to ~82% with
   almost no upset path (weaker side won 7%). → fixed by match-form variance (§3).
4. **Scorelines too narrow**: no rare 5–0 demolitions, no rare 0–0 bore-draws. → §3.

The through-line for 3 & 4 is **match-form variance** (§3): a per-team, per-match modifier
on shot conversion that adds correlated variance where football actually varies — the final
third — while leaving territory/possession to skill and tactics.

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

### 1. Spread tightening (`packages/match/src/match/duel/duels.ts`) — DONE, settled values

| Duel | Was | Now | 20-pt gap after |
|------|-----|-----|----------------|
| PASS_DUEL spread | 1200 | **700** | 2.9% |
| DRIBBLE_DUEL spread | 1000 | **650** | 3.1% |
| SPEED_DUEL spread | 900 | **700** | 2.9% (kept wider — 1v1 counter drama) |
| STRENGTH_DUEL spread | 900 | **700** | 2.9% |
| SHOT_DUEL | 800 | unchanged | don't touch — goals well calibrated |

These give good possession/shot **scaling** (gap-10 = 17.9 vs 12.8 shots; gap-20 = 20.7
vs 11.1). They do **not** by themselves fix the gap-20 *win rate* — see §3 for why, and
for the lever that does.

Speed/strength kept wider deliberately: a weaker team's striker who wins the ball on a
counter should still have a meaningful 1v1 chance. The upset potential comes from the
counter, not from the eventual shot.

### 2. GK long ball baseline (`packages/match/src/match/duel/duels.ts`)

`LONG_BALL_DELIVERY.baseChance`: 0.60 → **0.55**

A GK long kick is closer to 50/50 — the existing passing attribute already modifies it from there via the spread. A good-passing GK climbs toward 60-65%; a poor one drops to 45-50%.

### 3. Match-form variance — the decoupling lever (Piece 1)

**Why spread alone can't fix gap-20.** Every duel draws *independent* randomness, so
across ~380 passes + other duels per match the noise averages out and the stronger
side's per-duel edge compounds into near-determinism (gap-20 sits at ~82% regardless of
whether pass spread is 500 or 700 — tested). Spread is a single knob that raises *both*
win rate *and* possession/shot scaling together; you cannot get "possession scales but
upsets still happen" from it. And a flat *attribute* shift (a blanket ±N to all
attributes) is too weak where it matters — it dilutes across midfield and barely moves
the **scoreline**, so it can't produce the 5–0 or 0–0 tails we want.

**The lever: a per-team, per-match "form" modifier concentrated on shot conversion.**
Football's match-to-match variance lives in the final third — a striker's radar, a
keeper's day — not in whether the midfield can pass. So the modifier deliberately stays
**out** of passing/dribbling/speed (territory = skill + tactics, the manager's domain)
and acts **only** on the shot duel. Each team draws **two independent** components at
kickoff:

- **`attack`** — how clinical they are today
- **`defense`** — how solid at the back today

They fold into the single additive `bonus` slot the shot duel already uses
([`flow.ts` `shotBonus`](packages/match/src/match/duel/flow.ts), applied at the
`resolveDuel(finishing, goalkeeping, SHOT_DUEL, rng, { bonus })` call):

```
shotBonus = momentum·k + (chanceQuality−50)·k          // existing
          + attack(shootingTeam)                        // new: their hot / flat day
          − defense(defendingTeam)                      // new: opponent's solid / leaky day
```

The number is in **conversion-probability points**, drawn `clamp(±0.10, Normal(mean, σ))`
with σ≈0.05, mean 0 for Piece 1.

**What a "day" concretely does** (base conversion is 0.10, clamp 0.02–0.35):

| Draw | Effect on the shot duel | Feel |
|------|------------------------|------|
| Hot `attack` (+0.07) | conversion 0.10→0.17; higher margins → more D7 rebound scrambles ([flow.ts:423](packages/match/src/match/duel/flow.ts#L423)) → more second-chance goals | clinical, ruthless |
| Flat `attack` (−0.07) | conversion 0.10→~0.04; bigger miss margins → clean keeper catches, few rebounds | toothless, wasteful |
| Solid `defense` (+0.07) | subtracts from opponents' shot bonus → their conversion drops → more clean saves | keeper/back-line blinder |
| Leaky `defense` (−0.07) | gifts opponents conversion | shaky-keeper game |

**How the scorelines emerge:**

| Result | Component combination |
|--------|----------------------|
| **5–0** | favourite's shot *volume* (from skill) + their hot `attack` + opponent's leaky `defense` |
| **0–0** | both teams' `attack` cold — independent of defense, which is why the two draws are separate |
| **Upset** | underdog hot `attack` + solid `defense` buries their few counters while the favourite's cold day wastes 20 shots |

Worst-case stack (+0.07 attack vs −0.07 defense) = +0.14 on a 0.10 base → **0.24
conversion**, more than double — reaches a rout. Both cold → ~0.03–0.04 → a real 0–0
chance. Crucially it never touches territory, so **possession stays ~50/50 and tactics
stay dominant** — form decides *whether chances go in*, tactics decide *how many you get*.

**Injection contract (three-way, documented with tests).** The value is computed
*outside* the sim and injected; the match package never imports fixtures/competitions.

| Case | Behaviour | Used by |
|------|-----------|---------|
| **Injected** — `homeForm`/`awayForm` provided on `MatchConfig` | used verbatim, no internal draw | real gameplay; TASK_17 computes from recorded results |
| **Absent** — undefined | sim draws its own from `Normal(0, σ)` | calibration harness, quick sims (so variance is visible & tunable) |
| **Neutral** — explicit `{ attack: 0, defense: 0 }` | no effect, fully deterministic | unit tests needing a fixed outcome |

**Integration point.** Draw/resolve the two `MatchForm` values **once** at match start
(constructor / `createInitialState`, using `this.rng` so it stays seed-deterministic),
store on the simulator, thread onto each `FlowTeam`, and add the two terms inside
`shotBonus`. A `drawMatchForm(rng, mean?)` helper (Gaussian via Box–Muller, then clamp)
lives next to `mulberry32` in the match package.

```ts
interface MatchForm { attack: number; defense: number }   // conversion-prob points
// once at match start:
this.form = {
  home: this.config.homeForm ?? drawMatchForm(this.rng),
  away: this.config.awayForm ?? drawMatchForm(this.rng),
};
// in shotBonus(attacking, defending):  + form[attacking.side].attack − form[defending.side].defense
```

### 4. Calibration gate update (`packages/match/src/match/distribution.calibration.test.ts`)

After tuning spreads **and** σ, tighten: `homeWinPct > 0.50` → the value gap-20
stabilises at (target ~0.68–0.72).

**Honest caveat:** conversion variance is primarily a *scoreline + upset* lever. It
*will* pull gap-20 down from 82% (the underdog gains a smash-and-grab path), but may not
land exactly at 68–72% from σ alone. If it's still high after tuning σ, the fallback is a
*small* competitiveness component on top — but lead with conversion-only and measure
first; it's the cleaner mechanism and keeps tactics dominant.

## How to tune

Two knobs: **spreads** (§1, already settled at 700/650) set how strongly skill scales
possession/shots; **σ** (the conversion-variance width, §3) sets how much match-to-match
variance softens large gaps and fattens the scoreline tails. Spreads are done — tune σ.

1. Add the match-form draw; start at **σ = 0.05** (conversion-probability points), clamp ±0.10.
2. Run `mise exec -- pnpm --filter @fm2k/engine calibration-report`.
3. Check **all three gap rows** together:
   - Gap 10 (60v50): don't let win rate exceed ~55%
   - Gap 20 (65v45): target ~68–72% wins (σ pulls this down from ~82%)
   - Gap 30 (70v40): should stay ~80–85% (still a near-certain win, with the odd shock)
4. Verify even-match rows: draw rate ~18–27%, total goals ~2.7–3.1, possession near 50/50.
5. Check the **tails**: some gap-20 matches should now be weaker-team wins (upsets) and some
   4+ goal home wins (demolitions); even matches should occasionally throw a 0–0 and a rout —
   read the margin distribution lines.
6. If gap-20 is still too high, raise σ (0.06–0.07); if even matches lose their tightness /
   goals swing too wildly, lower σ. Then set the test gate to the stabilised value.
7. If σ alone can't reach the gap-20 target without over-swinging scorelines, add the small
   competitiveness fallback (§4 caveat) and re-measure.

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

- **Form must not overshadow tactics**: match-form acts *only* on shot conversion, never on
  territory. It's symmetric and per-match, so over a season it nets out — **skill + tactics
  decide the table; form decides individual results**. Keep σ modest enough that a
  well-set-up team still wins most weeks; if a hot day routinely beats good tactics, σ is too
  high.
- **Even-match feel**: if spread gets too tight, even matches between equal teams become more
  predictable. Football's charm is that 50v50 is still genuinely uncertain.
- **Counter-attack preservation**: a weaker team that wins the ball and breaks should still
  score occasionally. Tight speed/strength spreads would kill that — hence 700 not 500 for
  those duels.
- **Cascade on cards**: how often duels are decisively won/lost affects foul probability.
  Re-check reds/match after tuning.
- **Recalibrate after**: TASK_07 locks the new gates — run it after this task.
