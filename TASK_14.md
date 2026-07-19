# TASK_14 — Player match rating overhaul

## Goal

Replace the flat event-delta table in `StatsAccumulator` with a richer,
position-aware rating engine that rewards players for doing the things their
role actually demands.

## What's wrong today

The current system (`packages/match/src/match/stats.ts`) uses a single
`RATING_DELTA` record keyed only on event type.  Every player gets the same
delta regardless of position, and several meaningful contributions are missing:

| Gap | Effect |
|-----|--------|
| No assists | A through ball that directly creates a goal gives the same +0.08 as one that doesn't |
| No clean-sheet bonus | A keeper/defence that concedes 0 gets no reward |
| No position weighting | A striker's clearance and a CB's clearance are worth the same |
| Defenders take no hit for being beaten | Losing a defensive duel produces no negative — only fouling does |
| Substitutes aren't penalised for inaction | A sub who does nothing earns 6.5, same as a dominant starter |

## Encapsulation plan

The rating logic should be extracted into a **`rating-engine.ts`** file
alongside `stats.ts` in `packages/match/src/match/`.  It stays within the
same module — no new package — but becomes a clearly bounded unit that
`StatsAccumulator` delegates to.

```
packages/match/src/match/
  rating-engine.ts      ← new: pure functions, no rng, no side-effects
  stats.ts              ← calls into rating-engine; no inline deltas
  stats.test.ts
```

`rating-engine.ts` exports:

```ts
import type { Band } from '../lineup/bands.ts';

export interface RatingContext {
  band: Band;            // GK | DEF | DM | MID | AM | ATT — from BAND_OF_ROLE[fieldedPosition]
  minutesPlayed: number;
}

/** Called once per relevant event during StatsAccumulator.record(). */
export function ratingDeltaForEvent(
  eventType: string,
  context: RatingContext,
  metadata?: Record<string, unknown>,
): number

/** Called once at full-time for each player who played. */
export function ratingDeltaEndOfMatch(
  context: RatingContext,
  goalsConceded: number,           // for clean-sheet / low-concede bonus
): number
```

`Band` is already the simulator's native positional vocabulary (defined in `packages/match/src/lineup/bands.ts` and used throughout the duel engine). Using it directly avoids a translation layer — the fielded position → band mapping already exists as `BAND_OF_ROLE`.

Both functions are pure — they take data and return a number — so they are
trivial to unit-test in isolation and trivial to swap out later.

`StatsAccumulator` needs to carry a `playerBands: Map<string, Band>`
populated at `seedPlayer()` time (the fielded position is already known at
kickoff; `BAND_OF_ROLE[fieldedPosition]` gives the band).

## New rating contributions to implement

### Assists
An assist requires tagging the `playerId` of the final ball before a goal.
The assist player is already known in `flow.ts` at the point the shot is
created (the `carrierId` who produced the cross/through_ball/long_pass that
entered the box).  Tag them in event metadata as `metadata.assistPlayerId`.
`StatsAccumulator.record()` reads this on every `goal` event and calls
`bumpRating(assistPlayerId, ratingDeltaForEvent('assist', context))`.

Deltas (starting suggestions — tune after implementation):

| Event | GK | DEF | DM | MID | AM | ATT |
|-------|----|----|-----|-----|-----|-----|
| goal  | 0.8 | 0.7 | 0.9 | 1.0 | 1.1 | 1.2 |
| assist| 0.4 | 0.3 | 0.5 | 0.6 | 0.7 | 0.5 |

(Strikers matter most for goals; AMs and midfielders matter most for assists.)

### Clean sheet / goals-conceded bonus (end of match)

Applied via `ratingDeltaEndOfMatch`:

| Goals conceded | GK   | DEF  | DM   | MID / AM / ATT |
|---------------|------|------|------|----------------|
| 0             | +0.5 | +0.3 | +0.1 | 0              |
| 1             | +0.1 | +0.1 | 0    | 0              |
| 2+            | 0    | 0    | 0    | 0              |

### Defensive duel penalty
When a defender loses a contested action (currently recorded as
`metadata.contestedAction` on the winning event), apply a small negative to
the beaten defender, not just the attacker who turned it over.

Suggested: −0.04 to the beaten DEF/DM when their side's contestedAction
metadata resolves as a turnover (i.e. the ball was not won back).

### Position-weighted event table (replaces flat RATING_DELTA)

Proposed weights per position group.  A `1.0` means full value of the base
delta listed below; scale everything else relative to it.

Base deltas (same as today):
- goal: 1.0, assist: 0.5, save: 0.2, tackle: 0.08, interception: 0.08,
  clearance: 0.08, through_ball: 0.08, long_pass: 0.05, cross: 0.05,
  dribble: 0.05, short_pass: 0.02, foul: −0.1, yellow: −0.3, red: −1.0

Position multipliers:

| Event        | GK  | DEF | DM  | MID | AM  | ATT |
|--------------|-----|-----|-----|-----|-----|-----|
| goal         | 0.8 | 0.7 | 0.9 | 1.0 | 1.1 | 1.2 |
| assist       | 0.4 | 0.3 | 0.5 | 0.6 | 0.7 | 0.5 |
| save         | 1.0 | 0   | 0   | 0   | 0   | 0   |
| tackle       | 0.5 | 1.2 | 1.2 | 0.8 | 0.6 | 0.4 |
| interception | 0.5 | 1.2 | 1.2 | 0.8 | 0.6 | 0.4 |
| clearance    | 0.5 | 1.2 | 1.0 | 0.6 | 0.4 | 0.3 |
| through_ball | 0   | 0.4 | 0.8 | 1.1 | 1.3 | 0.8 |
| long_pass    | 0.3 | 0.8 | 1.0 | 1.0 | 0.8 | 0.5 |
| cross        | 0   | 0.4 | 0.4 | 0.8 | 1.2 | 0.7 |
| dribble      | 0   | 0.5 | 0.6 | 0.9 | 1.2 | 1.2 |
| short_pass   | 0.3 | 0.7 | 1.0 | 1.2 | 1.1 | 0.8 |
| foul         | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| yellow_card  | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| red_card     | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

Note: LM/RM slots in predefined formations map to `MID` band; LW/RW map to `ATT`.
Crossing and dribbling get their winger-flavour boost through `AM` (attacking mids
playing wide) and `ATT` (wingers), not a separate `WID` group.

## Steps

1. Create `packages/match/src/match/rating-engine.ts` with `ratingDeltaForEvent`
   and `ratingDeltaEndOfMatch` as pure exported functions.
2. Write `rating-engine.test.ts` covering:
   - correct delta per event/position combination
   - clean-sheet bonus for GK and DEF
   - zero delta for irrelevant positions (GK save ignored for ATT, etc.)
3. Tag `metadata.assistPlayerId` in `flow.ts` on shot/goal sequences where a
   carrier produced the final ball into the box.
4. Update `StatsAccumulator`:
   - Accept `playerPositions: Map<string, PositionGroup>` in constructor (or
     via `seedPlayer`).
   - Replace inline `RATING_DELTA` lookups with calls to `ratingDeltaForEvent`.
   - Add `ratingDeltaEndOfMatch` call in `build()` for each seeded player.
   - Read `metadata.assistPlayerId` on `goal` events and bump the assister.
5. Update `stats.test.ts` — existing tests need position context passed in.
6. Run `mise exec -- pnpm check` and `pnpm test:coverage`.

## Out of scope

- Separate rating display by half (half-time ratings vs full-time) — future.
- "Man of the match" logic — could be derived from ratings later.
- Penalty-shootout contributions — too niche, skip for now.
