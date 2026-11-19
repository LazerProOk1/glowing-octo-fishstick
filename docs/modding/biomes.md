# Biomes: how to add, disable, make a pack

Biomes are described by data. The generator picks the biome of a cell by its height, temperature, moisture and "arcana" (`arcana`), and the renderer takes the colour and texture from the same data. Biome names are unknown to both the generator and the shader: the generator relies on the kind (`kind`) and tags (`tags`).

Where things live:

| File | What is in it |
|---|---|
| `src/content/biomes/types.ts` | schema: `BiomeDef`, `PackManifest`, `GenOptions` |
| `src/content/packs/base/biomes.ts` | ordinary biomes |
| `src/content/packs/base/fantasyBiomes.ts` | fantasy biomes |
| `src/content/packs/base/manifest.ts` | the base pack |
| `src/content/registry.ts` | the pack list and the assembly of the world biomes (`resolveBiomes`) |

## How the biome is chosen

1. A cell below or at sea level (height ≤ 0.5) is chosen among biomes with `kind: 'water'`, above — among `kind: 'land'`.
2. Biomes are checked by descending `priority`. The first one whose `when` conditions all hold is the biome of the cell.
3. A condition is the half-open interval `[min, max)`: `min` inclusive, `max` exclusive. `-Infinity` and `Infinity` may be used. A missing condition always matches.
4. If nothing matches, the fallback biome of that kind is taken — a biome without conditions (`when: {}`). It is checked last at any priority. For land it is plains ("равнины"), for water — coast ("побережье").

World fields that the conditions are written on:

| Field | Range | Landmarks |
|---|---|---|
| `height` | 0..1 | sea ≤ 0.5, hills > 0.72, mountains > 0.85 |
| `temperature` | °C, mostly −25..30, lower on high mountains | glacier < −10, tundra < −2, taiga < 5 |
| `moisture` | 0..1 | steppe < 0.35, forest > 0.5, swamp > 0.72 |
| `arcana` | 0..1 | large noise patches; about 4 % of the land above 0.9, about 4 % below 0.1 |

## Biome fields

Required:

- `id` — latin snake_case, unique: `mushroom_forest`. This is the biome code in the data; it is what the world address and `disabledBiomes` use.
- `nameKey` — the translation key of the name: `biome.<id>`. The text itself is in `src/i18n/ru.ts` (`'biome.mushroom_forest': 'грибной лес'`), and it is visible in the tooltip above a province. The test `tests/i18n-content.test.ts` will not let a biome without a translation through.
- `kind` — `'land'` or `'water'`.
- `fantasy` — `true` if the biome appears only in a world with fantasy.
- `color` — colour `[r, g, b]`, integers 0..255. HSL saturation no more than 0.45 (the map is muted; the test will not let a brighter one through). Lightness 0.2..0.9.
- `detail` — the detail texture from the atlas: `grass`, `forest`, `sand`, `rock`, `snow`, `mud`, `paper`. The atlas provides only a luminance pattern, the colour comes from `color`.
- `priority` — a number; higher is checked earlier.
- `when` — conditions (see above); `{}` is the fallback biome.

Optional:

- `tags` — roles for the generator:
  - `mountain` — a mountain range: provinces do not smear it over the lowlands, and a province with it counts as mountainous;
  - `hill` — hills: a mountain cell may go only to hills;
  - `deepWater`, `shallowWater` — deep and shallow water (drowned islets become shallow water);
  - `lake` — lake water (the base biome `lake`, "озеро"). A lake is a closed water body that does not touch the map edge and covers no more than `LAKE_MAX_CELLS` (6000) cells (`src/sim/world/lakes.ts`). Such a biome is never chosen by conditions: its `when` is empty, but it does not count as a fallback, it is given to all lake cells. A biome with this tag must be water. Lake provinces are marked `water: 'lake'` and do not mix with sea ones; the shader draws lakes lighter and greener than the sea (in the palette they have their own marker instead of a detail slot). In the pack the lake comes last, so that the codes of the other biomes do not shift.
- `modifiers` — `{ defense, moveCost }`, groundwork for the future, not used yet.

## Example: mushroom forest

Let us add a humid warm forest that grows in patches where the arcana is high.

**1. Describe the biome.** In `src/content/packs/base/fantasyBiomes.ts` (for fantasy) or `biomes.ts` (for an ordinary one) add an entry to the array:

```ts
{
  id: 'mushroom_forest',
  nameKey: 'biome.mushroom_forest',
  kind: 'land',
  fantasy: true,
  color: [128, 106, 118],
  detail: 'forest',
  priority: 75,
  when: { temperature: [6, 24], moisture: [0.55, Infinity], arcana: [0.79, Infinity] },
},
```

**2. Add the translation.** In `src/i18n/ru.ts`: `'biome.mushroom_forest': 'грибной лес',`.

**3. Pick a priority.** The ordinary land biomes stand like this: mountains 95, hills 90, glacier 80, tundra 70, jungle 60, desert 50, taiga 40, steppe 30, swamp 20, forest 10, plains 0 (fallback). Priority 75 puts the mushroom forest above all climate biomes, but below hills and mountains: it will not grow on hills.

**4. Pick a colour.** Take the colour of a close ordinary biome and shift the hue without raising the saturation. Forest is `[109, 126, 84]`; mushroom forest is `[128, 106, 118]` — the same lightness, a lilac-brown hue.

**5. Check how much of it is on the map.** A new biome must be noticeable but must not fill the continent. Run `npx vitest run tests/content` — the fantasy test checks that every fantasy biome covers at least 200 cells on one of the seeds `"1"`, `"2"`, `"Бета-7"`, `"worldbox"`, and all of them together 3..12 % of the land. If there is too much of the biome, narrow the conditions (for example `arcana: [0.85, Infinity]`); if too little, widen them.

**6. Look at it in the browser.** `npm run dev`, then the address `#Бета-7?fantasy=1`. Hover over a province — the tooltip shows "грибной лес".

The generator, shader and interface code do not need to change.

## Enabling and disabling

Via the world address:

- `#Бета-7?fantasy=1` — with fantasy biomes;
- `#Бета-7?off=swamp,desert` — without swamps and deserts;
- `#Бета-7?fantasy=1&off=magic_forest` — with fantasy, but without the magic forest;
- `#Бета-7?fantasy=1&size=small&off=swamp` — the same for a small map (`small` 1024×512, `medium` 2048×1024 — the default, `large` 3072×1536).

Via code — the world params (`WorldParams`, src/sim/world/params.ts):

```ts
const p = defaultParams('Бета-7');
generateWorld({ ...p, options: { ...p.options, fantasy: true, disabledBiomes: ['swamp'] } });
```

A disabled biome is removed from the world list, and its cells go to the next suitable biome by priority. Mountains can be disabled — hills will take them. The land fallback biome (`plains`) and the water biomes tagged `deepWater`/`shallowWater`/`lake` (`ocean`, `coast`, `lake`) cannot be disabled: generation stops with an error that names the biome.

Biome codes in the world are indices in the list of enabled biomes (`world.biomes`). Without fantasy and without disabled biomes the list matches the order in `biomes.ts`; fantasy biomes come after the ordinary ones. Do not change the order in `biomes.ts`: the reference world hashes in `tests/sim/world/fingerprint.test.ts` rest on it. Any change that alters the generation result (including a new biome in the base pack) requires bumping `GEN_VERSION` in `src/sim/world/params.ts` and updating the fingerprint.

## Your own pack

A pack is a `src/content/packs/<id>/` folder with a `manifest.ts` file:

```ts
import type { PackManifest } from '../../biomes/types';

export const WW2_PACK: PackManifest = {
  id: 'ww2',
  nameKey: 'pack.ww2',
  version: '0.1.0',
  biomes: [
    {
      id: 'bocage',
      nameKey: 'biome.bocage',
      kind: 'land',
      fantasy: false,
      color: [118, 128, 92],
      detail: 'grass',
      priority: 15,
      when: { temperature: [6, 16], moisture: [0.45, 0.6] },
    },
  ],
  overrides: {
    forest: { color: [100, 112, 86] },
  },
};
```

Then hook it up in `src/content/registry.ts`:

```ts
import { WW2_PACK } from './packs/ww2/manifest';

export const PACKS: readonly PackManifest[] = [BASE_PACK, WW2_PACK];
```

Add the translations of `pack.ww2` and `biome.bocage` to `src/i18n/ru.ts`. Enable the pack in the world params: `generateWorld({ ...defaultParams(seed), packs: ['base', 'ww2'] })` or with the address `#seed?packs=base,ww2`.

Assembly rules:

- packs are applied in the order of the `packs` list;
- an empty `packs=` in the address (for example a truncated link) is read as the default packs, and `buildWorldUrl` does not write an empty list;
- the biomes of a pack are appended to the end of the list (their codes come after the biomes of the previous packs);
- `overrides` changes the fields of already declared biomes (of this or previous packs) by `id`; `id` cannot be changed. A field is replaced whole: `overrides: { forest: { when: { moisture: [0.6, Infinity] } } }` gives the forest its new conditions in full, the previous conditions on other fields are not kept;
- all declared biomes are validated after the edits, including the disabled ones and the fantasy ones in a world without fantasy;
- a biome with an already taken `id` cannot be declared — use `overrides` to edit it;
- an override of a non-existent biome, an unknown pack and an unknown biome in `disabledBiomes` are errors;
- a world has no more than 32 biomes.

## What the tests check

`tests/content/registry.test.ts`:

- `id`s are unique and in snake_case, the required fields are filled in;
- the colour is integers 0..255, saturation ≤ 0.45, lightness 0.2..0.9;
- `detail` is an existing atlas slot;
- every condition has `min < max`;
- there is exactly one land fallback biome, there is water tagged `deepWater`, `shallowWater` and `lake`, and there are biomes tagged `mountain` and `hill`;
- disabling, errors when disabling required biomes, assembling a pack with `overrides`.

The same checks are performed by `resolveBiomes` on every generation, so a mistake in pack data shows up immediately.

`tests/content/fantasy.test.ts` — the share of fantasy biomes on the map, disabling `swamp` and `desert` (the cells went to other land biomes, the provinces are uniform).

`tests/sim/world/biomes.test.ts` — an ordinary world matches the old decision list cell for cell.

`tests/sim/world/provinces.test.ts` — provinces are uniform by biome, mountain ranges (tag `mountain`) lie in mountainous provinces; with fantasy too.

`tests/render/palette.test.ts` — the colours of all biomes are muted.
