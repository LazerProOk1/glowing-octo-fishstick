# Sub-stage 1.1 "Time and start": implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game has a clock (date, pause, 5 speeds), a start province fixed by the seed and a fog of war that hides everything except the start province and its neighbours. Polished enough to show the author (spec §8 sub-stage rule).

**Architecture:** Pure game logic in `src/game` (calendar, clock, start choice, visibility) with tests. The render gets a second per-province texture (fog level, own-province flag) next to the existing province data texture, read by the map shader. A thin driver in `src/main.ts` runs the clock on the Pixi ticker, feeds visibility to `MapView` and the top bar. No world generation change: `GEN_VERSION` and fingerprints stay as they are.

**Tech Stack:** TypeScript strict, PixiJS 8 (WebGL2, GLSL `#version 300 es`), Vite, Vitest, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md` §8.1 (the agreed details — read it first), §5.1, §5.11. Architecture: `docs/architecture.md` «Readiness for stage 2» (rows Time, Where the simulation lives, Fog of war, Province ownership).

## Global Constraints

- TypeScript `strict`, `noUncheckedIndexedAccess`; no `any`. Files ≤ ~450 lines (`MapView.ts` is ~290 now: put new render code in its own files).
- `src/game/**` and `src/sim/**`: no `render`, `ui`, `worker`, `i18n`, `pixi.js`, DOM, `Math.random`, `Date`, `performance`, `crypto`, `setTimeout`, `fetch`, `self`; `src/game` also no inexact `Math` functions (lint-enforced). Integers for game quantities.
- All UI text in `src/i18n/ru.ts`. Restrained UI: dark neutral panels, 1px borders, PT Sans; no ornaments, neon, gradient cards, emoji.
- Map: muted "paper" colours, no pixels at any zoom; read `docs/visual-checklist.md` before accepting any rendered result.
- 60 FPS on the full medium map with the fog on.
- No generation change: `GEN_VERSION` is not bumped, `tests/sim/world/fingerprint.test.ts` must stay green untouched. An optional field on `BiomeDef` does not change `worldHash` (it hashes biome ids only).
- Branch `stage-1-1-time-fog`. Read `docs/commit-rules.md` before committing (Russian title, English body, co-author line of the committing model). Push the branch after each task. Never touch `main`.

## Rulings made while planning

- Ruling: the clock and game state live on the main thread in pure `src/game` functions; moving them into the worker waits for 1.2 — in 1.1 a tick only advances the date, and the worker currently hands the world away — cost if wrong: one small driver moves to the worker in 1.2, the logic is pure and moves as is.
- Ruling: no command queue in 1.1 — pause and speed do not change simulation results; the queue to a tick number (architecture «Time») comes with the first real command (1.3 building) — cost if wrong: small, nothing depends on commands yet.
- Ruling: visibility in the game state is a `Uint8Array` by province id (0 unknown, 1 visible); smooth reveal is render-only (a per-province fade on the CPU, uploaded as the dirty range) — the same mechanism serves the scout in 1.4 — cost if wrong: the shader input changes, game state stays.
- Ruling: the start choice falls back step by step (fewer land neighbours required, then any startable land, then any land that is not glacier/desert) and only fails on a world with no land — degenerate seeds must still start — cost if wrong: an odd start on a freak world.

## Review Focus

1. **Determinism of the start:** the same seed and options give the same start province; it uses `createRng` (`src/sim/rng.ts`) with its own derived seed, never `Math.random`. Test in Task 2.
2. **Calendar edges:** 28 February → 1 March, 31 December → 1 January, 1 BC → 1 AD (no year 0), tick 0 = 1 March 3000 BC. Test in Task 1.
3. **Hidden tab / slow frame:** after a long frame the clock must not run hundreds of days at once or spiral; catch-up is capped. Test in Task 1.
4. **Fog edge has no pixels or stairs** at any zoom, at the coast and across sea/lake provinces; fog works in every map mode. Browser check in Task 3.
5. **Regenerating the world (F3 new seed, address change)** resets the clock, start, fog and camera; no state from the old world survives.

---

### Task 1: Calendar and clock (model: sonnet)

**Files:**
- Create: `src/game/calendar.ts`, `src/game/clock.ts`
- Modify: `src/i18n/ru.ts` (month names in the genitive, "г. до н. э." / "г. н. э.", `formatDate`)
- Test: `tests/game/calendar.test.ts`, `tests/game/clock.test.ts`

- [ ] **Step 1:** `calendar.ts`: `START_YEAR = -3000` (BC as negative, no year 0), start day 1 March. `dateOfTick(tick: number): { day: number; month: number /* 1..12 */; year: number /* … -2, -1, 1, 2 … */ }`. 365-day years, fixed month lengths, no leap years. Integer arithmetic only.
- [ ] **Step 2:** `ru.ts`: `formatDate(d)` → «1 марта 3000 г. до н. э.» / «1 января 1 г. н. э.». Months in the genitive.
- [ ] **Step 3:** `clock.ts`: `SPEEDS = [1, 2, 5, 10, 30]` days per second; `interface Clock { tick: number; speed: number /* index 0..4 */; paused: boolean; carryMs: number }`; `newClock()` → tick 0, paused, speed index 2; pure `advanceClock(c, dtMs): { clock: Clock; ticks: number }` (no ticks while paused; at most `ceil(SPEEDS[speed] * 0.25)` ticks per call, dropping the excess carry); `setSpeed`, `faster`, `slower` (clamped), `togglePause`.
- [ ] **Step 4:** Tests: the Review Focus 2 edges, 365 ticks = one year, `advanceClock` at each speed over 1000 ms of 16.67 ms frames gives the speed's days ±1, paused gives 0, one 10 s frame is capped.
- [ ] **Step 5:** `npm test`, `npm run lint`, `npx tsc --noEmit`. Commit, push.

### Task 2: Start province and visibility (model: sonnet)

**Files:**
- Modify: `src/content/biomes/types.ts` (`startable?: boolean` on `BiomeDef`, doc comment), `src/content/packs/base/biomes.ts` (plains, forest, steppe, hills, taiga, jungle), `src/content/packs/base/fantasyBiomes.ts` (mushroom_forest, magic_forest)
- Create: `src/game/start.ts`, `src/game/visibility.ts`
- Test: `tests/game/start.test.ts`, `tests/game/visibility.test.ts`

- [ ] **Step 1:** `start.ts`: `pickStartProvince(world: World): number` — candidates: land provinces whose biome def has `startable` and with ≥ 3 land neighbours; random pick with `createRng(\`${world.params.seed}:start\`)` over candidates in id order. Fallbacks per the Ruling above; throws `CodedError` (`src/content/errors.ts`, new code + Russian text in `ru.ts`) only when there is no land at all.
- [ ] **Step 2:** `visibility.ts`: `startVisibility(world, start): Uint8Array` — length `provinces.length`, 1 for the start province and all ids in its `neighbors` (land, sea, lake), 0 elsewhere. `isVisible(vis, id)`.
- [ ] **Step 3:** Tests on small medium-size-free worlds (use the existing small test world helpers from `tests/sim/world/`; grep for how other tests build a world): same seed → same start; start biome is startable and has ≥ 3 land neighbours on 5 seeds; a world with no startable biome (disable them via `disabledBiomes`) still starts on land; visibility marks exactly start + neighbours. `fingerprint.test.ts` unchanged and green.
- [ ] **Step 4:** Checks as in Task 1. Commit, push.

### Task 3: Fog and own-province border in the shader (model: opus)

**Files:**
- Create: `src/render/provinceState.ts` (CPU copy of a second RGBA8 texture by province id, same layout as `ProvinceData` via `provinceDataLayout`: R — fog visibility 0..255, G — 255 on own provinces, B/A free; dirty range like `ProvinceData`)
- Modify: `src/render/mapShader.ts` (sample the state texture per side like `sideFill`, fog look, own border), `src/render/MapView.ts` (texture upload, `setVisibility(vis: Uint8Array)`, `setOwnProvinces(ids)`, `setFogEnabled(on)`), `src/render/palette.ts` (fog tint, player colour)
- Test: `tests/render/provinceState.test.ts`

- [ ] **Step 1:** `provinceState.ts` + test (layout, set/dirty, out-of-range errors) — mirror `provinceData.ts`, do not generalise it.
- [ ] **Step 2:** Shader fog: per side read visibility of `best`/`second`; the visible share crosses the province border over a soft band a few cells wide (use `edgePx` / `pxPerCell` and a low-frequency `vnoise` warp, so the edge looks like faded ink, not a polygon). Unknown areas: desaturate strongly and darken (EU-style), relief/hillshade and coastline still readable, paper grain stays. Fog applies after map mode fill, so it covers every mode. `uFogOn` uniform 0/1.
- [ ] **Step 3:** Own border: crisp thin line in the player colour on the own province's equal-share line (the same `edgePx` logic as the province border, a bit stronger), anti-aliased; no glow/halo.
- [ ] **Step 4:** Browser check by `docs/visual-checklist.md` with a temporary dev hook (`window.__mapView`) that sets visibility for a start + neighbours: 3 zooms, 2 seeds, coast/sea/lake edges, all map modes (M). Before/after screenshots into `docs/screenshots/stage-1-1/`. FPS on the full medium map stays 60 (`view.benchmark()` from F3).
- [ ] **Step 5:** Checks as in Task 1. Commit, push.

### Task 4: Camera flight and smooth reveal (model: sonnet)

**Files:**
- Create: `src/render/fogFade.ts` (per-province current level easing toward the target visibility over ~1.5 s; writes changed ids into `ProvinceState`)
- Modify: `src/render/MapView.ts` (call the fade each frame; `flyTo(cell: {x; y}, zoom, ms)` with ease-in-out through `clampCamera`), `src/render/camera.ts` if a pure interpolation helper is needed
- Test: `tests/render/fogFade.test.ts`, camera interpolation test if a helper is added

- [ ] **Step 1:** `fogFade.ts`: pure stepping (`step(dtMs)` returns whether anything changed); levels reach exactly 0 or 255; nothing uploads when idle. Test.
- [ ] **Step 2:** `flyTo`: smooth, no overshoot, user drag/zoom cancels the flight. Start zoom: the start province and its neighbours fill roughly the middle third of the screen.
- [ ] **Step 3:** Browser check: the flight and the reveal look calm, no flashes; screenshots (start and end frame). Checks, commit, push.

### Task 5: Top bar, keys, game loop, tooltip, fog switch (model: sonnet)

**Files:**
- Create: `src/ui/topBar.ts`
- Modify: `src/main.ts` (game state per world: `pickStartProvince`, `startVisibility`, `newClock`; `app.ticker` drives `advanceClock`; on a new world everything resets), `src/ui/hotkeys.ts` (Space, Digit1–5, Equal/Minus, NumpadAdd/NumpadSubtract, fog switch key `F4` with `allowInInput`), `src/ui/debugPanel.ts` (a "no fog" checkbox in sync with the key), `src/ui/tooltip.ts` (fog variant: title «Неизведанная земля» / «Неизведанное море», info — terrain type only), `src/ui/styles.css`, `src/i18n/ru.ts`
- Test: `tests/ui/hotkeys.test.ts` (extend), `tests/ui/tooltip.test.ts` or wherever `provinceInfo` is tested (fog variant), top bar date/speed text if a pure helper is extracted

- [ ] **Step 1:** `topBar.ts`: a small plate centred at the top — date (`formatDate`), under it five speed bars (clickable, the current and lower ones filled) with −/+ buttons; on pause the word «Пауза». Style like the existing `ui-panel` (dark neutral, 1px border, PT Sans). Updates text only when the date or speed changes.
- [ ] **Step 2:** Wiring in `main.ts`: after `view.setWorld` → choose start, set own province, set visibility (fade from 0), `flyTo`, clock paused. Keep `main.ts` readable: if it grows past ~250 lines, move the per-world game wiring into `src/ui/gameSession.ts`.
- [ ] **Step 3:** Keys listed in the F3 panel with Russian names. Fog switch shows the whole world without changing game visibility.
- [ ] **Step 4:** Browser check: Space/1–5/+/− work, clicking the bars works, date runs at each speed, tooltip over fog, F4 and the F3 checkbox agree, new seed from F3 resets everything. Checks, commit, push.

### Task 6: Polish, docs and showing (model: opus for the review, sonnet for docs)

**Files:**
- Create: `docs/screenshots/stage-1-1/README.md` (Russian, "what to look at"), screenshots
- Modify: `docs/architecture.md` («Readiness for stage 2»: Time and Fog rows — what is done; Where the simulation lives — the Ruling), `src/game/README.md` (what lives here now), `CLAUDE.md` «Current state»

- [ ] **Step 1:** "Polished before showing" checklist (spec §8, as adapted in §8.1): no English or placeholder on screen, no console errors, 60 FPS, five seeds (incl. `1`, `worldbox` and a mostly-water seed) by the visual checklist, 10 minutes at the top speed without errors.
- [ ] **Step 2:** Whole-branch review (opus), one fix wave.
- [ ] **Step 3:** Screenshots before/after: map without fog vs with fog at the start, the top bar running and on pause, the fog edge close up at the coast. README in Russian: what to look at, which keys to press.
- [ ] **Step 4:** Docs updates above; move ledger rulings to `docs/superpowers/stage-1-1-decisions.md`. Commit, push. Show the author and wait for notes (memory: visual changes need the author's OK).
