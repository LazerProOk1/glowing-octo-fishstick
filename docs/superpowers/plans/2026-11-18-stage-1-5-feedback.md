# Stage 1.5: rework from the author's feedback — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close everything confirmed in `docs/feedback/stage-1.md` and remove the technical risks that would otherwise get more expensive at stages 2+ (settlement, economy, armies, online).

**Architecture:** The work continues on top of the `stage-1-map` branch (we keep working on it). First cleanup that does not change the result (duplicates, infrastructure). Then world changes: lakes, sea provinces, the jungle border. They change generation, so `GEN_VERSION` is bumped once, to 3. After that come rendering-only fixes (coast, sea, rivers), then the FPS measurement, groundwork for the stage 2 determinism and a batch of small things.

**Tech Stack:** TypeScript strict, PixiJS 8 (WebGL2, GLSL `#version 300 es`), Vite, Vitest, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md` (§5.2, §6, §7, §7.2–7.4). The author's feedback: `docs/feedback/stage-1.md`. Stage 1 decisions: `docs/superpowers/stage-1-decisions.md`.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`; `any` is forbidden.
- `src/sim/**` does not import `src/render/**`, `src/ui/**`, `src/worker/**`, `src/i18n/**`, `pixi.js`, the DOM. No `Math.random`, `Date`, `performance.now`, `crypto`, `setTimeout`, `fetch`, `self`.
- A file is no longer than ~450 lines.
- All interface texts are in `src/i18n/ru.ts`, in Russian.
- The interface style is restrained: dark neutral panels, 1px border, PT Sans, no ornaments, neon, gradient cards or emoji.
- The map is in the spirit of HoI4, muted "paper" colours. **"No pixels at any zoom"** (spec §6).
- Performance: 60 frames/s with 4000 provinces; medium generation under 8 s, in the worker.
- `GEN_VERSION` is bumped **exactly once** in this plan, from 2 to 3, in Task 4. Tasks 5 and 6 change the world within the same version 3 and only update the fingerprints in `tests/sim/world/fingerprint.test.ts`.
- Pure refactorings (Task 2) must leave every fingerprint in `fingerprint.test.ts` unchanged.
- Commits on `stage-1-map`, messages in Russian, at the end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. After every finished task: `git push origin stage-1-map`. Do not touch `main`, do not delete branches.

## Review Focus

1. **Click and hover near the coast:** a point that looks like land on the screen must select a land province, not a sea one. Check: the test in Task 3 (`coastAgreesWithCells`).
2. **A lake at the map edge or a huge inland water body:** water touching the map edge is never a lake; a water body bigger than `LAKE_MAX_CELLS` is sea. Test in Task 4.
3. **A world that is almost all water or almost all land** (the seeds from the stage 1 Review Focus: `""`, `"Бета-7"`, the degenerate ones): the variable sea province density must not give 0 sea provinces for a tiny sea or more than 65535 ids. The test in Task 5 runs 20 seeds.
4. **Switching the seed back and forth** after the Task 4–6 changes: the world is byte-identical (determinism), the medium fingerprint was updated deliberately once. Test in Task 5.
5. **FPS measurement on a hidden tab:** the measurement must not depend on `requestAnimationFrame`, otherwise it lies (that is how it was in stage 1). Test in Task 9.

---

### Task 1: Infrastructure — .gitignore, CLAUDE.md, pushing the branch

**Files:**
- Modify: `.gitignore`
- Create: `CLAUDE.md`
- Commit: `.claude/launch.json` (the dev-server config of the project)

- [ ] **Step 1:** Add these lines to `.gitignore`: `.superpowers/`, `.claude/settings.local.json`, `.claude/worktrees/`, `coverage/`, `.vite/`, `*.local`, `.env`, `.env.*`, `__pycache__/`, `*.pyc`, `.DS_Store`, `Thumbs.db`, `*.tsbuildinfo`. Check: `git status --short` after `npm run build && npm test` shows no new untracked files except `.claude/launch.json`.
- [ ] **Step 2:** Create `CLAUDE.md` (up to ~80 lines, in Russian). Sections:
  - what the project is, with links to the spec and the plans;
  - the commands (`npm run dev`, `npm test`, `npm run lint`, `npx tsc --noEmit`);
  - the hard rules (Global Constraints above, briefly);
  - the `GEN_VERSION` rule from `docs/architecture.md`;
  - where the SDD journal (`.superpowers/sdd/<plan>/progress.md`) and the decisions (`docs/superpowers/stage-*-decisions.md`) live;
  - the git policy: commits in Russian, push the working branch after every task, do not touch `main`;
  - "what to do after context compaction": read the journal and `git log`, do not redo what is done.
- [ ] **Step 3: Commit** `chore: .gitignore, CLAUDE.md для сессий и сжатия контекста`. Then `git push -u origin stage-1-map`. The branch is expected to appear on origin.

### Task 2: Remove the duplicates (pure refactoring, the world does not change)

**Files:**
- Create: `src/sim/geom/blur.ts`, `src/sim/geom/edt.ts`, `src/sim/geom/label.ts`, `src/content/color.ts`
- Modify: `src/render/normals.ts`, `src/render/distanceField.ts`, `src/render/biomeColors.ts` (or wherever `bakeBiomeColorsRect` lives), `src/sim/world/climate.ts`, `src/sim/world/provinceSeeds.ts`, `src/sim/world/shoreline.ts`, `src/sim/world/provinces.ts`, `src/sim/world/provinceCleanup.ts`, `src/sim/world/provinceNoise.ts`, `src/render/mapModes.ts`, `src/content/registry.ts`, `src/sim/world/types.ts`, the tests that import what was moved
- Test: the existing `tests/**`, plus `tests/sim/geom/*.test.ts`

**Interfaces:**
- Produces:
  - `gaussianKernel(sigma: number): Float32Array`
  - `blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array`
  - `blurInterleaved(src: Float32Array, w: number, h: number, c: number, sigma: number): Float32Array` in `src/sim/geom/blur.ts`; render imports from there.
  - `borderDistance(cells: Uint16Array, w: number, h: number): Float32Array` in `src/sim/geom/edt.ts`; `src/render/distanceField.ts` re-exports it or is deleted. Task 3 and Task 5 use exactly this function.
  - `labelComponents` and `labelByKey` in `src/sim/geom/label.ts` (one implementation of the connected-component labelling); `shoreline.ts` uses it too.
  - `hsl(rgb): { h: number; s: number; l: number }` and `saturation(r, g, b): number` in `src/content/color.ts`; one implementation instead of two.

- [ ] **Step 1:** Find all the copies: blur (`normals.blur`/`blurInterleaved`, `climate.blurRows`, the gaussian inside `bakeBiomeColorsRect`), component labelling (`provinceSeeds`, `shoreline`), colour helpers (`mapModes.saturation`, `registry.hsl`, the copy in `tests/content/registry.test.ts`). List them in the report with file:line.
- [ ] **Step 2:** Move them into the modules above. Make the `KIND_*` imports direct: drop the pattern `import { KIND_LAND as KIND_LAND_ } ... const KIND_LAND = KIND_LAND_` if it is not needed for performance. If it is needed, explain it with a comment in one place. Import the terrain levels from one path (`src/content/terrainLevels`); remove the re-export from `types.ts`.
- [ ] **Step 3:** Tests for `src/sim/geom/*`:
  - `blur` preserves the sum to 1e-4 on a random 64×32 field;
  - `borderDistance` on a 2×2 checkerboard gives 0.5 at the cell centres;
  - `labelComponents` on a mask with two islands gives 2 components with the correct sizes.
- [ ] **Step 4:** `npm test`: all tests green, **the fingerprints in `fingerprint.test.ts` have not changed** (`git diff tests/sim/world/fingerprint.test.ts` is empty). `npm run lint` and `npx tsc --noEmit` are clean.
- [ ] **Step 5: Commit** `refactor: общие размытие, EDT, разметка областей и цвета без дублей`, then push.

### Task 3: The coast matches the provinces (staircase in the highlight and the fill)

Cause of the bug. The coast is drawn from the blurred height (`bakeWorld.ts:30`, `mapShader.ts:231-235`), while the provinces are drawn from cells. Between the smooth coast and the cell border of a land province there remains a strip of "land" that in fact belongs to a sea province. In it the highlight and the map mode fill break off with a staircase, and a click on visible land selects a sea province.

The solution. Build the coastline from the signed distance to the "land/water" border in cells: `borderDistance` over the land mask (Task 2), the sign is plus on land. The same way the smooth province borders are built today. The blurred height remains only for the shallow-water tint.

**Files:**
- Modify: `src/render/bakeWorld.ts`, `src/render/textures.ts`, `src/render/mapShader.ts`, `src/render/MapView.ts`
- Test: `tests/render/coast.test.ts`

**Interfaces:**
- Consumes: `borderDistance` from `src/sim/geom/edt.ts`.
- Produces: `coastSignedDistance(provinces: Province[], provinceOf: Uint16Array, w: number, h: number): Float32Array` in `src/render/bakeWorld.ts`. The value is greater than 0 on land, less than 0 on water, in cells. Baked into a new R16F channel/texture `uCoastSd`.

- [ ] **Step 1: Test `coastAgreesWithCells`.** On a `small` world of the seed `"1"`: for every cell `sign(coastSignedDistance) === (provinces[provinceOf[i]].isLand ? +1 : −1)`. Another test: on a straight coast (a "left half is land" mask 32×8) the value at the centre of the cell next to the coast equals ±0.5.
- [ ] **Step 2:** Run it and make sure it FAILs (the function does not exist).
- [ ] **Step 3:** Implement the function. In the shader compute `landMask` and the coastline from `uCoastSd` the same way as `zeroDistPx` for the borders. Leave `surf.b` (the blurred height) only for the shallow-water band. The highlight (`mapShader.ts:303-304`) and the mode fill now match the coast without a separate mask.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npx tsc --noEmit` clean.
- [ ] **Step 5: Check in the browser (controller).** Seeds `#1`, `#worldbox`, `#Бета-7?fantasy=1`, maximum zoom at the coast:
  - the highlight of a land province by the sea reaches the coastline without steps;
  - in the "Провинции" mode (M) the fill also reaches the coast without steps;
  - the coast at maximum zoom has not become more jagged than in the screenshot `docs/screenshots/stage-1/seed-1-max.jpg`.

  If the coast has become noticeably more angular, the controller decides: go back to `landMask` from the blurred height and, for the highlight and the fill, extend the land province up to the smooth coast (the nearest land province for the cells of the strip). The decision is written into the journal.
- [ ] **Step 6: Commit** `fix(render): берег по клеткам провинций — подсветка и заливка без лесенки`, then push.

### Task 4: Lakes — a separate water type (GEN_VERSION → 3)

Today any closed water body of 30 cells becomes a sea province with the biome "Океан" (Ocean). For the economy (fish, fresh water) and armies (a fleet must not "swim" in a lake) this is wrong.

**Files:**
- Modify: `src/sim/world/types.ts`, `src/sim/world/provinces.ts` (or a new `src/sim/world/lakes.ts`), `src/sim/world/params.ts`, `src/content/packs/base/biomes.ts`, `src/i18n/ru.ts`, `src/ui/tooltip.ts`, `src/render/mapShader.ts` (lake colour), `src/render/palette.ts`, `docs/modding/biomes.md`, `docs/architecture.md`
- Test: `tests/sim/world/lakes.test.ts`, `tests/sim/world/fingerprint.test.ts`

**Interfaces:**
- Produces:
  - `Province.water: 'sea' | 'lake' | null`, where `null` means land; `isLand` stays;
  - `LAKE_MAX_CELLS = 6000`;
  - `findLakes(height: Float32Array, w: number, h: number): Uint8Array`, where 1 means a lake cell;
  - the `lake` biome in the base pack (`kind: 'water'`), the name "Озеро" in `ru.ts`;
  - the tooltip label "Озеро · вода".

- [ ] **Step 1: Tests.**
  - `lake is inland water`: a synthetic 64×32 map, water along the edges and a closed pond 10×10 inside the land. The cells of the pond give 1, the rest of the water gives 0.
  - `water touching the map edge is never a lake`: a bay touching the edge gives 0.
  - `huge inland water is sea`: a closed water body bigger than `LAKE_MAX_CELLS` gives 0.
  - `lake provinces`: on `generateWorld` of the seed `"1"` medium, every province with `water === 'lake'` has all cells lacustrine and the biome `lake`. No province mixes a lake and the sea.
- [ ] **Step 2:** Run it and make sure it FAILs.
- [ ] **Step 3:** Implement it. A lake is a 4-connected water component that does not touch the map edge and is at most `LAKE_MAX_CELLS` in size. Provinces do not grow across the "lake/sea" border. A lake smaller than the minimum sea province is one province. Bump `GEN_VERSION` to 3. Update the fingerprints with a note in the report. In `docs/architecture.md` add a line: "v3: lakes, sea province density, the jungle border".
- [ ] **Step 4:** Shader: a lake has slightly lighter and greener water, without the sea "wave" and without a shallow-water band wider than 2 cells.
- [ ] **Step 5:** `npm test`, lint, tsc clean.
- [ ] **Step 6: Commit** `feat(sim): озёра — отдельный тип воды, GEN_VERSION 3`, then push.

### Task 5: Sea provinces are larger away from the coast

**Files:**
- Modify: `src/sim/world/provinceSeeds.ts` (`poissonSeeds`), `src/sim/world/provinces.ts:19-21`
- Test: `tests/sim/world/provinces.test.ts`, `tests/sim/world/fingerprint.test.ts`

**Interfaces:**
- Consumes: `borderDistance` from `src/sim/geom/edt.ts` (the distance to land).
- Produces: constants in `provinces.ts`: `SEA_RADIUS_COAST = LAND_RADIUS * 2.2`, `SEA_RADIUS_OPEN = LAND_RADIUS * 6`, `SEA_RADIUS_FAR = 80` (the distance to land in cells at which the radius reaches `OPEN`). `poissonSeeds` takes `seaRadiusAt: (cell: number) => number` instead of a number.

- [ ] **Step 1: Tests.**
  - `fewer sea provinces`: medium, the seed `"1"` gives 150 to 300 sea provinces (currently around 440).
  - `coastal sea stays fine`: the average area of the sea provinces that touch land is at most 0.6 of the average area of the sea provinces with no land nearby.
  - `20 seeds`: the run from the stage 1 Review Focus, including `""` and `"Бета-7"`. Every seed with a sea has at least one sea province, all ids < 65535.
  - `determinism`: two runs of one seed are byte-identical.
- [ ] **Step 2:** Run it and make sure it FAILs on `fewer sea provinces`.
- [ ] **Step 3:** Implement it. Poisson sampling with a variable radius: a candidate is accepted if the distance to every accepted sea seed is at least `max(r(candidate), r(seed))`. Take the grid from `SEA_RADIUS_OPEN`. Land provinces do not change. Update the fingerprints (the same version 3).
- [ ] **Step 4:** `npm test`, lint, tsc clean; medium generation in node is no slower than +10% of the current one (the number in the report).
- [ ] **Step 5: Commit** `feat(sim): морские провинции крупнее в открытом море`, then push.

### Task 6: The jungle border does not run exactly along the latitude

On the seed `#1` the jungle border is a straight horizontal line hundreds of cells long.

**Files:**
- Modify: `src/sim/world/biomes.ts` (classification), `src/sim/world/climate.ts` if needed
- Test: `tests/sim/world/biomes.test.ts`, `tests/sim/world/fingerprint.test.ts`

**Interfaces:**
- Produces: `classifyTemperatureJitter`: only for the biome choice the temperature is shifted by fbm noise with an amplitude of ±1.5 and a scale of 40–120 cells, from a separate stream `rng.fork('biomeJitter')`. The `temperature` fields in `World` themselves do not change.

- [ ] **Step 1: Test `no straight biome edges`.** Medium seeds `"1"` and `"worldbox"`. For every row y count the longest run of consecutive x where the "jungle/not jungle" border lies between rows y and y+1. The maximum over the map is no more than 25 cells.
- [ ] **Step 2:** Run it and make sure it FAILs.
- [ ] **Step 3:** Implement the shift. Check that the biome shares on the seed `"1"` changed by no more than 3 pp each (the numbers in the report). Update the fingerprints.
- [ ] **Step 4:** `npm test`, lint, tsc clean.
- [ ] **Step 5: Commit** `fix(sim): извилистая граница джунглей`, then push.

### Task 6b: Smooth fill and highlight near the coast and between provinces

Added 2026-11-19 from the author's screenshot. Hovering over a sea province near the coast. Two problems found:
1. The sea highlight breaks off with a staircase, never reaching the coast. Cause: after Task 3 the cells of the coastal strip belong to land in `displayProvinceOf`, and the sea province loses them.
2. The border of the fill and the highlight between two sea provinces (and between provinces in general) is a staircase of cells at maximum zoom. The same will happen with country colours, and spec §6 demands "no pixels at any zoom".

**Files:**
- Modify: `src/render/bakeWorld.ts`, `src/render/bake.ts`, `src/render/textures.ts`, `src/render/mapShader.ts`, `src/render/MapView.ts`
- Test: `tests/render/coast.test.ts`, `tests/render/bake.test.ts`

**Interfaces:**
- Produces:
  - `displaySeaProvinceOf(world: World, coast: Float32Array): Uint16Array` — the mirror of `displayProvinceOf`. A land cell that may look like water (it or its 8 neighbours have `coast < 0`) gets the nearest sea or lake province. Water cells keep their province.
  - A second id texture (`provinceSeaRG`, the same format as `provinceRG`) or two ids in one texture, at the implementer's choice, with a rationale.
  - In the shader: where the screen shows land (`landMask > 0.5`) the id comes from the land map, where water — from the sea map. The highlight, the mode fill and the borders are computed from the "own" map for each side of the coast.
  - A smooth border of the fill and the highlight. Instead of a jagged cell border — soft membership: the share of the province's cells in the neighbourhood of the pixel (weighted, a kernel of about 2–3 cells), a threshold of 0.5, smoothing in screen pixels. The same trick that gives the smooth coast from the blurred height. Thin border lines stay as they are if they are already smooth.
  - The CPU province picking (`MapView.hoverAt`) uses the same logic as the shader: land or water at the point by the blurred height, then the corresponding map.

- [ ] **Step 1: Tests.**
  - `visible water picks a water province`: small, the seed `"1"`. Every cell with `coast < 0` in `displaySeaProvinceOf` points to a province with `water !== null`. All water cells keep their `provinceOf`.
  - The existing `visible land picks a land province` stays green.
  - A CPU picking test: a point on water near the coast gives a sea province, a point on land near the coast gives a land one.
- [ ] **Step 2:** Run it and make sure it FAILs.
- [ ] **Step 3:** Implement it. The world fingerprints do not change. The texture hashes — only new or changed ones, with an explanation in the report.
- [ ] **Step 4:** `npm test`, lint, tsc clean. Baking time on medium is at most +150 ms. A frame measurement (if Task 9 is not done yet — an estimate in the report: how many texture samples per pixel were added).
- [ ] **Step 5: Check in the browser (controller).** Maximum zoom, seeds `#1` and `#worldbox`:
  - hovering over a sea province near the coast — the highlight reaches the coast without steps;
  - hovering over land near the coast — as after Task 3;
  - the highlight border between two sea provinces and between two land provinces is smooth, without cells;
  - the "Провинции" mode (M) — a fill with smooth edges.
- [ ] **Step 6: Commit** `fix(render): гладкая заливка и подсветка у берега и между провинциями`, then push.

### Task 7: The sea — depth instead of a flat fill

**Files:**
- Modify: `src/render/mapShader.ts` (the water block, around `:281-289`), `src/render/palette.ts`

**Interfaces:**
- Produces: `seaShallow`, `seaDeep`, `seaContour` appear in `MAP_COLORS`.

- [ ] **Step 1:** The water colour depends on the depth `−(height − SEA_LEVEL)`: a smooth transition `seaShallow → seaDeep` along a curve where half of the transition falls on the first 25% of the depth. Add two very pale isobaths at the depths 0.06 and 0.18 below sea level: 1px thick, opacity 0.10, fading out at the far zoom. Add a paper grain, as on land but weaker. Lakes (Task 4) have no isobaths.
- [ ] **Step 2:** `npm test`, lint, tsc clean.
- [ ] **Step 3: Check in the browser (controller).** Screenshots of the overview and the medium zoom of three seeds. The sea reads as depth, not neon, without an "AI gloss". The colours are muted, in the same range as `seed-1-overview.jpg`.
- [ ] **Step 4: Commit** `feat(render): глубина моря и изобаты`, then push.

### Task 8: Rivers — narrowing, banks, mouths

**Files:**
- Modify: `src/render/riverLayer.ts`, `src/render/palette.ts`
- Test: `tests/render/riverLayer.test.ts`, `tests/sim/world/rivers.test.ts`

**Interfaces:**
- Produces: `riverWidthCells(width: number, t: number): number` — the thickness in world cells. `t` — the share of the path from the source, from 0 to 1. The thickness grows from 0.35·w at the source to w at the mouth, where w = 0.3 + 0.22·width. The screen thickness is clamped below at 0.6 px, not clamped above: at maximum zoom a river is noticeably wider. The colour `MAP_COLORS.riverBank` — a dark underlay 40% wider.

- [ ] **Step 1: Tests.**
  - `rivers end in water or join another river` (sim): for every river of medium seed `"1"` the last point is a water cell or a cell of another river. This already holds in the code (`rivers.ts:142-176`), the test pins it.
  - `riverWidthCells grows downstream`: monotone in `t`, at `t=0` and `t=1` the values from Interfaces.
  - `mouth reaches coastline`: the last drawn point of a river flowing into the sea lies no further than 0.5 cells from land, compared with the coastline (by `coastSignedDistance` from Task 3; the value is less than −0.3).
- [ ] **Step 2:** Run it and make sure it FAILs.
- [ ] **Step 3:** Implement it:
  - split every river into segments where the width differs by no more than 15%;
  - draw two outlines: the `riverBank` underlay first, the water on top;
  - at the mouth extend the last segment by 1.5 cells towards the water;
  - keep the rebuild by zoom buckets.
- [ ] **Step 4:** `npm test`, lint, tsc clean.
- [ ] **Step 5: Check in the browser (controller).** On three seeds the rivers narrow towards the source, a thin dark edge is visible, no river visually breaks off on land by the sea.
- [ ] **Step 6: Commit** `feat(render): реки с сужением, кромкой и устьями`, then push.

### Task 9: An honest FPS measurement

**Files:**
- Create: `src/render/frameBench.ts`
- Modify: `src/render/MapView.ts`, `src/ui/debugPanel.ts` (or whatever the F3 panel is called), `src/i18n/ru.ts`
- Test: `tests/render/frameBench.test.ts`

**Interfaces:**
- Produces:
  - `frameStats(samplesMs: number[]): { avg: number; p95: number; fps: number }`;
  - `MapView.benchmark(frames = 120): { avg: number; p95: number; fps: number }`: synchronously renders `frames` frames through `app.renderer.render(app.stage)` and calls `gl.finish()` after each, timing every frame. It does not depend on `requestAnimationFrame`.
  - a "Замерить кадр" button in the F3 panel and a result line "Кадр: N мс (p95 M мс) ≈ K к/с".

- [ ] **Step 1: Test `frameStats`.** `[10,10,10,20]` gives avg 12.5, p95 20, fps 80.
- [ ] **Step 2:** Run it and make sure it FAILs.
- [ ] **Step 3:** Implement the functions and the button.
- [ ] **Step 4:** `npm test`, lint, tsc clean.
- [ ] **Step 5: Check in the browser (controller).** Press the button on `#1` in the overview and at maximum zoom, record the numbers in the report. For the author: open http://localhost:5173/#1 in your Chrome, press F3, then "Замерить кадр", and send the number.
- [ ] **Step 6: Commit** `feat(ui): замер кадра в панели отладки`, then push.

### Task 10: Groundwork for stage 2 — determinism and where the simulation lives

This is the answer to the main question of the feedback: what would substantially complicate settlement, economy, armies and online. The code here is small, the main thing is to fix the rules while there is no game logic yet.

**Files:**
- Create: `src/sim/world/worldHash.ts`, `src/game/README.md`
- Modify: `eslint.config.js`, `docs/architecture.md`, `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md` (§7, the item about determinism)
- Test: `tests/sim/world/worldHash.test.ts`, `tests/lint-rules.test.ts`

**Interfaces:**
- Produces:
  - `worldHash(world: World): string`: a short hash (as in `fingerprint.test.ts`) over `params`, `GEN_VERSION`, `height`, `biome`, `riverMask`, `provinceOf`. Needed to check on entering an online game that everyone has the same world.
  - An ESLint rule for `src/game/**`: everything from `src/sim/**`, plus a ban on `Math.pow`, `Math.exp`, `Math.log`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2`, `Math.hypot`, `Math.cbrt` and the `**` operator with a fractional exponent. The message: "в игровой логике только целые/фиксированная точка — см. docs/architecture.md".

- [ ] **Step 1: Tests.**
  - `worldHash` is stable for the seed `"1"` small (pin the value);
  - `worldHash` changes when the seed changes;
  - lint: `Math.sin(1)` in `src/game/x.ts` gives an error, in `src/render/x.ts` it does not.
- [ ] **Step 2:** Run it and make sure it FAILs.
- [ ] **Step 3:** Implement it. In `docs/architecture.md` add the section "Readiness for stage 2" with a risk table (risk → what is decided → when to do it):
  - **Determinism between browsers.** World generation uses floating-point maths, and on different engines `Math.sin` and the like may produce different bits. The solution: on entering online compare `worldHash`; if it does not match, the host sends the world (a snapshot of about 4–8 MB compressed). The game logic (`src/game`) works in integers or fixed point from day one, enforced by the linter. When to do it: the rule now, the synchronisation at the online stage.
  - **Where the simulation lives.** Today the worker generates the world and **hands it over** to the main thread, keeping nothing itself. The decision for stage 2: the generation worker becomes the simulation worker, stores the `World` and the game state and sends snapshots and changes to the renderer. The main thread keeps only a copy of `provinceOf` for hovering. When to do it: at the start of stage 2.
  - **Time.** A fixed tick of one "day". The speed changes the number of ticks per second, not the length of a tick. Player commands are scheduled on a tick number.
  - **Saves.** A save stores `GEN_VERSION`. If the version does not match, the saved world snapshot is taken instead of regenerating.
  - **Armies and paths.** The `adjacency` graph with `length`, `river` and `strait` already exists. We need distances between province centres and the water type (Task 4), so that a fleet does not end up in lakes.
  - **Economy.** The province data (biome, coastalness, rivers) exists. Resources and population are new fields of the game state, not of the world.

  In spec §7 "Determinism" add one sentence about integers in the game logic and the `worldHash` check.
- [ ] **Step 4:** `npm test`, lint, tsc clean.
- [ ] **Step 5: Commit** `feat: worldHash, правило целочисленной игровой логики, риски этапа 2`, then push.

### Task 11: Cheap small things from the deferred list

**Files:** given in each item.

- [ ] **Step 1:** Do every item with a test where it applies:
  1. `src/render/provinceData.ts`: `set` throws a `RangeError` if a channel is not an integer from 0 to 255. Test.
  2. `src/render/MapView.ts`: `updateRegion` clamps the rectangle to the map bounds. `setProvinceData` sets the FILL bit itself if RGB is non-zero. Update the JSDoc.
  3. `src/worker/genWorker.ts`: if `generateWorld` threw an exception after the surface baking started, the baking task is cancelled and the nested worker terminates.
  4. URL parameters: `off=` values are decoded with `decodeURIComponent`; `packs=` with an empty list survives the `build → parse` cycle. Tests in the existing URL test.
  5. `src/sim/rng.ts`: `int(min, maxExcl)` throws an error if the arguments are not integers or `maxExcl <= min`. Test.
  6. `package.json`: move `pixi.js` from `devDependencies` to `dependencies`.
  7. Tests: remove `console.log` from the tests (EDT and others), the `npm test` output without extra lines.
  8. `tests/lint-rules.test.ts`: tests for the ban on DOM globals and `pixi.js/*` subpaths in `src/sim`.
  9. The province cleanup error message (`provinceCleanup.ts:154`) in Russian through a `ru.ts` key in the ui layer. In sim the error code stays.
- [ ] **Step 2:** `npm test`, lint, tsc clean.
- [ ] **Step 3: Commit** `chore: мелкие доработки по итогам этапа 1`, then push.

### Task 12: The final check in the browser and the report

- [ ] **Step 1:** Controller: seeds `#1`, `#worldbox`, `#Бета-7?fantasy=1`, `#1?size=small`, `#1?size=large`. Overview, medium zoom, maximum zoom at the coast, the "Провинции" mode, F3 with the frame measurement. No errors in the console.
- [ ] **Step 2:** Screenshots in `docs/screenshots/stage-1-5/`, next to them `docs/screenshots/stage-1-5/README.md` with "before/after" captions for the coast, lakes, sea and rivers.
- [ ] **Step 3:** Append the decisions of this plan to `docs/superpowers/stage-1-decisions.md`.
- [ ] **Step 4: Commit** `docs: скриншоты и решения этапа 1.5`, then push.
