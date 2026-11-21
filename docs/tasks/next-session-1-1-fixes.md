# Next session: 1.1 author notes → fixes → merge → 1.2 brainstorm

> Для автора: скопируйте всё, что ниже линии, в новую сессию Claude Code в этой папке.

---

You are continuing a browser strategy game we are building together: a settlement grows from one tribe in 3000 BC into a nation (spec: `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md`, read §1, §2, §5, §8 and §8.1). The author is not a programmer; they judge the game by how it looks and feels. Reply to them in Russian, simply.

**Be a game designer here, not just a task runner.** Before and during the work, keep asking: what does the player feel in the first 30 seconds after the map appears? Is the start exciting — do I want to press Space and see what happens? Is my land clearly *mine*? When something looks weak, say so and propose a better option with a one-line reason; offer 2–3 concrete choices (a small visual mock-up helps the author choose) instead of silently doing the minimum. Look at the game in the browser yourself, often, at real window sizes — screenshots are your evidence. Taste references: HoI4 / Europa Universalis map readability, calm "paper" palette, restrained modern UI.

## Read first
1. `CLAUDE.md` (workflow: you are the controller, subagents write code; models; hard rules; rtk shell form) and `~/.claude/RTK.md`.
2. `docs/screenshots/stage-1-1/REPORT.md` and `README.md` (what 1.1 delivered, doubts), `docs/superpowers/stage-1-1-decisions.md` (rulings, deferred list).
3. `docs/architecture.md`, `docs/visual-checklist.md`, `docs/commit-rules.md`.
4. `graphify-out/GRAPH_REPORT.md` to find code (`graphify update . --force` if stale). Key files: `src/game/{start,visibility,clock,calendar}.ts`, `src/ui/gameSession.ts`, `src/render/{fogLayer,fogFade,provinceState,startView,MapView}.ts`, `src/render/shaders/fog.ts`.

Branch: `stage-1-1-time-fog` (not merged yet). Never touch `main` without the author's yes.

## Part 1 — author notes on 1.1 (do these first)
**Note A (author's decision, spec §8.1): the player starts with 2–3 adjacent provinces, not one.** On seed `1` the single start province was a thin coastal sliver — it felt like nothing.
- Brainstorm briefly with the author (2–3 options with a mock-up): 2 or 3 provinces? fixed count or by size? minimum total size (cells) so the start never looks tiny? must the group touch the sea / a river? Recommend one.
- Then: `src/game/start.ts` returns a group (deterministic from the seed, `createRng`, no `Math.random`; keep the fallback ladder; tests on 5+ seeds incl. `1`, `worldbox`); visibility = the group + all neighbours of every group province; the red own-border goes around the **outer edge of the group only**, not between own provinces (this is the seed of the 1.5 country border — make it look like one country); `startView` frames the whole group; tooltip/fog unchanged.
- Check in the browser: seeds `1`, `worldbox`, and 3 more; 3 zooms; does the start now read as "my small land"?

**Note B (from the 1.1 doubts, fix if cheap, otherwise keep in the deferred list):** the 10-minute run at top speed was only 3.4 minutes — redo it fully on one seed (no clicking in the pane) and report the date reached and console; tiny lake-rim brightness under fog; the fogged river-tip stub at max zoom; Pixi "texture destroyed while bound" warnings on world switch (find the cause).

Ask the author if they have more notes on 1.1 before closing Part 1. Then whole-diff review (opus) → one fix wave → before/after screenshots + a short Russian note → wait for the author's OK → merge `stage-1-1-time-fog` into `main` (fast-forward) only after an explicit yes.

## Part 2 — sub-stage 1.2 "The settlement lives" (brainstorm only, no code)
Spec §8 item 1.2: population, food, wood, stone rise and fall on their own; province panel on click (numbers, building slots); a town sprite on the map grows with the population; polish: an icon pack, clear tooltips, readable numbers. The approved UI style and a full-screen mock-up exist (resource bar top-left, province panel left, event feed bottom-right — ask the author to confirm the layout again; F3 debug panel stays top-left, so the province panel must not collide with it).
Run superpowers:brainstorming with the author: what makes the first 5 minutes interesting before buildings exist (1.3)? what is the threat/goal? which numbers are shown and how? how the town sprite looks (offer 2–3 styles). Write the agreed details into spec §8.2 and a plan `docs/superpowers/plans/<date>-stage-1-2-settlement.md` (superpowers:writing-plans). Then tell the author it is time for a fresh session for execution.

## Rules of thumb
- Author feedback is a hypothesis: reproduce it in the browser first.
- Visual changes are closed only with screenshots the author has seen.
- Keep the ledger `.superpowers/sdd/<plan>/progress.md`; rulings as `Ruling: what — why — cost if wrong`.
- Before "done": `npm test`, `npm run lint`, `npx tsc --noEmit`. Push the branch after each task.
- Tell the author when the context is long or a phase is done → new session.
