# DeepSeek review — PR #1

Base: `stage-1-map`. Head: `arena/88549d63-glowing-octo-fishstick` (`ebfca7e`). Reviewed 2026-11-19.

Translation under review: **Arena Agent Mode via LM Arena** (commits `db513d2`..`ebfca7e`; co-authors `Arena Agent Mode via LM Arena` and `arena-agent`). Review, report and follow-up fixes: **DeepSeek Harness**.

Post-review change: the root MIT `LICENSE` was removed in a separate commit (`d61750c`); the `src/`/`tests/` diff is still comments and test titles only.

## Task A — are the source changes comments/docs only?

### A1. Non-comment / non-title changes (at review head)

Code-token changes (5, one file):

- `tests/worker/genClient.test.ts:167` — `() => {` → `async () => {` (title also translated).
- `tests/worker/genClient.test.ts:192` — `() => {` → `async () => {`.
- `tests/worker/genClient.test.ts:203` — `() => {` → `async () => {`.
- `tests/worker/genClient.test.ts:221` — `() => {` → `async () => {`.
- `tests/worker/genClient.test.ts:230` — `() => {` → `async () => {`.

No `await` was added in that file; the change is behaviour-neutral but is a code-token change.

Resolved after review: all five were removed in a follow-up commit; the final PR diff has no code-token changes.

Eight changed lines contain code plus a translated trailing comment; the code before `//` is byte-identical: `src/main.ts:162`, `src/worker/genClient.ts:87,112`, `tests/render/camera.test.ts:74-75`, `tests/render/coast.test.ts:238`, `tests/render/riverLayer.test.ts:110`, `tests/sim/world/biomes.test.ts:124`.

All other 95 changed `src/`/`tests/` files: none.

Counts: 96 files (51 `src/`, 45 `tests/`); +1088/−1083 lines; 802 comment lines removed / 807 added; 273 title lines removed / 273 added; 0 blank-line or tab changes; `git diff --check` clean.

Report accuracy (`docs/reports/arena-translate-review.md`):

- `:11` says 89 under `src/` and 7 under `tests/`; actual 51/45.
- `:14-16` says 0 non-comment violations; contradicted by the five `async` insertions.
- `:12-13` (802 comments / 273 titles) matches the removed-line counts.

### A2. `src/i18n/ru.ts`

`git diff --name-only stage-1-map...HEAD -- src/i18n/ru.ts` is empty; blob `03cca84edc18ea46084b6a38c017870f1d92e83f` is identical at base and head. Untouched.

### A3. Commands

- `npm test` — **FAIL**. First error: `tests/sim/world/generateWorld.test.ts:27` hook timed out in 60000ms (first run: 4 tests + 1 suite timed out; 467 passed / 24 skipped). A second full run failed on timing/performance: `tests/sim/world/generateWorld.test.ts:101` measured 32088.8ms > 20000ms; `tests/sim/world/biomes.test.ts:166` timed out at 5000ms; plus 4 unhandled Vitest worker timeouts. A rerun of the four timed-out files with `--testTimeout=120000 --hookTimeout=180000` passed 49/49. No logic assertion failed.
- `npm run lint` — **PASS**.
- `npx tsc --noEmit` — **PASS**.

### A4. Cited reports — top 5 findings each

`docs/reports/arena-translate-review.md`:

- C1 — **CONFIRMED** — `src/ui/errorScreen.ts:31` returns `raw` for all but `ERR_CLEANUP_NO_CONVERGE`; `src/main.ts:112` passes it to `showError`; Russian throws at `src/sim/world/generateWorld.ts:20,43,46`.
- I1 — **CONFIRMED** — `src/render/mapShader.ts:1-455` is 455 lines; `CLAUDE.md:44`; `src/render/MapView.ts` 431, `src/render/riverLayer.ts` 381; no other `src/**/*.ts` is over 450.
- I2 — **CONFIRMED** — `src/render/bake.ts:65-68` and `src/render/textures.ts:117` share the lake/water/land branch but encode alpha 0/128/255 vs atlas slots; the comment at `bake.ts:65` claims one mapping.
- I3 — **CONFIRMED** — `src/content/biomes/types.ts:5` and `src/render/assets.ts:7-27` declare the slot order twice; sub-claim “nothing ties the two lists” was **WRONG** at review time: `tests/render/assets.test.ts:15` asserts the order; corrected in the follow-up.
- I4 — **CONFIRMED** — `tests/render/seaDepth.test.ts:39-45` and `tests/render/seaWaves.test.ts:42-56` assert GLSL substrings, not behaviour.

`docs/reports/docs-audit.md`:

- A1 — **CONFIRMED** — `docs/modding/biomes.md:171` cites `tests/sim/world/provinces.test.ts`; that file is absent.
- A2 — **CONFIRMED** — `CLAUDE.md:33` lists code/comments but has no `docs/**` rule; sub-claim “`docs/visual-checklist.md` stays Russian” was **WRONG** at review time: 0 Cyrillic characters; corrected in the follow-up.
- A3 — **CONFIRMED** — `docs/superpowers/plans/2026-11-16-stage-1-map.md:208-209` and `docs/superpowers/plans/2026-11-18-stage-1-5-feedback.md:58,66` cite `src/render/distanceField.ts`; absent, code moved to `src/sim/geom/edt.ts:46`.
- A4 — **CONFIRMED** — `docs/superpowers/plans/2026-11-16-stage-1-map.md:383,405` cite `tests/golden.test.ts`; absent.
- A5 — **CONFIRMED** — `docs/screenshots/stage-1-5/README.md:13` uses `-mid.jpg` shorthand, not an openable path.

## Task B — over-engineering audit (`src/` only)

Run with the `ponytail-audit` skill.

Ranked by estimated lines saved. No style, correctness or performance findings.

1. `src/sim/world/worldHash.ts:1-74` — `worldHash`/`paramsKey` have no `src` caller; `fnv1a` is used only by fingerprint tests — move `fnv1a` to a test helper, delete the online-join hash until needed — med — ~64 lines.
2. `src/render/derived.ts:1-63` — `buildDerived` only wraps `bakeWorld`; `updateDerivedRect` has no production caller; only `tests/render/derived.test.ts` — call `bakeWorld` directly; delete the file/test — low — ~63 lines.
3. `src/render/biomeColors.ts:82-130` — `biomeBlurRadius` and `bakeBiomeColorsRect` are used only by `derived.ts:59-61`; the full-map `bakeBiomeColors` stays — delete — low — ~49 lines.
4. `src/render/MapView.ts:284-313`, `src/render/riverLayer.ts:376-380`, `src/ui/notice.ts:27-30`, `src/ui/debugPanel.ts:160-163`, `src/ui/tooltip.ts:57-60` — destroy methods have no caller; `src/main.ts:117` destroys only the PIXI app — delete — low — ~47 lines.
5. `src/render/MapView.ts:206-218,334-338` and `src/render/provinceData.ts:46-47,58-79,107` — `setProvinceData`, the dirty range and `flushProvinceData` have no caller; `applyMode` rewrites all texels — delete — med — ~38 lines.
6. `src/sim/world/heightmap.ts:200-229` — `countLandmasses` is used only by tests — move it to `tests/sim/world/heightmap.test.ts` — low — ~30 lines.
7. `src/render/assets.ts:7-27` — `DetailSlot`/`DETAIL_SLOT_OF` repeat the ordered `DETAIL_SLOT_NAMES` from `src/content/biomes/types.ts:5` — derive the map from that one array — med — ~21 lines.
8. `src/render/MapView.ts:220-238` — `updateRegion` is only needed by the dead `updateDerivedRect`; no caller — delete — low — ~19 lines.
9. `src/render/provinceData.ts:10-22` — `UNEXPLORED`/`HIDDEN`/`TARGET` and `STATE_BITS` are never set by production; keep `FILL` and drop the state preservation at `:93,98` — low — ~13 lines.
10. `src/render/bake.ts:5-12` — `encodeProvinceId`/`decodeProvinceId` are used only by tests; production inlines the same operations at `:46-47` and `src/render/mapShader.ts:150-155` — delete — low — ~8 lines.
11. `src/ui/debugPanel.ts:7-12` — `BenchResult` duplicates `FrameStats` from `src/render/frameBench.ts:1-5` — import the type — low — ~6 lines.
12. `src/content/biomes/types.ts:53-55`, `src/content/packs/base/manifest.ts:8-9`, `src/i18n/ru.ts:69` — `PackManifest.nameKey`/`version` are never read; `overrides` is used at `src/content/registry.ts:77` — delete the fields, values and `pack.base` key — low — ~6 lines.
13. `src/content/biomes/types.ts:47-48` — `BiomeDef.modifiers` is never read — delete — low — ~2 lines.

Dependency findings: none; `package.json` has one runtime dependency, `pixi.js`.

net: ~−366 lines, −0 deps.

## Follow-up (after this review)

- Five `async` insertions removed from `tests/worker/genClient.test.ts`: the final diff is comments, test titles and docs only.
- `docs/reports/arena-translate-review.md`: 89/7 corrected to 51/45; the “0 violations” claim and the I3 sub-claim corrected.
- `docs/reports/docs-audit.md` and `docs/reports/project-status.md`: `docs/visual-checklist.md` moved to the English list; the project-status I3 claim corrected; the suggested CLAUDE.md rule corrected.
- docs-audit A1/A2 fixed: the modding guide now points to `tests/sim/world/provinces.*.test.ts` / `provincesSuite.ts`; `CLAUDE.md` now has an explicit docs-language rule.
- `CLAUDE.md`: next-session order is now reports → ponytail-audit → merge to `main` → Stage 2 with graphify.
- Root MIT `LICENSE` removed in `d61750c`; the source diff is unchanged (comments, test titles and docs).

## Counts and limits

- Task A: 96 files checked; 5 code-token violations; 8 code+trailing-comment lines with unchanged code; 1 `ru.ts` untouched; 3 commands (2 pass, 1 fail on timing); 10 report findings checked (8 fully CONFIRMED, 2 CONFIRMED with one wrong sub-claim, 0 WRONG findings, 0 CANNOT TELL).
- Task B: 13 findings; ~366 lines; 0 dependencies; 10 low / 3 med / 0 high risk.
- Could not check: `npm ci` (not run); full suite not rerun with raised timeouts for all 47 files (only the four timed-out files); line-savings are estimates and the deletions were not applied; docs outside the two cited reports were not re-audited; browser/visual checks are not applicable to a comment-only diff; graphify/code graph was not run.
