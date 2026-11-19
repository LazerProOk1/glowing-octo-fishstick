# Project status

Date: 2026-11-19. Branch `arena/88549d63-glowing-octo-fishstick`, base `stage-1-map` at `e07d4541`.
This is a measurement, not a fix: nothing in `src/**` or `tests/**` was touched to produce it.

## Checks

| Command | Result | Exit | Time |
| --- | --- | --- | --- |
| `npm test` | 47 files passed, 480 tests passed, 15 skipped (495) | 0 | 271.5 s |
| `npm run lint` | no output (clean) | 0 | ~9 s |
| `npx tsc --noEmit` | no output (clean) | 0 | ~3 s |

Environment: Node v22.22.3, npm 10.9.8.

The 15 skipped tests are deliberate (`it.skipIf` / size and performance guards), not silenced failures:
they are the `large`-world smoke cases, the small-world headroom checks and the ones that need a
browser. `grep -c "✗\|FAIL"` over the run log is 0.

## What is on the branch

At the time of this report: 9 commits, 106 files, +2424 / −1971 against `e07d4541`:

- `db513d2` — every Russian code comment and test title under `src/**` and `tests/**` translated to
  English. The diff was checked hunk by hunk: comments and test titles only, no code, logic, formatting,
  imports, string literals or identifiers changed. Fingerprints in `tests/sim/world/fingerprint.test.ts`
  unchanged, `GEN_VERSION` not bumped.
- `3d044aa`, `4fa799b`, `e9c2d97`, `8a2ba22`, `63f5d40`, `a8e106e`, `b1cdd50` — the documents:
  `docs/architecture.md`, `docs/modding/biomes.md`, both stage plans, the design spec, the stage 1
  decisions log and the screenshots README, translated to English with the structure, numbers, code
  blocks and identifiers preserved.
- `a5d8539` — the documentation audit and the translation glossary.

## Code health, as measured today

| Signal | Value | Comment |
| --- | --- | --- |
| Files over the ~450-line limit | 1 | `src/render/mapShader.ts` 455 |
| Next largest | — | `MapView.ts` 431, `provinces.ts` 421, `riverLayer.ts` 381 |
| Tests | 47 files | Green, deterministic, 4.5 min |
| Type errors | 0 | `strict`, `noUncheckedIndexedAccess` |
| Lint errors | 0 | Includes the `src/sim` import and `Math.random` bans |

## Open findings that this branch did not cause and did not fix

From `docs/reports/arena-translate-review.md` (written while reading the code, deliberately not fixed):

- **C1** Russian exception messages reach the player through `errorDetail()`, bypassing `ru.ts`
  (`src/ui/errorScreen.ts:29-31`, `src/main.ts:112,172,202`). Re-confirmed today: the function still
  returns the raw message for everything except `ERR_CLEANUP_NO_CONVERGE`.
- **I1** `mapShader.ts` is 455 lines against a ~450 limit — still true.
- **I2** "biome → water kind" is implemented twice (`src/render/bake.ts:63-70` vs
  `src/render/textures.ts:109-118`) with a comment claiming both are the same mapping.
- **I3** the detail atlas slots are declared twice (`src/content/biomes/types.ts:5`,
  `src/render/assets.ts:7-27`); `tests/render/assets.test.ts:15` asserts the name→index order, so the
  order cannot drift silently.
- **I5** an unknown biome code throws in `bake.ts:73-77`, but `biomeColors.ts:44-51` silently paints
  beach and marks it land.
- **I6** the Cyrillic guard test only looks at `src/ui/*.ts` (`tests/i18n.test.ts:13,58`).

The line references were spot-checked against the current code and still point where the report says.

## Documentation state

English: `docs/architecture.md`, `docs/modding/biomes.md`, both plans, the spec, the stage 1 decisions
log, `docs/screenshots/stage-1-5/README.md`, `docs/reports/*`, `docs/translation-glossary.md`,
`docs/visual-checklist.md`.

Russian on purpose: `README.md`, `docs/feedback/stage-1.md` (the author's own words),
`docs/commit-rules.md` (quotes Russian commit titles), `src/game/README.md`.

Details and the two Important findings are in `docs/reports/docs-audit.md`.

## Verdict

From the checks: the branch is green and safe to merge — it changes comments, test titles and
documents, nothing else. From the code: the project carries the five open findings listed above, all
pre-existing, all cheap to fix in a separate pass, none of them blocking.
