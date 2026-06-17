# Tactics system — levers, conditions & attributes

This document describes the tactical system the manager interacts with: the
**levers** the player sets (formation, style, sliders), how they turn into match
behaviour, **how player attributes feed in**, and the **conditions under which each
strategy thrives or struggles**.

It is meant as a design/balance reference. The numbers quoted here are the
source-of-truth values in this folder (`style-tendencies.ts`,
`formation-tendencies.ts`, `suitability.ts`, `squad-influence.ts`,
`resolve.ts`) and in the simulator (`../match/`). If you change those, update
this doc. Measured outcome distributions live in [../../BALANCE.md](../../BALANCE.md).

## Overview (the one-paragraph version)

You set three levers — a **formation** (shape), a **style** (behaviour), and three
**sliders** (fine-tuning) — and you pick the **XI**. These combine into 10 universal
match parameters; your squad's average attributes then *distort* those parameters,
and a fit/mismatch against the opponent nudges your attacking output. The simulator
plays out a minute-by-minute action loop driven by **those parameters plus each
player's attributes**. The guiding principle: **tactics shade results; squad quality
and fit decide them.** A good plan your players can execute, against an opponent
ill-built to stop it, is a real edge — but it never overrides a clear quality gap.

> **Scale note:** player attributes run **1–99** (tier-3 ~10–40, tier-2 ~30–60,
> tier-1 ~40–70, world class 80+, the very best 90+). The simulator is calibrated
> for this: the **contest** that resolves every action (a defender winning the ball)
> and **shot conversion** (finisher vs keeper) are **parity-centred differentials** —
> at parity (an even match at *any* tier) the rates are identical, so scoring is
> tier-flat (even matches total ~2.7 goals); a quality gap shifts the rates and
> produces dominance, up to blowouts on a big gap. See
> `../match/action-generators.ts` (tuning constants at the top),
> `../match/scale-calibration.test.ts` and [../../BALANCE.md](../../BALANCE.md).
>
> **Defenders gate chance *creation*, not just conversion.** A stronger defence
> (a) compresses space — the ball reaches dangerous zones less often (`progressionEdge`
> folds defender quality into `advanceFactor`) — and (b) denies clean looks — fewer
> shots are *worked* (shot-taking is parity-centred on finisher vs defence) — and
> (c) **wins more contests** outright, since a better defender beats the attacker's
> action more often. So a poor attacker facing a good defence is **shut down before it
> shoots**, rather than taking the same volume of shots and missing them. The parity
> terms are 1.0 at parity, so even matches are unchanged. On a turnover the ball is
> **mirrored** into the new possessor's frame (winning it deep leaves you defending,
> not instantly attacking).

---

## The pipeline (how a lever becomes match behaviour)

```
Manager intent            Translation              Squad influence            Pure simulation
(what you choose)   →   (universal dials)    →   (distort by your squad)  →   (numbers only)

formation  ┐
style      ├─► combine() ─► MatchParameters ─► applySquadDistortion() ─► resolveMatchParameters() ─► MatchSimulator
sliders    ┘                (10 × 0..100)        + asymmetric attack eff.        (per side)
```

- The simulator **never** sees a formation or a style — only the 10 resolved
  parameters plus player attributes. This keeps tactics and match maths
  decoupled.
- Parameters are resolved **per match** for the player (so your current XI /
  formation / style apply to the next match you play), and **once at season
  start** for AI teams (so their identity is fixed all season).

---

## The levers

### 1. Formation (12 options)
Contributes **structural** tendencies only — shape, width, how much space is
left at the back. Examples (`formation-tendencies.ts`):

| Formation | Leans toward |
|---|---|
| `4-3-3`, `4-2-4`, `3-4-3` | wide, more shots, **more space left behind** |
| `4-4-2`, `4-4-1-1` | compact, balanced width |
| `4-5-1`, `4-1-4-1` | compact, fewer shots |
| `5-3-2`, `5-4-1` | very compact, little space behind, low attacking output |

### 2. Style (7 options)
Contributes **behavioural** tendencies. Each style has at least one upside and
at least one built-in downside (its weakness) — no style is pure upside.
`balanced` is the neutral baseline (no modifiers; it simply masters nothing).

### 3. Sliders (fine-tuning, additive on top of the style)
Each 0–100, 50 = neutral. They **stack with** the style rather than override it.

| Slider | Effect |
|---|---|
| **Tempo** | raises/lowers actions per minute (faster, more end-to-end) |
| **Passing risk** | shifts the ball from safe short passing toward through-balls / dribbles |
| **Defensive line** | high line → more space left behind, less compact, slightly more pressing; deep line → the reverse |

Because sliders are additive, a `hit_on_counter` style (which wants a deep
block) combined with a high defensive-line slider **partially cancel** — useful
for nuance, dangerous if you fight your own style.

---

## The 10 match parameters (the universal dials)

| Parameter | Raises… | Lowered by… |
|---|---|---|
| `pressIntensity` | turnovers won (tackles/interceptions) | — |
| `defensiveCompactness` | resistance to being broken down (keeps play out of the box **and** cuts shot quality) | — |
| `passingRisk` | through-balls/dribbles over safe passes | — |
| `tempo` | actions per minute | — |
| `transitionSpeed` | how fast you advance on the ball (counters) | — |
| `shotFrequency` | how often shots are taken in the final third | — |
| `chanceQuality` | conversion of the chances you do work | — |
| `fatigueRate` | how fast energy drains in-match (now live — see *In-match fatigue*) | — |
| `spaceLeftBehind` | how easily the **opponent** advances/gets shots (the cost of a high line) | — |
| `buildUpWidth` | bias toward the flanks vs the centre | — |

The dominant defensive lever is **`defensiveCompactness`**: it both resists ball
progression into the box *and* divides shot conversion. The dominant attacking
levers are **`chanceQuality`** and **`shotFrequency`**.

---

## How player attributes matter

Attributes are the **strongest** lever — well above tactics (a one-tier quality gap
is worth ~150%+ on conversion; the tactical fit swing is ~±8–18%). They feed the
match in **three** ways:

1. **Per-action skill** — every action in the match is a *skill composite* of the 10
   base attributes vs the contesting defender (or keeper). The composites are the
   single source of truth in `SkillCalculator` (`../match/action-generators.ts`),
   with the component weights documented at each definition.
2. **Squad distortion** — the XI's *average* attributes nudge the 10 parameters
   (`squad-influence.ts`): e.g. low stamina weakens a press, low composure/awareness
   leaks possession, high speed sharpens counters.
3. **Suitability / fit** — how well the XI's attributes match the chosen style drives
   attacking effectiveness (`suitability.ts`; see the asymmetric rule below).

There are **10 attributes** (1–99). Where each one bites:

| Attribute | Drives… |
|---|---|
| **Passing** | short & long passing, through-balls (vision pass), crossing |
| **Technique** | dribbling, ball retention under pressure, passing & finishing touch |
| **Speed** | dribbling, **transition/counters** (squad lever), pressing effectiveness |
| **Agility** | dribbling, aerial/heading, interception reach, **GK shot-stopping** |
| **Strength** | aerial duels & headers, long-ball hold-up, tackling, clearances |
| **Finishing** | shot conversion, headers, penalties, free kicks |
| **Defending** | tackling, interception, clearing, the team's defensive-line strength |
| **Awareness** | through-ball vision, reading/interception, tackling, GK positioning, def line |
| **Composure** | finishing & penalties, retaining the ball, GK nerve, **fewer fouls** (discipline) |
| **Stamina** | resists in-match **energy drain**; underpins a sustainable press/high tempo |

Notes:
- A **goalkeeper** saves on `agility` (reflexes) + `awareness` (positioning) +
  `composure` (nerve) — so a keeper's outfield-flavoured attributes are what matter.
- The **contest** (turnover) pits the attacker's relevant skill against the *specific*
  contesting defender's `tackling` (vs a dribble) or `interception` (vs a pass) — so
  an individual defender's quality matters per event, not just a team average.
- **Out-of-position** players are penalised: a player fielded away from their natural
  role has their effective attributes reduced (`getEffectiveAttributes` in
  `../shared/position-rules.ts`), so squad *balance* and correct selection matter.

---

## Per-style guide: when each works well / poorly

"Needs" = the attributes that make a squad **suited** to the style
(`suitability.ts`). Suitability is the **primary** driver of how effective the
tactic is (see the asymmetric rule below).

### Keep the Ball (`keep_the_ball`)
- **Does:** patient short passing, higher chance quality, slower tempo, slightly higher press; low passing risk and low transition speed.
- **Needs:** passing, technique, composure.
- **Works well when:** you have technical, composed midfielders and want to control the game and starve the opponent of the ball.
- **Works poorly when:** your players lack passing/technique (turnovers pile up); against a disciplined deep block you can't break down; if dispossessed high up you have little pace to recover (low transition).

### Press High (`press_high`)
- **Does:** high `pressIntensity` (lots of turnovers), some extra transition; **but** big `spaceLeftBehind` and reduced compactness.
- **Needs:** stamina, speed, defending, strength.
- **Works well when:** you have an athletic, high-stamina squad that can hunt the ball and win it high up the pitch.
- **Works poorly when:** your squad lacks stamina/pace — pressing is less effective *and* the space you leave is punished on the counter. Especially exposed to fast, direct opponents.

### Hit on the Counter (`hit_on_counter`)
- **Does:** sits off (low press), very compact, very high transition speed; fewer shots, slower tempo.
- **Needs:** speed, finishing, technique.
- **Works well when:** you have fast, clinical forwards and face a team that commits players forward (you punish the space they leave).
- **Works poorly when:** you must break down a team that also sits back — you cede possession and lack the patience/creativity to create.

### Long Ball (`long_ball`)
- **Does:** high passing risk, faster transition and tempo, bypasses midfield; lower chance quality.
- **Needs:** strength, finishing, speed, passing.
- **Works well when:** you have strong, fast forwards to win and run onto direct balls, and want to skip a midfield you'd lose anyway.
- **Works poorly when:** you lack a physical/quick spearhead — possession is surrendered cheaply and the low-percentage build-up wastes it.

### Attack the Wings (`attack_the_wings`)
- **Does:** very high build-up width (play down the flanks), a few more shots; slightly lower chance quality and some extra space left behind.
- **Needs:** speed, passing, technique, finishing (wide creators + a finisher).
- **Works well when:** you have quick, technical wide players and a forward who attacks crosses.
- **Works poorly when:** you have no aerial/box threat — crossing becomes wasteful — or you get countered through the space your width concedes.

### Defend Deep (`defend_deep`)
- **Does:** very high compactness, very low space left behind, much lower shot output and transition; safer passing.
- **Needs:** defending, awareness, strength.
- **Works well when:** you're protecting a lead or you're the underdog — you become very hard to score against and concede mostly low-quality shots from distance.
- **Works poorly when:** you need to chase a game — you generate almost nothing going forward, so conceding first is dangerous.

### Balanced (`balanced`)
- **Does:** nothing strongly — the neutral baseline.
- **Works well when:** you have a well-rounded squad with no standout strength, or you don't want to commit.
- **Works poorly when:** you face a side fully committed to its strengths against a matching squad — you get out-gunned in that phase.

---

## Squad influence (how your players distort the dials)

After translation, `applySquadDistortion()` nudges the parameters by the XI's
average attributes (it *distorts*, never overrides):

- **Low stamina** → pressing becomes less effective and fatigue rate rises.
- **Low composure / awareness** → effective passing risk rises (more giveaways).
- **High speed** → transition speed rises (counters are more dangerous).

So the *same* style produces different parameters for different squads — a high
press with a low-stamina squad is a much weaker press than the dial suggests.

## The asymmetric squad-vs-opponent rule

Attacking effectiveness is computed for **both** teams the same way:

```
attackEff = ownSuit × (1 − oppDefSuit × k × (1 − ownSuit))      // k ≈ 0.3
```

- `ownSuit` (0..1) = how well your XI fits your chosen style — the **primary**
  driver.
- `oppDefSuit` = how well the opponent's XI is built to defend.

The `(1 − ownSuit)` term means:

- A **well-suited** attack (`ownSuit → 1`) performs well **almost regardless of
  the opponent** — a strong defence only shaves a little off the top.
- A **poorly-suited** attack (`ownSuit → 0`) gets **shut down much harder** by a
  defensively well-suited opponent.

`resolveMatchParameters()` maps this onto `chanceQuality` and `shotFrequency`,
**centred on a typical matchup** (`TYPICAL_EFF ≈ 0.46`) so an even contest is
unchanged and only a genuine fit/mismatch moves the dials. The swing is sized so
the effect is **subtle for a balanced squad (~±8% on goals) but pronounced for a
strongly specialised one (~±15–18%)** — picking the style your squad is built for,
against an opponent ill-suited to stop it, is a real edge; picking the wrong one is
punished. It stays well below the player-attribute lever (a one-tier gap is worth
~150%+ on conversion), so tactics shade results without making or breaking them.

**Net design intent:** *squad quality and fit decide viability.* You can pick any
philosophy, but it only pays off if your players can execute it; against a side
built to stop it, a mismatched plan is punished, while a well-built one carries.

---

## The match itself (what the dials drive)

The simulator plays out an action loop. Beyond the tactical dials above, these
attribute-driven systems now run inside it:

### Action vocabulary (possessor acts → a defender contests)
Each minute the **possessor's** active player picks an *offensive* action, then a
**selected defender** contests it (`resolveContest`). The contest is the single
turnover source — winning it produces a **tackle** (beating a dribble), an
**interception** (cutting out a pass) or a **clearance** (won deep in the box,
hoofed to midfield); losing it lets the action's success path run. `shot` is the
exception — resolved by the keeper, not an outfield contest. So a specific
defender's tackling/reading contests each action (individual attributes matter per
event, not just a team average). All skills live in `SkillCalculator` in
`../match/action-generators.ts`, with the component attributes + weights documented
at each definition:

- **Short pass** (safe, passing/technique) ↔ **Long pass** (direct, skips a zone;
  a minority choice ramped up by passing risk + transition speed).
- **Through ball** — vision/passing; splits the line (high contest exposure: cut out
  more often). Ramped by passing risk.
- **Dribble** — technique/pace vs the contesting defender's tackling (and the main
  source of fouls).
- **Cross** (passing, from wide) → **header** (a contested aerial: strength +
  jumping vs the defenders' aerial and the keeper). Ramped by build-up width.
- **Shot** (finishing vs keeper).

So `passingRisk` and `buildUpWidth` are now *visible*: more through-balls and long
balls under risk, more crosses → headers under width. Per-action **contest exposure**
(`CONTEST_PARITY`) makes a through-ball/cross turn over far more than a safe short
pass.

### In-match fatigue (the tempo trade-off)
Every player has **energy** (0..100, seeded from fitness) that drains each minute
(`../match/fatigue.ts`). Drain scales with the team's **tempo** and **press**
(running harder costs energy — finally consuming `fatigueRate`), the role's
running load **by position *and* formation** (wing-backs in a back five, a lone
striker, etc.), and is resisted by the player's **stamina**. Low energy scales
effective attributes down — **legs before touch** (physical falls faster than
technical/mental). This makes a high tempo/press fade late unless the squad is fit,
so neither extreme is universally correct. Final energy drains post-match fitness,
which recovers between matchdays.

### Discipline & set pieces
- **Fouls** come from the *contest* (the defender's challenge), heavily weighted to
  carries (the dribble is the canonical source via `FOUL_EXPOSURE`), more likely under
  a heavy **press** and from low-**composure**/-**defending** defenders. A foul concedes a **penalty** (in the box), a **direct
  free kick** (in range) or a restart, and may bring a **yellow** → second-yellow/
  straight **red** (→ the side plays a man down). Discipline is the real cost of a
  reckless press.
- **Set pieces:** penalties (penalties skill vs keeper), free kicks (long shot),
  and **corners** (from saved shots / cleared crosses → an aerial chance).
- **Momentum:** a goal gives the scorers a short-lived, decaying lift to chance
  quality.

All of the above are kept deliberately **moderate** so they add texture without
dominating; the calibrated per-match rates (fouls, cards, penalties, corners,
injuries) are documented in [../../BALANCE.md](../../BALANCE.md).

---

## AI opponents

Each AI team is assigned a style **derived from its formation**
(`ai-style.ts`), e.g. `5-4-1`/`5-3-2` → Defend Deep, `4-3-3`/`4-2-4` → Press
High, `4-2-3-1`/`3-5-2` → Keep the Ball. Their tactics are **fixed for the whole
season** (like their lineup). Because the params were resolved for their
*starting* XI, suspensions/injuries that force replacements naturally weaken how
well the squad executes those fixed tactics.

---

## Not yet modelled (deferred)

- **Substitutions** — neither player-initiated nor AI subs are wired yet, so a
  tired or sent-off side plays on as-is. (The `applyPendingSubstitutions` hook
  exists for when they ship.)
- **Post-match insight text** — the hooks exist (`feedback.ts`,
  `getLastMatchInsight()`); the detector logic and UI surface are deferred.
- **Mid-match (half-time) tactical changes** — tactics apply per match, not live
  within a match in progress.
- **Per-match stats surface** — corners/fouls/cards are now computed in
  `MatchStatistics` but are not yet plumbed through to the web UI.
