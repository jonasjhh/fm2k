# TASK 3 — Newspaper: transfer rumours foreshadowing real AI moves (parked)

> Conventions and commands: see the backlog index (Claude plan file). Run everything via `mise exec -- pnpm <cmd>`, never commit.

The rest of the newspaper expansion (danger-man, form-watch, red-card, injury-averted and injury-return articles) shipped 2026-07-08. This is the one remaining newspaper idea, and it needs real plumbing:

`runAiMarketWindow` (`backend/src/app/session.ts`, private) is instant/synchronous today — AI market moves apply the moment a transfer window opens. Rumours need a **pending-moves queue on the session**: queue the AI's intended move, surface a rumour article immediately, apply the move for real N matchdays later.

When picked up, follow the existing generator/template pattern: template-pools + `pickTemplate(rng)` in `packages/newspaper/src/headlines.ts`, input types local to `packages/newspaper/src/types.ts` (the package depends only on `@fm2k/timeline`), session wiring via `pushHeadline` in `session.ts`, and a category entry in `NewspaperTab.tsx`'s label/color maps if a new `ArticleCategory` is added.
