# Documentation audit

Date: 2026-11-19. Scope: every tracked `*.md` file (14 files, `git ls-files '*.md'`), plus the image
files the docs point at. Two things were checked: **links** (markdown links and backticked paths) and
**topical drift** (does a sentence still describe the code that is there now).

Method: a script resolved every markdown link and every backticked path/name against `git ls-files`,
first as a path relative to the repo root, then relative to the document, then by basename anywhere in
the repo. Line references of the form `file.ts:12-34` were opened by hand and compared with the text
that the sentence claims they contain. Nothing was fixed; this is a report.

## Summary

| Severity | Count | What |
| --- | --- | --- |
| Critical | 0 | Nothing that sends a reader to a dead end in a document they have to follow right now |
| Important | 2 | One live path that no longer exists, one language rule that is now out of date |
| Minor | 5 | Historical plans mention modules that were since moved or merged, plus cosmetic bits |

Checked and clean: all 14 markdown links between documents resolve, all 20 screenshot paths in
`docs/screenshots/**/README.md` exist, all 32 commit hashes in `docs/superpowers/stage-1-decisions.md`
are intact, and 18 spot-checked `file:line` references in `docs/reports/arena-translate-review.md`
still point at the lines they describe.

## Important

### A1. A live guide points at a test file that does not exist

`docs/modding/biomes.md:171` — "`tests/sim/world/provinces.test.ts` — provinces are uniform by biome…".

There is no `tests/sim/world/provinces.test.ts`. The province tests were split by world size into
`provinces.small.test.ts`, `provinces.medium.test.ts`, `provinces.mediumExtra.test.ts` and
`provinces.seas.test.ts`, all four sharing the suite in `provincesSuite.ts` (helpers in
`provinceMetrics.ts`). This is the modding guide, the document a content author actually follows, so
the wrong name costs real time.

Suggested fix: name the family and the shared suite instead of one file, for example
"`tests/sim/world/provinces.*.test.ts` (the shared suite is `provincesSuite.ts`)".

### A2. The language rule in `CLAUDE.md` no longer matches `docs/**`

`CLAUDE.md:33` lists what is English: "code, code comments, identifiers, CLAUDE.md, briefs, agent
reports, commit bodies". Documents under `docs/**` are not mentioned, and until today they were
Russian. After this branch most of them are English:

- English now: `docs/architecture.md`, `docs/modding/biomes.md`, both plans, the spec, the stage-1
  decisions log, `docs/screenshots/stage-1-5/README.md`, `docs/reports/*`.
- Russian on purpose: `README.md`, `docs/feedback/stage-1.md` (the author's own words),
  `docs/commit-rules.md` (quotes Russian commit titles), `src/game/README.md`, `docs/visual-checklist.md`.

Without this line being updated, the next agent either translates the remaining Russian files by
accident or "restores" the old ones. Suggested fix: one sentence in `CLAUDE.md` saying that `docs/**`
is English except `README.md` and `docs/feedback/**`, which stay Russian.

## Minor

### A3. Historical plans mention a module that has moved

`src/render/distanceField.ts` and `tests/render/distanceField.test.ts` are referenced in
`docs/superpowers/plans/2026-11-16-stage-1-map.md:208-209` (Task 7 creates them) and
`docs/superpowers/plans/2026-11-18-stage-1-5-feedback.md:58,66` (Task 2 decides whether to re-export
or delete it). The code now lives in `src/sim/geom/edt.ts`; `src/render/distanceField.ts` is gone.

This is a plan, i.e. a record of what was planned at the time, so rewriting it would falsify history.
Leaving it is correct; the note here is only so nobody goes looking for the file.

### A4. Historical plans mention `tests/golden.test.ts`

`docs/superpowers/plans/2026-11-16-stage-1-map.md:383,405` — the file was later folded into
`tests/sim/world/fingerprint.test.ts`. Same reasoning as A3: history, keep.

### A5. Screenshot table uses a shorthand instead of a path

`docs/screenshots/stage-1-5/README.md:13` — "`../stage-1/beta-7-fantasy-overview.jpg`, `-mid.jpg`".
The second entry means `beta-7-fantasy-mid.jpg` in the same folder, which exists, but `-mid.jpg` alone
is not a path a reader can open. Cosmetic, present in the original too.

### A6. Russian files that were deliberately left alone

`README.md` (12 Russian lines), `docs/feedback/stage-1.md` (17), `docs/commit-rules.md` (8, quoting
Russian commit titles), `src/game/README.md` (12), `docs/visual-checklist.md` (1). Listed so that the
"is everything translated?" question has an answer: no, and that is intended.

### A7. Leftovers worth a look when the code is touched next

- `docs/reports/arena-translate-review.md:195` reports that the comment in `src/i18n/ru.ts:68` promises
  an `en.ts` that does not exist. Still true — the comment is still there.
- The same report's item C1 (Russian exception text reaching the player through `errorDetail()`) is
  still open: `src/ui/errorScreen.ts:29-31` returns the raw message for anything except
  `ERR_CLEANUP_NO_CONVERGE`.
- `docs/architecture.md` says "no more than ~450 lines" while `src/render/mapShader.ts` is 455 lines
  (report item I1). The doc is right, the code is over the limit.

## What was checked and found consistent

- Cross-document references: `docs/architecture.md` "Readiness for stage 2" is now referenced by that
  English name from the spec and the stage 1.5 plan (the Russian name «Готовность к этапу 2» was
  updated in this branch because the section itself was translated).
- Numbers quoted in documents match the code and the reports: `GEN_VERSION` history v1–v3, medium
  2048×1024 / large 3072×1536 / small 1024×512, `LAKE_MAX_CELLS = 6000`, the 32-biome cap, the 200-cell
  and 3..12 % fantasy checks, priorities 95/90/80/70/60/50/40/30/20/10/0.
- Seeds quoted in documents (`"1"`, `"2"`, `"Бета-7"`, `"worldbox"`, `""`, `"tiny-islands"`) all still
  appear in the tests.
- Every backticked module path in the live documents (`docs/architecture.md`, `docs/modding/biomes.md`)
  exists.
