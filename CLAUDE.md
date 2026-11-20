# Settlement strategy (glowing-octo-fishstick)

Always reply to the user in Russian, using simple non-technical language (the author is not a programmer).
Browser strategy game: TypeScript strict, PixiJS 8 (WebGL2), Vite, Vitest, ESLint 9.

## Where things are
- Spec: `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md`; architecture + stage-2 risks: `docs/architecture.md`
- Plans: `docs/superpowers/plans/`; decisions and deferred minors: `docs/superpowers/stage-*-decisions.md`
- Author feedback: `docs/feedback/`; screenshots: `docs/screenshots/`
- SDD ledger (local, not in git): `.superpowers/sdd/<plan>/progress.md` with briefs and reports

## Current state (update at the end of each stage)
Stages 1 (map) and 1.5 (feedback fixes) are closed; `stage-1-map` fast-forwarded into `main` 2026-11-20. New work starts on a fresh `stage-*` branch from `main`.
Still to show the author: sea and river screenshots (`docs/screenshots/stage-1-5/`; look accepted by Claude via checklist).
Next session, in order (once the author's weekly limits reset):
1. ~~Fix all confirmed findings in `docs/reports/`~~ — done 2026-11-20 (see `docs/reports/arena-translate-review.md` §4, rulings in `stage-1-decisions.md`).
   CI added 2026-11-20: `.github/workflows/ci.yml` (lint, types, tests, build on push to `main`/`stage-*` and PRs, ~2 min).
2. Run `ponytail-audit` (installed as a skill; Task B of `docs/reports/deepseek-review.md`) and triage the findings together.
3. ~~Merge `stage-1-map` into `main`~~ — done 2026-11-20.
4. Milestone 1, sub-stage 1.1 (time, start, fog): start with brainstorming with the author, based on «Readiness for stage 2» in `docs/architecture.md`.
   Code graph built 2026-11-20 over `src/` (AST only, local, git-ignored): `graphify-out/GRAPH_REPORT.md`, `graph.html`; refresh with `/graphify src --update`.

Roadmap (2026-11-20): development goes by milestones split into sub-stages, spec §8. Each sub-stage ends polished and viewable (mechanic → polish by checklist → before/after screenshots + "what to look at" note → author notes); raw work between sub-stages is not shown. Old "stage N" names map to sub-stages at the end of spec §8.

## Workflow
- New stage/feature: brainstorming with the author → spec → plan of tasks (superpowers:writing-plans).
- Execution via subagents (superpowers:subagent-driven-development). The main session is the controller: it does not write code, it dispatches and rules.
  - Per task: fresh implementer → separate reviewer → Critical/Important back to the same implementer → short re-review. End of stage: whole-branch review, one fix wave.
  - Parallel only for tasks touching different files.
  - Ledger: every decision as `Ruling: what — why — cost if wrong`; at stage end move them to `stage-*-decisions.md`, delete the ledger.
- Author feedback is a hypothesis: reproduce each note in code/browser before planning.
- Look changes: read `docs/visual-checklist.md` before accepting any rendered result.
- Commits: read `docs/commit-rules.md` before committing. Push `stage-1-map` after each task; never touch `main`, never delete branches.
- Shell: write commands in rtk form (`rtk git …`, `rtk read F`, `rtk vitest …`), see `~/.claude/RTK.md`.

## Token economy
- Language: code, code comments, identifiers, CLAUDE.md, briefs, agent reports, commit bodies — English. Replies to the author, commit titles, `src/i18n/ru.ts` — Russian. The commit co-author line names the model that made the commit (see `docs/commit-rules.md`). Translate old Russian comments only when touching that file.
- Docs: author-facing in Russian (spec, `docs/feedback/`, stage decisions, screenshot READMEs); agent-facing docs under `docs/**` in English, except `README.md`, `docs/feedback/**`, `docs/commit-rules.md` and `src/game/README.md`. New agent-facing docs are written in English; translate old ones only when editing them. `docs/` is not auto-loaded — read on demand.
- Models (always set explicitly): `haiku` — file search, reading logs/docs, tiny edits; `sonnet` — mechanical tasks, tests, UI, re-reviews; `opus` — architecture, shaders, hard debugging, final review.
- Sessions: 1 session = 1 phase (discussion+plan / execution / final review). Prefer a fresh session over a long tail; tell the author when it is time to switch (context long or phase done).
- Agent reports: terse English — changed files, test result, blockers. No retelling of the work; details go to the report file.
- Hand agents files (brief, diff), not summaries.
- External free models: Claude may call OpenCode itself (`oc run -m opencode/<id> "…"`, read-only second opinion; use `oc`, not `opencode`). LM Arena, Qwen, Codex — only manually by the author from a self-contained task.
  - Be proactive: at every task/stage boundary decide whether part of the work fits an external model and say so. Self-contained coding/translation/doc tasks with a clear acceptance check → offer the author a ready-to-paste brief for LM Arena or Codex (file under `docs/tasks/`), then review the result like any agent's work. Reviews, second opinions, audits → try OpenCode yourself now and then and compare with the Claude reviewer.

## Commands
`npm run dev` (port 5173) · `npm test` · `npm run lint` · `npx tsc --noEmit` · `npm run build`

## Hard rules
- `strict`, `noUncheckedIndexedAccess`; no `any`. Files ≤ ~450 lines.
- `src/sim/**` imports nothing from `src/render`, `src/ui`, `src/worker`, `src/i18n`, `pixi.js`, DOM; no `Math.random`, `Date`, `performance.now`, `crypto`, `setTimeout`, `fetch`, `self`.
- `src/game/**`: same, plus no inexact Math functions (lint-enforced).
- All UI text in `src/i18n/ru.ts`. Restrained UI: dark neutral panels, 1px borders, PT Sans; no ornaments, neon, gradient cards, emoji.
- Map: HoI4-like muted "paper" colours; no pixels at any zoom.
- Performance: 60 FPS on 4000 provinces; medium generation ≤ 8 s in the worker.

## GEN_VERSION
`GEN_VERSION` (`src/sim/world/params.ts`) is bumped by 1 for any generation change that alters output for the same `WorldParams`. In the same commit update `tests/sim/world/fingerprint.test.ts` — the only file with expected hashes. Same-output optimisations and render changes don't bump it; pure refactors must leave fingerprints unchanged. At most one bump per plan. Details: `docs/architecture.md`.

## After context compaction
Read this file → the ledger and `git log --oneline -20` → the current plan's first unfinished task. Don't redo committed work; check `git status` before editing. Before saying "done": `npm test`, `npm run lint`, `npx tsc --noEmit`.
