# Architecture

A short description of how the stage 1 code (world map) is laid out. The detailed game design is in the
[spec](superpowers/specs/2026-11-16-settlement-strategy-design.md), §7.

## Modules

| Directory | What is inside | May depend on |
| --- | --- | --- |
| `src/sim` | Deterministic core: RNG, noise, world generation (`sim/world`). The same `WorldParams` give the same world bit for bit. | `content` |
| `src/game` | Game logic, integers only: calendar, game clock, start group of 3 provinces, visibility (sub-stage 1.1; see its `README.md`). | `sim`, `content` |
| `src/content` | Game data: biomes, packs (`content/packs`), pack registry, terrain levels. Names are translation keys, not text. | — |
| `src/render` | Everything that draws the map: texture baking, shader, fog and own-province border, camera and its flight, rivers, map modes, province data and province state textures, `MapView` (PixiJS). | `sim`, `content` |
| `src/ui` | DOM interface: loading screen, top strip (date, speed), tooltip, debug panel, errors, hotkey registry, game session glue, styles. | `i18n`, `sim` (types), `game`, `worker` (stage types) |
| `src/worker` | Generation worker, nested terrain-texture worker, client and message protocol. | `sim`, `content`, `render` (baking) |
| `src/i18n` | Interface strings and translations of content names (`ru.ts`). | — |

`src/main.ts` assembles everything, `src/worldUrl.ts` converts the page address to `WorldParams` and back.

The restrictions are enforced by ESLint and tests:

- `src/sim/**` does not import `render`, `ui`, `pixi.js`, and does not touch the DOM, `Math.random`, `Date`, `performance`.
- `src/game/**` obeys the same rules as `src/sim/**` and additionally does not call `Math` functions that the
  engine treats as approximate (`Math.sin`, `Math.pow`, `Math.log` and the like, `**` with a non-integer
  exponent). Ordinary arithmetic and `Math.sqrt` are allowed: they are exact.
- `src/ui/*.ts` has no Cyrillic in string literals: all strings are keys from `src/i18n/ru.ts`.

## Data flow

1. **Params.** `parseWorldUrl(location.hash)` yields `WorldParams`: generator version, seed, packs, options
   (fantasy, disabled biomes, size). Without a seed a random one is picked and written to the address.
2. **Request.** `requestWorld(params)` (`worker/genClient.ts`) sends a request to the worker. A new request
   stops the worker busy with the old one, and the old promise rejects with `SupersededError`.
3. **Generation.** `genWorker.ts` calls `generateWorld`: terrain, climate, biomes, shoreline, rivers,
   provinces and the adjacency graph. After the shoreline, height and biomes go to the nested worker
   (`surfaceWorker.ts`), which bakes the terrain textures in parallel with rivers and provinces.
4. **Baking.** The generation worker bakes the province owner maps for land and for water
   (`render/bake.ts`, `render/bakeWorld.ts`; the shader builds the borders from them itself), waits for the
   terrain textures and sends the world and all texture arrays to the main thread by transfer, without
   copying. Stages arrive at the client as the work goes on and are shown on the loading screen.
5. **Display.** `MapView.setWorld(world, bake)` creates the GPU textures (`render/textures.ts`) and the
   province data texture (`render/provinceData.ts`) with the colours of the current map mode.
6. **Frame.** One full-screen quad with the `render/mapShader.ts` shader: biomes, details from the atlas,
   terrain shading, water, shoreline, map mode fill, province borders, highlight under the cursor.
   Rivers are a separate layer on top (`render/riverLayer.ts`). The camera only changes uniforms; per
   frame only the changed texels of the province data are uploaded. The exception is the river layer:
   `RiverLayer.update` rebuilds the river `Graphics` when the zoom crosses a width-step boundary,
   so allocations happen on such a crossing.

Game time and fog do not go through the worker: `ui/gameSession.ts` holds the clock and the visibility array
on the main thread, `MapView` receives the fog levels (eased by `render/fogFade.ts`) and the own-province flag.

Derived data (everything built from the world for drawing only) is collected in `render/derived.ts`:
`buildDerived` builds it whole, `updateDerivedRect` recomputes a rectangle after cell edits and returns the
written area; `MapView.updateRegion(rect)` uploads to the GPU the rows that it touches.

### Worker protocol

All messages in both directions, including the nested worker, carry `v: PROTOCOL_VERSION`
(`worker/protocol.ts`). A message of another version is not parsed: the client rejects the request with an
error and stops the worker, the worker replies with an error message. When the message shape changes,
`PROTOCOL_VERSION` is bumped by 1.

## GEN_VERSION rule

`GEN_VERSION` (`sim/world/params.ts`) is bumped by 1 on any generation change that alters the result for the
same `WorldParams`: world arrays, provinces, adjacency edges, the contents of `World`.
In the same commit the fingerprint in `tests/sim/world/fingerprint.test.ts` is updated — that is the only
place with expected hashes. Optimisations with a bit-identical result do not change the version. Render
changes (shader, palette, baking) do not change the version either: they do not touch the world itself.

Version history:

- v1: stages 1–12.
- v2: `WorldParams`, world size, province adjacency graph.
- v3: lakes, sea-province density, jungle edge.

Determinism is bit-exact within one JS engine (one browser and version). `Math.pow`, `Math.exp`,
`Math.sin` and the like are not required to give a bit-identical result in different engines, so the
fingerprint hashes are verified only on the test engine. We do not move world generation to integers;
instead, players in an online game compare `worldHash` (see "Readiness for stage 2"). A difference in the
last bit of one cell's height is enough for the hash to differ, and then the whole world has to be sent by
the host.

## Readiness for stage 2

"Stage 2" is the old name for milestone 1, sub-stages 1.1–1.3 (spec §8 maps old stage numbers to sub-stages).

There is no game logic yet, so the cheap rules are pinned down now, while they do not have to be redone.
Short words used below:

- **Tick** — one step of game time (here a "day"). The whole game is a sequence of ticks.
- **Fixed point** — fractional values stored as integers in small units
  (for example, food in hundredths: 1.25 is stored as 125).
- **Snapshot** — a copy of the data at one moment (the world or the game state) that can be saved or sent.
- **Desync** — players in an online game have diverged, and each sees their own game.
- **Linter** (ESLint) — a program that reads code and complains about forbidden constructs before it runs.

Why ordinary arithmetic is safe. The floating-point standard (IEEE 754) requires `+ − × ÷` and `Math.sqrt` to
be rounded exactly, so any browser gives the same bits. Functions like `Math.sin`, `Math.pow`, `Math.log`
are not pinned by the standard: browsers compute them approximately and differently. The linter in
`src/game` forbids exactly those functions (`pow`, `exp`, `expm1`, `log`, `log2`, `log10`,
`log1p`, `cbrt`, `hypot`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh`,
`asinh`, `acosh`, `atanh`) and `**` with a non-integer or variable exponent. Computing the economy in integers
or fixed point is an **agreement**, the linter does not check it: fractional division is deterministic too,
but integers are simpler to save and compare, and they do not accumulate rounding errors.

| Risk | What is decided | When to do it |
| --- | --- | --- |
| **Determinism across browsers.** In short: the same world built in different browsers may differ slightly. Generation computes `Math.pow`, `Math.exp`, `Math.sin`, and they give different last bits on different engines. | `worldHash(world)` (`src/sim/world/worldHash.ts`) is the only world hash: params, biome list, `GEN_VERSION`, size, `height`, `temperature`, `moisture`, `arcana`, `biome`, `riverMask`, `provinceOf`. The province list, adjacency edges, `water`, `coastal` and `lakeside` are derived from these arrays with exact arithmetic, so they are covered too. When joining an online game, players compare the **build and content version** and `worldHash` with the host: version mismatch — cannot join, hash mismatch — the host sends the world (a medium snapshot is about 4–8 MB compressed, large is roughly 2.25 times bigger). Game logic (`src/game`) does not call approximate `Math` functions (the linter). | The linter rule and `worldHash` are done now; version comparison and world transfer — at the online stage. |
| **Desync during a game.** In short: even with the same world, games can diverge because of a bug. | Every N ticks the simulation computes a hash of the game state, and clients compare it with the host. On mismatch the game stops with a clear error (later it catches up from a host snapshot). | Together with online play; the state hash is worth adding already at stage 2 for the tests. |
| **Rules and content version.** In short: the same command in another game version gives another result. | Saves and replays store the build and content version (packs and their versions) next to `GEN_VERSION`; online play checks it on join. A replay of another version honestly reports that it cannot be played. | When saves and replays appear. |
| **Where the simulation lives.** In short: today the world goes to the main thread after generation, while the game needs it in the worker. Right now the worker generates the world and **hands it** to the main thread by transfer, keeping nothing itself. Ruling (sub-stage 1.1): the clock and visibility stay on the main thread until 1.2 (nothing heavy ticks yet; moving them now would only add a message protocol). | The generation worker becomes the simulation worker: it holds `World` and the game state, and sends snapshots and changes to the renderer. The main thread keeps the display maps `displayProvinceOf` / `displaySeaProvinceOf` (`render/bakeWorld.ts`, differing from the simulation `provinceOf` on 1–2 cells at the shore) for hovering and an immutable copy of `provinces` for the tooltip, map modes and the debug panel. Later it will receive state snapshots per province (owner, fog). | In sub-stage 1.2 (when the first real per-tick logic appears). |
| **Time.** In short: the game runs in day steps of equal length at any speed. | Done in 1.1: a fixed "day" tick (`game/clock.ts`, `game/calendar.ts`). Game speed (`SPEEDS`) changes the number of ticks per second, not the length of a tick; after a stall at most `ceil(speed * 0.25)` ticks are run and the rest of the time is dropped. The clock runs on the main thread (see the row above). Player commands queued to a tick number: not yet. | Commands: with the first player actions. |
| **Saves.** In short: a save must open even if the generator has changed since. | A save is a binary snapshot of the world arrays (`height`, `provinceOf` and so on) plus JSON with the game state; or the seed + `GEN_VERSION` + content version + command list. If `GEN_VERSION` does not match the current one, the saved world snapshot is used instead of regenerating. | When saves appear. |
| **Province ownership.** In short: who owns each province. | Done in 1.1 for one flag: the 3-province start group is "own" (`game/start.ts`); the flag reaches the screen through the province state texture (`render/provinceState.ts`, channel G), which draws the red own border. "Owner" and "controller" arrays by province id for several players are not there yet. | Several owners: 1.2 and later. |
| **Fog of war.** In short: each player sees only part of the map. | Visibility is per province, separately for each player. Online, where all clients compute the same thing (lockstep), everyone has the full state, so the fog is only visual: a modified client can see everything. Done in 1.1 for one player: `game/visibility.ts` (the start group of 3 provinces and their neighbours are seen), shown by the shader from the province state texture (channel R, see below), not from flag bits of the data texture. The fog is computed per coast side (land and sea separately) so the coastline stays crisp, and fades in over 1.5 s (`FogFade`). Fog that changes during play (scouts): 1.4; the fog pass costs about 7 ms at 4 MP, half resolution is the planned optimisation. | Dynamic fog: 1.4. |
| **Armies and paths.** In short: armies need distances between provinces without approximate math in the game logic. | The `adjacency` graph with `length`, `riverLength`, `river` and `strait` already exists; a province has `center`, `water` (`'sea'`, `'lake'` or none), `coastal` (sea only) and `lakeside`. The integer cost of crossing each edge is computed in advance in `src/sim` (`Math.sqrt` for the distance between centres is allowed there: it is exact), so `src/game` finds paths in integers. Fleets sail only the sea: straits (`strait`) may also pass through lake water, so sea code checks `water === 'sea'`, not just "water". Game code on each tick takes only ready-made `src/sim` results (for example integer edge costs) and does not call noise, geometry and other generation helpers: they are slow and compute in fractional numbers. | Edge costs — together with army movement in stage 2. |
| **Economy.** In short: resources and population are part of the game, not of the world. | Province data (biome, coastal, lake nearby, rivers on edges, `cellCount`) already exists. Resources and population are new game state fields, not `World`: the world does not change because of what happens in a game. Game logic relies on the `biome` of a cell and of a province, not on its own temperature and moisture thresholds: the biome is chosen by climate shifted with noise, so a threshold on raw climate would diverge from what is visible on the map. | Stage 2. |
| **Size and ids.** In short: province numbers are plentiful. | Province ids are below 65535 (`Uint16Array`). On medium there are about 3200 land and 300–340 sea provinces plus a few lakes (seed "1": 3280 / 342 / 17; "worldbox": 3180 / 308 / 5). Game state tables are better made arrays by id from the start. | Stage 2. |
| **Generation time.** In short: the world must build in no more than 8 s. Stage 1.5 measurement (medium): in a browser on an idle machine 4.7–4.9 s; in node (esbuild build) 3.4–3.5 s versus 3.1–3.5 s before the stage, so there is no growth. The earlier 11.9 s in the browser was a loaded machine, and 5.3 s in node was Vitest overhead for code transformation. | The simulation worker will own the world, so generation stays in it and must fit in 8 s; otherwise the start of a game and loading an online world become slower. Measure on an idle machine and outside Vitest. | Watch it on every generation change. |
| **Map editor and terraforming.** In short: editing cells during a game does not update all textures. | `updateDerivedRect` and `MapView.updateRegion` recompute and upload per rectangle only the terrain, the height, the biome colours and the water kind (channel A of `provinceSeaRG`). The surface (gradient, shoreline, shore proximity), the display owner maps (`displayProvinceOf` / `displaySeaProvinceOf`) and the sea depth `seaDepth` are not updated per rectangle. Editing the height, the shoreline or the provinces requires a full `buildDerived` rebuild and `setWorld`. | When an editor or terraforming appears. |

## How to add a map mode

A mode is an entry in `MAP_MODES` (`src/render/mapModes.ts`):

```ts
{
  id: 'coastal',
  nameKey: 'mapMode.coastal',
  color: (p) => (p.coastal ? [120, 150, 170, 0] : null),
}
```

- `color(p, world)` returns the fill colour of a province (RGB 0..255, the fourth number is the mode flags,
  usually 0) or `null` — no fill.
- The name translation is added to `src/i18n/ru.ts` (`'mapMode.coastal': '…'`); a test checks that it exists.
- The colours are muted: saturation no higher than 0.45, as for biomes.
- The optional `fill` field is the fill strength over the terrain (`DEFAULT_FILL` by default).

The shader does not need to change. On a mode switch `MapView.setMapMode(id)` recomputes the colours of all
provinces and uploads the data texture once. The M key cycles through the modes.

The province data texture: RGBA8, one texel per province, the `id` sits at `(id % width, id / width)`;
the width is the province count, but no more than `MAX_TEXTURE_SIZE`. RGB is the fill colour. A holds the
flags: bit 3 "has fill"; the other bits are reserved and unused (fog and ownership are NOT here: they live
in the province state texture below). A single province is changed by
`MapView.setProvinceData(id, rgba)`: only the changed range goes to the GPU, once per frame.

### Province state texture

A second RGBA8 texture in the same layout (one texel per province, same width and height); its CPU copy is
`ProvinceState` (`render/provinceState.ts`). R is the fog level 0..255 (0 unknown, 255 seen), G is 255 on the
player's own provinces, B and A are free. It is separate from the data texture so that a map-mode switch
(which rewrites the data texture) never touches game state. A change marks a dirty texel range; once per frame
only that range is uploaded. `FogFade` (`render/fogFade.ts`) eases the current level toward the target and
reports only the provinces that changed; it is render-only, not game state.

## How to add a hotkey

All keys are in `appHotkeys` (`src/ui/hotkeys.ts`):

```ts
{ id: 'fog', code: 'F4', nameKey: 'key.fog', action: a.toggleFog, allowInInput: true },
```

- `code` is `KeyboardEvent.code` (the physical key, independent of layout): `KeyM`, `F3`, `Digit1`.
- The action is added to `HotkeyActions` and passed from `main.ts`.
- The `nameKey` translation goes to `src/i18n/ru.ts`. The key appears in the F3 panel list by itself
  (`keyLabel` turns the code into a label: `KeyM` → M, `Equal` → +, `Space` → the translated word).
- `allowInInput: true` makes the key work while a text field is focused (F-keys type nothing); other keys are
  skipped there. A focused checkbox does not count as an input.

`registerHotkeys` attaches one `keydown` handler to the window, skips presses in inputs and
Ctrl/Alt/Meta combinations, and for its own keys cancels the browser action. A repeated `code` is an error at
startup; a test checks that there are no duplicates and that every key has a translation. Separate `keydown`
handlers on the window outside the registry are not created.
