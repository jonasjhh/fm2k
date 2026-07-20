# TASK_17 — Recorded-form momentum (cross-competition, capped)

> Conventions: run everything via `mise exec -- pnpm <cmd>`, never commit. Verify with `mise exec -- pnpm check`.
> **Depends on TASK_11** (the match engine must already accept a per-team form modifier — Piece 1). This task supplies the *value* of that modifier from real recorded results.

## What this is

TASK_11 (Piece 1) gives the match engine a per-team **match-sharpness** modifier: a
random attribute shift drawn at kickoff that adds correlated match-level variance
(upsets, demolitions, dull draws). That draw is centred on zero — pure noise.

This task (Piece 2) makes the *centre* of that draw reflect a team's **recent
results**. A team on a winning run plays a few points sharper on average; a team in a
slump plays a few points flatter. The random component from TASK_11 still sits on top,
so form **tilts** a team, it never **locks** them — anyone can still have an off day,
and no streak makes a team invincible.

## Current state

- `recentForm(fixtures, teamId, count)` in [`packages/engine/src/league/form.ts`](packages/engine/src/league/form.ts)
  returns the last N results (W/D/L) for a team from **one** competition's fixtures.
- It is used **only** by the newspaper "form watch" article ([`session.ts`](backend/src/app/session.ts)),
  scoped to the player's league. It does **not** feed the match engine.
- The world is multi-competition: `leagueManagers`, `cupManagers`, `qualifierManagers`,
  `playerCupManager` all hold fixtures ([`session.ts`](backend/src/app/session.ts)).

## Design

### 1. Holistic (cross-competition) form

Form must be computed across **all** of a team's competitions, not just its league —
a team on a cup run is in form regardless of the league table. Add a helper that
unions a team's completed fixtures across every `CompetitionManager` before calling
`recentForm`:

```ts
// backend/src/app/session.ts (or an engine helper)
function allFixturesForTeam(managers: CompetitionManager[], teamId: string): Fixture[] {
  return managers
    .flatMap(m => m.getState().fixtures)
    .filter(f => f.homeTeamId === teamId || f.awayTeamId === teamId);
}
// recentForm already sorts by matchday + filters to completed, so passing the union works,
// BUT matchday is per-competition — see "Ordering caveat" below.
```

**Ordering caveat:** `recentForm` sorts by `matchday`, which is only meaningful
*within* one competition. For a cross-competition union we must sort by **date/kickoff
time**, not matchday. Either (a) add an optional date accessor to `recentForm`, or
(b) compute form in the backend using each fixture's scheduled timestamp. Prefer (b) —
keep `recentForm` as the league-table helper it is and add a date-ordered
`recentFormAcross(fixtures, teamId, count)` that sorts by kickoff time.

### 2. Form → modifier value (capped)

Map the recent W/D/L run to a small attribute delta:

```ts
// W = +1, D = 0, L = -1, weighted toward most-recent games, then scaled + capped.
const FORM_POINT = { W: 1, D: 0, L: -1 };
const FORM_CAP = 5;          // max ± attribute points from form alone
const FORM_SCALE = 1.4;      // points per net-weighted-win

function formModifier(results: FormResult[]): number {
  // most-recent games weigh more (recency): weight i-th most recent by (count - i)
  let weighted = 0, wsum = 0;
  results.slice().reverse().forEach((r, i) => {
    const w = results.length - i;
    weighted += FORM_POINT[r] * w;
    wsum += w;
  });
  const norm = wsum === 0 ? 0 : weighted / wsum;   // -1..+1
  return clamp(-FORM_CAP, FORM_CAP, norm * FORM_SCALE * results.length / 5);
}
```

- **Capped at ±5** so a perfect 5-win streak adds at most +5 effective OVR — meaningful
  but never decisive against the ±random spread from TASK_11 (σ≈6).
- **Season start** → `recentForm` returns `[]` → modifier is `0`. Falls out naturally.
- **Few games played** → the `results.length / 5` factor scales the effect down until a
  team has a full 5-game sample, so early-season form doesn't over-swing.

### 3. Wire into the match call

The backend computes `formModifier` for both teams and passes them into the match
config as the *mean* of TASK_11's sharpness draw:

```ts
// where the sim is invoked (match-occurrence / session play path)
homeFormBias: formModifier(recentFormAcross(homeFixtures, homeId)),
awayFormBias: formModifier(recentFormAcross(awayFixtures, awayId)),
```

TASK_11's engine draw becomes `sharpness = formBias + random(σ)`, clamped. When
`formBias` is absent (calibration harness, quick sims), it defaults to 0 and behaviour
is identical to TASK_11 alone.

## Files to touch

| File | Change |
|------|--------|
| `packages/engine/src/league/form.ts` | Add `recentFormAcross` (date-ordered) + `formModifier` (capped) |
| `packages/engine/src/index.ts` | Export the new helpers |
| `backend/src/app/session.ts` | Gather cross-competition fixtures per team; pass `homeFormBias`/`awayFormBias` into the sim |
| `packages/match/src/match/types.ts` | `MatchConfig`: optional `homeFormBias`/`awayFormBias` (consumed by TASK_11's sharpness draw) |
| `packages/engine/src/league/form.test.ts` | Cap, recency weighting, empty-form-→-0, few-games scaling |

## Things to be careful about

- **Cap is load-bearing** — the whole "no one becomes invincible" guarantee rests on
  `FORM_CAP` being small relative to TASK_11's σ. Keep `FORM_CAP ≤ σ`.
- **Not calibratable by the harness** — the calibration report has no fixtures, so form
  bias is always 0 there. This is intentional: TASK_11 is calibrated with pure noise;
  this task layers gameplay momentum on top of an already-locked sim. Do not retune
  spreads or σ for this task.
- **Cross-competition ordering** — sort by kickoff date, not matchday, or a cup result
  will be mis-ordered against league results.
- **Player's own team too** — apply form bias to both teams, including the player's, so
  a slump feels real (not just an AI buff).
