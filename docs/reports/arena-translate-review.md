# Code comment translation to English + review

Date: 2026-11-19
Branch: `arena/88549d63-glowing-octo-fishstick` (branched from `stage-1-map`, commit `e07d454`)
Scope: comments and test names in `src/**` and `tests/**`; review notes collected while reading the code.

## 1. Summary

### What was translated

- 96 files touched: 51 under `src/`, 45 under `tests/` (all test files that carried Russian titles or comments).
- 802 comment lines (`//`, `/* */`, JSDoc) rewritten in English.
- 273 `describe` / `it` / `test` title lines rewritten in English.
- Review found one code-token exception: five test callbacks in `tests/worker/genClient.test.ts`
  (lines 167, 192, 203, 221, 230) gained `async`; they contain no `await`, so the change is behaviour-neutral.
  Those five `async` were removed in a follow-up commit, and the source diff is comments, test titles and docs only; the root MIT `LICENSE` was removed separately.
- No other code, logic, formatting, import, string literal or identifier changes.

### Deliberately left in Russian (not comments / not titles)

- `src/i18n/ru.ts` — the whole file is untouched (game UI text).
- User-visible strings: `throw new Error('нужны и водные, и сухопутные биомы')` and the other Russian
  exception messages in `src/content/registry.ts`, `src/sim/world/*.ts`, `src/render/bake.ts`
  (see finding C1 — they are a problem, but they are string literals, not comments).
- Seed data in tests: `'Бета-7'`, `'другое-зерно'`, `'нет.такого'`, the `/[Ѐ-ӿ]/` regex constant,
  and the expected UI text inside one test title (`"Озеро · вода"`, `tests/ui/tooltip.test.ts:12`).

### Verification

Command run after the change, in order: `npm ci` → `npm test` → `npm run lint` → `npx tsc --noEmit`.

| Command | Result | Exit code |
| --- | --- | --- |
| `npm ci` | 168 packages, no audit gate in the script | `0` |
| `npm test` (`vitest run`) | 47 files passed, 480 tests passed, 15 skipped (495) | `0` |
| `npm run lint` (`eslint .`) | no output after the banner | `0` |
| `npx tsc --noEmit` | no output | `0` |

`tests/sim/world/fingerprint.test.ts` was not touched (only Russian comments in it were translated) and its
expected hashes are unchanged — all fingerprint tests pass, so world fingerprints are identical.

A baseline `npm test` run before the change had the same numbers (47 files / 480 passed / 15 skipped),
so the test names are translated but the set of tests is unchanged.

Branch note: this session was pinned to `arena/88549d63-glowing-octo-fishstick`, so the requested branch
name `arena/translate-comments` was not created; the work is committed on the session branch and the PR
targets `stage-1-map`.

## 2. Review findings

Findings were collected while reading every commented file. Nothing was fixed — only reported.

### Critical

#### C1. Russian exception messages escape the i18n layer and reach the player

- `src/ui/errorScreen.ts:29-31` — `errorDetail()` returns the raw exception message for anything that is
  not `province_cleanup_no_converge`.
- `src/main.ts:112`, `src/main.ts:172`, `src/main.ts:202` — that raw text is passed to `showError()` and
  rendered in the error panel.
- Sources of Russian messages: `src/sim/world/generateWorld.ts:20`, `:43`, `:46`;
  `src/sim/world/biomes.ts:52`; `src/sim/world/lakes.ts:40`; `src/sim/world/shoreline.ts:29`;
  `src/content/registry.ts:42`, `:44`, `:46`, `:47`, `:49`, `:52`-`:56`, `:59`, `:72`, `:74`, `:79`,
  `:89`, `:90`, `:93`, `:97`, `:101`; `src/render/bake.ts:49`, `:75`.

Why it matters: `CLAUDE.md` ("All UI text in `src/i18n/ru.ts`") is a hard rule, and these strings are
user-visible whenever generation or baking fails: the player sees a raw developer message in Russian,
outside the translation table. It also blocks the planned `en.ts` (the comment in `src/i18n/ru.ts:68`
already promises it), and it pins tests to Russian text
(`tests/sim/world/generateWorld.test.ts:15`, `:65` assert on `'слишком много провинций'` and
`'версии генератора'`), so renaming a message breaks tests that do not test behaviour.

Suggested fix: throw codes from `src/sim/world/errors.ts` (`ERR_TOO_MANY_PROVINCES`, `ERR_GEN_VERSION`,
…) exactly as `ERR_CLEANUP_NO_CONVERGE` is already done, and map codes to `t()` keys inside `errorDetail()`.
Keep the numbers (limit, versions) as separate arguments. Update the tests to assert on the code.

### Important

#### I1. `src/render/mapShader.ts` is over the file-size limit

`src/render/mapShader.ts` is 455 lines; `CLAUDE.md` hard rule is "Files ≤ ~450 lines". It is the only file
over the limit, but two more are close: `src/render/MapView.ts` (431) and `src/render/riverLayer.ts` (381).
The shader file mixes GLSL source chunks, uniform plumbing and the per-mode shading branches; the next
feature will not fit.

Suggested fix: move the GLSL fragments (`SOFT_GLSL`, `SEA_DEPTH_GLSL`, `WAVE_GLSL`, palette helpers) into
`src/render/shaders/*.ts` before stage 2 touches the shader again.

#### I2. Two implementations of "biome → water kind", with a misleading comment

`src/render/bake.ts:63-70` (`SEA_MAP_ALPHA` + `waterClassTable`) and `src/render/textures.ts:109-118`
(the palette alpha) both classify a biome as lake / water / land with the same branch
(`hasTag(d,'lake') ? … : d.kind === 'water' ? … : …`), but encode it differently (alpha 0/128/255 vs atlas
slot `LAKE_SLOT` 254 / `WATER_SLOT` 255 / `DETAIL_SLOT_OF`). The comment at `src/render/bake.ts:65` says
"the same mapping as the palette slots in paletteData" — it is not the same mapping, it is the same
three-way branch with different outputs, so the comment misleads a reader into thinking there is one
source of truth.

Why it matters: adding a new water tag or biome kind requires editing both places, and the two paths fail
differently (one throws, the other renders a wrong colour — see I5).

Suggested fix: one exported helper `waterKind(def): 'land'|'sea'|'lake'` in `src/content/registry.ts`;
both encoders switch on it; fix the comment.

#### I3. Detail atlas slots are declared twice, in two layers

`src/content/biomes/types.ts:5` declares `DETAIL_SLOT_NAMES = ['grass','forest','sand','rock','snow','mud','paper']`;
`src/render/assets.ts:7-27` declares the same set again as `DetailSlot` + `DETAIL_SLOT_OF`, which fixes the
numeric slot order used by `assets/terrain/atlas.png`. `src/content/registry.ts:54` validates `def.detail`
against the content copy only, and `tests/content/registry.test.ts:47` checks only names. However,
`tests/render/assets.test.ts:15` asserts that every name maps to its index, so the order cannot drift
silently. Adding a slot still means editing both files and repainting the atlas with the same order.

Suggested fix: keep the single ordered list in `src/content/biomes/types.ts` and derive
`DETAIL_SLOT_OF` in `src/render/assets.ts` from it (index = slot); the existing assets test already guards
the order until then.

#### I4. Tests assert on GLSL source text instead of shader behaviour

`tests/render/seaDepth.test.ts:39-44` and `tests/render/seaWaves.test.ts:42-56` pass only if the shader
source contains exact substrings (`'t * (1.0 + TONE_K) / (t + TONE_K)'`, `'if (a <= 0.0) continue;'`,
`cos`/`sin` never appearing, specific `toFixed(8)` constants). Any cosmetic refactor of the GLSL (renaming a
local, re-wrapping a line, computing the formula inline) fails these tests, while a real behaviour change
that keeps the text passes. That is the opposite of what a regression test should do.

Why it matters: the shader is the most expensive thing to get wrong and the hardest to test; these tests
give false confidence and add friction to refactoring.

Suggested fix: extract the shared formula/constants into a single TS module used to generate the GLSL
string (then a plain unit test of the TS function is enough), or keep the string checks only for
"no texture lookups" and compute expected values from the parsed constants instead of raw text.

#### I5. Unknown biome codes: throw in one path, silent wrong colour in another

`src/render/bake.ts:73-77` throws `нет биома с кодом …` for an unknown code, but
`src/render/biomeColors.ts:44-51` (`colorLut`) silently substitutes `MAP_COLORS.beach` with the *land* flag
for any code without a definition. So a corrupted bake or an off-by-one pack change produces either a hard
failure (terrain/water alpha) or a plausible-looking but wrong map (biome colours), depending on which
texture is built.

Suggested fix: validate the biome array once before baking (or make `colorLut` throw like `bake.ts`), so
both paths fail the same way.

#### I6. The "no Cyrillic in UI strings" guard covers only `src/ui`

`tests/i18n.test.ts:13` collects files from `src/ui/*.ts` only, so `tests/i18n.test.ts:58` cannot see that
`src/render/MapView.ts:141` logs a Russian string, and it would not notice a Russian string in
`src/render`, `src/worker` or `src/main.ts` (all of which already contain Russian exception messages, C1).
The rule the test claims to protect is therefore only half enforced.

Suggested fix: scan every `src/**/*.ts` outside `src/i18n/` for Cyrillic string literals, with an explicit
allow-list for the codes/messages that are still being migrated.

### Minor

#### M1. Dead data: `BiomeDef.modifiers`

`src/content/biomes/types.ts:47-48` (`modifiers?: { defense?; moveCost? }`) is never read anywhere in `src/`
or `tests/`, and `src/content/registry.ts` does not validate it. A pack can ship nonsense here and nothing
will notice. Either validate it or drop it until stage 2 needs it.

#### M2. Reserved province flag bits are never set

`src/render/provinceData.ts:9-22` defines `UNEXPLORED`, `HIDDEN`, `TARGET` and preserves them across mode
changes (`STATE_BITS`, used at `:93`, `:98`), but no production code ever sets them and the shader ignores
them (only `FLAG_FILL` is read, `src/render/mapShader.ts:155`). The whole preservation mechanism is
exercised only by `tests/render/provinceData.test.ts:55`. Cheap to keep, but it is untested-for-real code.

#### M3. `encodeProvinceId` / `decodeProvinceId` are used only by tests

`src/render/bake.ts:5-12`. Production code inlines the same two operations
(`src/render/bake.ts:46-47`, `src/render/mapShader.ts:150-155`). Either use the helpers in the baking code or
drop them and test the pixels directly; right now the "one implementation" intent is not met.

#### M4. The biome classification rule exists twice

`src/sim/world/biomes.ts:56-73` (`pick`) and the inlined copy in `computeBiomes`
(`src/sim/world/biomes.ts:162-180`) must stay identical. They do (a test compares them), but any future
change to the condition semantics has to be made twice, and the inlined copy is the one that runs on 2M
cells — the riskier one to edit.

#### M5. Seed trimming is asymmetric between parse and build

`src/worldUrl.ts:37` trims the seed, `src/worldUrl.ts:60` does not. So for `defaultParams(' seed ')`,
`parseWorldUrl(buildWorldUrl(p)).seed !== p.seed`, and `requestKey()`
(`src/main.ts:19`, used for de-duplication in `src/main.ts:134-137`) compares a padded key with a trimmed
one. Trim in one place, or normalise the seed in `defaultParams`.

#### M6. A protocol-mismatch message can kill an unrelated request

`src/worker/genClient.ts:80-85`: the mismatch branch calls `onError(mismatch)` — which rejects the *current*
pending request and terminates the worker — before checking `msg.id`. If a queued message from a superseded
worker (termination is not instant) or from an older script version arrives, a fresh, valid request is
rejected. Check the id first, or only treat a mismatch as fatal when it answers the current id.

#### M7. Comment refers to a file that does not exist

`src/i18n/ru.ts:68`: "another language — a file with the same keys (`en.ts`)". There is no `en.ts` in the
repository. Harmless, but it reads as if the file exists. (Left untouched: `ru.ts` was out of scope.)

#### M8. `startTimeout` can install a second timer without clearing the first

`src/worker/genWorker.ts:132-138`: `startTimeout()` assigns `timer` again; if it were called twice, the
first timer would keep running and later terminate a worker that has already answered. It is called once
today (`src/worker/genWorker.ts:180`), so this is latent, not live.

#### M9. Strip cells that the coastal walk cannot reach keep the wrong side

`src/render/bakeWorld.ts:105-160`: only strip cells adjacent to a seeded source cell are given an owner;
strip cells that are marked (`state = 1`) but never reached keep their own province, i.e. the cell that
the screen will draw as land stays owned by a water province (and vice versa for the water map). Tests
compare against the previous implementation, so behaviour is "as before", but no test covers an
unreachable strip cell specifically.

Files near the 450-line limit (informational, no action needed yet):
`src/render/MapView.ts` 431, `src/render/riverLayer.ts` 381, `src/render/bakeWorld.ts` 224,
`tests/sim/world/provincesSuite.ts` 300, `tests/sim/world/provinceMetrics.ts` 303.

## 3. Translations I was unsure about

1. `src/ui/hotkeys.ts` (old comment: "physical key, layout-independent (M = Ь)") — the example relies on the
   Russian ЙЦУКЕН layout. I replaced it with "same code on QWERTY and JCUKEN" to keep the meaning without
   leaving Cyrillic in a comment; if you prefer the letter example, restore `(KeyM is the Ь key)`.
2. "п.п." (percentage points) in `src/sim/world/biomes.ts` — translated as **pp** ("Biome shares stay
   within 1 pp").
3. "зерно" — always translated as **seed** (debug panel, URL, RNG). "Зерно бумаги" (paper grain) in
   `src/render/seaDepth.ts` is a different word and became **paper grain**.
4. "отмывка" — **shading / hill shading**; "извилины реки" — **meanders**; "устье" — **mouth**;
   "приток" — **tributary**; "переправа" — **crossing**; "коса" — **spit**; "подложка" — **underlay**;
   "задел" — **groundwork**. These are load-bearing domain words in this project; if you settle on other
   English terms for the spec, they should be changed everywhere at once.
5. `tests/ui/tooltip.test.ts:12` — the title describes a label whose text is a UI string; I translated the
   sentence but kept the expected Russian label `"Озеро · вода"` verbatim, because changing it would change
   what the test asserts.
6. DNA-level data in tests (`'Бета-7'` seeds, `'другое-зерно'`) — kept as data; translating a seed would
   change the generated world and the fingerprints.
7. JSDoc blocks occasionally needed one extra line because English is longer than Russian; the meaning is
   unchanged but a few blocks are re-wrapped (`src/sim/world/adjacency.ts`, `src/sim/world/biomes.ts`,
   `src/sim/world/worldHash.ts`, `src/render/softProvince.ts`, `tests/sim/world/provincesSuite.ts`).

## 4. Follow-up (fixes)

Re-checked against the code on 2026-11-20; nothing below needs fixing again.

- C1 fixed — `532c1be`, `7d5edca`: `CodedError` in `src/content/errors.ts`; `errorDetail` in `src/ui/errorScreen.ts` maps `error.<code>` keys from `src/i18n/ru.ts`.
- I1 fixed — `04c5246`, `0aded21`: `src/render/mapShader.ts` 455 -> 358 lines, soft-province GLSL moved to `src/render/shaders/softProvince.ts` (shader bytes identical). Largest file is now `src/render/MapView.ts` (431).
- I2 fixed — `2586e01`: shared `waterKind` in `src/content/registry.ts`, used by `src/render/textures.ts` (and `bake.ts`).
- I3 fixed — `2586e01`: `DETAIL_SLOT_OF` derived from `DETAIL_SLOT_NAMES` in `src/render/assets.ts`.
- I4 fixed — `0aded21`: GLSL substring assertions removed; kept only a narrow no-texture-fetch guard in `tests/render/seaWaves.test.ts` (per-pixel cost).
- I5 fixed — `2586e01`: `biomeColors.ts` now throws `CodedError('no_biome_code')` like `bake.ts`.
- I6 fixed — `532c1be`: `tests/i18n.test.ts` scans every `.ts` under `src` except `src/i18n`.
- M1 fixed — `2586e01`: `BiomeDef.modifiers` removed.
- M2 fixed — `2586e01`: unused province state flags removed from `src/render/provinceData.ts`.
- M3 fixed — `2586e01`: `encodeProvinceId`/`decodeProvinceId` removed.
- M4 not changed, by design: the inlined biome rule is the 2M-cell hot path (`src/sim/world/biomes.ts`); `tests/sim/world/biomes.test.ts` compares it with a reference copy.
- M5 fixed — `18d50cb`: `buildWorldUrl` trims the seed (`src/worldUrl.ts`). Seed normalisation inside `defaultParams` deliberately not added (debug panel and URL parse already trim).
- M6 fixed — `ca633e7`: request id is checked before the protocol-mismatch rejection (`src/worker/genClient.ts`).
- M8 fixed — `ca633e7`: `startTimeout` clears the previous timer (`src/worker/genWorker.ts`).
- M7 fixed — `532c1be`/`7d5edca`: the `src/i18n/ru.ts` comment now says "future en.ts" instead of promising an existing file.
- M9 not a bug — `4d34a9d`: probe on 5 seeds found 0 unreachable strip cells in generated worlds; behaviour pinned in `tests/render/coast.test.ts`, explained in `src/render/bakeWorld.ts`.
