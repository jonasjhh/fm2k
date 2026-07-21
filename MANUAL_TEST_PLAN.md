# FM2K — Manual test plan

**Status (2026-07-21):** Rework Steps 1–5 are manually verified and removed from this plan. TASK_15 (simulation richness) and TASK_11 (spread tuning + soft-knee gap saturation + match-form variance + header conversion blend) are complete — repo check green. Engine calibration now at realistic football volumes with a proper skill gradient (gap-20 ~72% wins, big gaps saturate ~78–80% and never reach 100%, upsets always possible). Everything below is still an **open checklist**. Dev status lives in the plan file (`right-but-show-it-agile-rose.md`), not here.

## In-match injuries (Steps 9A/9B)

Setup: new game, Match tab. Injuries average ~1 per team per 3–4 matches, so play/simulate several matches.

1. **Auto-pause on your injury**: when one of YOUR players is injured during a played match, the stream stops with a red banner "Injury! Your player can't continue — make a substitution…". The ticker shows an amber line naming player, cause and layoff.
2. **Playing short**: your side is down to 10 until you sub (costs one of the 5); after the sub the team is back to 11.
3. **No re-entry**: the injured player never reappears in the "On" dropdown that match.
4. **Opponent events don't pause**: opposition injuries AND red cards show in the ticker but stream on (own-team-only pausing is deliberate).
5. **Cause variety** over several matches: impact injuries from challenges/fouls, muscle from sprints/through-ball runs, head/shoulder from aerial duels, rare keeper knocks; broken legs only ever come from carded fouls.
6. **Severity feel**: mostly 1–2 match knocks; 3–5 sometimes; 8+ rare. Exact rates are Task 7's job (see `TASK_07.md`).
7. **Post-match unchanged**: injured chip + toast; Play blocked until the XI is fixed; the lineup itself is never auto-changed.
8. **Regression**: Sim. Season completes normally and isn't slower; pauses/subs/HT+FT stat sheets/insight cards all still work.

## Injury-cleared toast wording

9. **Avert wording**: keep playing matches until a reported injury is averted by the medical staff — the toast should read something like "…turned out to be nothing serious — cleared by the medical staff," not the "back from injury" wording.
10. **Natural-recovery wording**: let a confirmed injury run its full countdown — the toast should read "X is back from injury and available for selection." Confirm the two wordings are never swapped.

## Ticker goal build-up + shot visibility

11. **Shots now appear**: play a live match and confirm `shot` events show individually in the ticker even when they don't lead to a goal (previously silent).
12. **Goal build-up**: when a goal is scored, confirm the ticker shows a short run of build-up lines (passes/dribbles/crosses/shots by the scoring side) immediately before the goal line, not just the bare goal — and that it doesn't run on forever (capped at 6 events) or bleed in events from the other team.
13. **Chunk-boundary truncation is acceptable**: if a goal's build-up started right at the edge of a streaming chunk, it's fine for the shown build-up to be shorter/truncated rather than showing the true full passage of play — this is a known, accepted limitation, not a bug to chase.

## Tempo & defensive-line match insights

14. **High tempo, sloppy passing**: play/sim several matches with the tempo slider pushed high; when pass completion comes out low, confirm "High tempo cost you control" appears in the half-time/full-time insight cards (subject to the 3-insight cap and other detectors possibly ranking higher).
15. **Low tempo, tidy passing**: same, tempo slider pushed low with a high completion rate — expect "Patient tempo kept things tidy".
16. **High defensive line punished**: push the defensive-line slider high and watch for repeated fast-break goals conceded (opponent wins the ball and breaks quickly with a long ball/through ball) — expect "Your high line got exposed on the counter" once 2+ such goals are conceded in a match.
17. **No false positives**: confirm these two insights stay quiet on a normal/mid-slider match — they shouldn't fire on every game.

## Newspaper expansion

18. **Preview coverage**: start a new game and open the Newspaper tab — a "Preview" article naming the next opponent's stand-out player should already be in print. Play/sim a matchday: exactly one new preview appears for the following fixture (no duplicates, and simming many rounds shouldn't flood the paper with stale previews — old ones expire after a week).
19. **Form watch**: after ~5+ league matchdays, when the upcoming opponent is on a hot streak (4+ wins in their last 5) or a slump (4+ winless), a "Form Watch" article appears alongside the preview; a mid-table mixed-form opponent gets none.
20. **Red-card story**: when one of YOUR players is sent off in a played/simmed match, a "Discipline" article naming him appears. Opponent reds get no article (deliberate — own-club scope, like injuries).
21. **Injury scare cleared**: when the medical staff avert a reported injury (toast: "nothing serious"), an injury article ("Relief as …'s knock proves minor" etc.) appears too.
22. **Long-layoff return**: when a player returns from an injury that was originally 4+ matches, a comeback article appears; returns from 1–3-match knocks stay toast-only.
23. **Category chips render**: the new Preview / Form Watch / Discipline chips display with sensible colors on the sepia page.

## Rework Step 5.5 — player generation & world regeneration

24. **New-game world levels**: start a new game and browse squads across divisions — div 1 players mostly ~45–75 OVR, div 2 ~25–55, div 3 ~15–45, with visible overlap between adjacent divisions. No division should feel uniformly rated.
25. **Archetypes visible**: open several squads and check player attribute spreads — you should be able to spot clear types (fast-but-frail sprinters, slow tanks, silky creators with weak defending, destroyers with poor passing) alongside more rounded players. Big attribute gaps (30+) should exist but not dominate.
26. **Stars and veterans**: div 1 should hold a handful of 70+ players, mostly prime-age (26–31); genuinely world-class 85+ players should be very rare (a few across the whole world). Div 2/3 should have essentially none.
27. **Wonderkids**: occasionally a young (17–20) player appears who is decently good at nearly everything (small internal spread) with high potential — rare but findable.
28. **No outfield keepers**: outfielders' Keeping stays 5–20 everywhere.
29. **Market sanity**: transfer market listings span OVR 40–69 (random draw each slot), so D3 clubs find cheap options, D2 clubs find solid upgrades, and D1 clubs can find quality reinforcements; free agents sit in the 22–49 band (good for D3/D2 signings). Youth intakes arrive low-rated (~26±) with potential ~40–86 depending on academy.

## Calibration report (Step 6c)

30. **Run the report**: `mise exec -- pnpm --filter @fm2k/engine calibration-report` (~54s) → diff `CALIBRATION_REPORT.md`. Confirm it completes without errors and the churn table runs to season 25.
31. **Churn pyramid in the free-agent pool**: during a window, browse free agents and confirm a visible quality spread — mostly D3/D2-quality fillers, a decent middle tier, occasional D1-level players; very rarely a young (18–19) high-OVR player with big potential (a wonderkid). No flood of 70+ players.
32. **AI pickup delay**: release a player mid-window (sell to free agents). For the next 1–2 weeks of in-game time they should remain available on the free-agent screen but AI clubs should not sign them immediately — check that they're still in the pool after a few days. (After ~2 weeks AI clubs will start picking them up, which is expected.)
33. **Market sanity post-calibration**: after several seasons, division-appropriate quality should circulate through the market — D1 clubs attracting the best free agents, D3 clubs picking up lower-end players. No single tier should dominate the entire pool.

## Calibration test gates (Step 7)

34. **Run the calibration test suite**: `mise exec -- pnpm --filter @fm2k/match test:calibration` — all tests should pass. These gates lock the engine's settled output; they are not meant to be eyeballed, just green/red. If any fail after a duel-knob change, the knob has pushed a number outside the agreed band.
35. **Gap-20 win rate note (TASK_11 done)**: after the spread retune + match-form variance, a 20-point OVR gap (65v45) now delivers ~72% wins and the gate is `> 0.62`. Big gaps soft-saturate (gap-40/50 ~78–80%, never 100%) via the `saturateGap` knee, and upsets stay possible at every gap (a tier-3 side beats a tier-1 sometimes) — verify this "any given Sunday" feel holds in play, and that a strong-but-modest-finisher target man is a genuine header threat.

---

Then Task 7 (`TASK_07.md`): run `mise exec -- pnpm --filter @fm2k/match test:calibration` and report failures.
