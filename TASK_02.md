# TASK 2 — Bug: formation change mid-match doesn't take effect

> Conventions, commands and the determinism rule: see the "How this repo works" section of the backlog index (Claude plan file) — in short: run everything via `mise exec -- pnpm <cmd>`, never commit, Vitest tests colocated next to source; web tests mock the store module via `vi.mock('@/store/game-store', ...)`.

## Root cause CONFIRMED (verified by direct code reading — this is not a hypothesis anymore)

This is a **UI bug only**. The engine side is correct and needs no changes.

- `apps/web/src/screens/GameInterface.tsx:45-137`: `isOwnMatchLive` (line 57) gates tab navigation — while a match is live, **only the "match" tab is reachable** (line 124 blocks `onChange`; line 135 disables every other `Tab`). Squad/Tactics/Training/Transfers are all unreachable.
- `apps/web/src/components/tabs/MatchTab.tsx:159-171` embeds its OWN `TacticsSection` (style + sliders only) with `disabled={isStreaming}` — this is why style/slider changes work mid-match: they got a duplicate home on the Match tab. **Formation has no equivalent control anywhere on MatchTab.** `MatchTab.tsx:118-121` renders `FormationGrid` for both teams but it's **display-only**, no click handler. The only formation selector in the whole app is on `TacticsTab.tsx:104` (`onClick={() => setFormation(f)}`), which is unreachable while `isOwnMatchLive`.
- Engine side confirmed correct: `MatchOccurrence.applyPendingTactics`/`tacticsSignature` (`packages/match/src/match/match-occurrence.ts:121-171`) already hashes `[tacticsParams, formation, customSlots]` and re-derives `fieldedPositions` on ANY change including formation-only, called every tick (`onTick`, line ~193). `session.setFormation` (session.ts:1386-1390) → `clubManager.setFormation` → `clubChanged()` → `syncPlayerTeam()` (session.ts:1309-1322) unconditionally mirrors `cs.formation` onto the live `Team` object with **no gating on whether a match is live** — it would work correctly the moment the command reaches the session.
- The existing test `match-occurrence.test.ts:629-638` ("formation change mid-match then fielded positions are re-derived") passes today and accurately exercises the real mechanism (`team.formation = ...` is exactly what `syncPlayerTeam` does), it just doesn't cover the UI-reachability layer — which is where the actual bug lives.

## Fix

Pick one (ask the user if unsure): (a) add a formation selector to `MatchTab`'s embedded tactics section, mirroring how style/sliders got their duplicate home there; or (b) loosen the `GameInterface.tsx` tab lock to also permit the Tactics tab while `!isStreaming` (paused). Either way, add a web test asserting the formation control is reachable and functional while a match is paused.
