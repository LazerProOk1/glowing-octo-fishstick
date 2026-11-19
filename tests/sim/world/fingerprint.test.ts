import { beforeAll, describe, expect, it } from 'vitest';
import { bakeWorld, type WorldBake } from '../../../src/render/bakeWorld';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams, GEN_VERSION } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';
import { fnv1a, worldHash } from '../../../src/sim/world/worldHash';

/** Adjacency edges as one array: a, b, length, riverLength, flags (bit 0 — river, bit 1 — strait). */
function edgesBytes(world: World): Int32Array {
  const out = new Int32Array(world.adjacency.length * 5);
  world.adjacency.forEach((e, i) => {
    out.set([e.a, e.b, e.length, e.riverLength, (e.river ? 1 : 0) | (e.strait ? 2 : 0)], i * 5);
  });
  return out;
}

/**
 * Fingerprint of the default world (seed "1", medium, base pack) — the only place with reference
 * hashes. It catches any change of the generation or baking result, including "pure"
 * optimisations. If the generation result changes on purpose, bump GEN_VERSION
 * (src/sim/world/params.ts) and update genVersion and the hashes here in the same commit, with a
 * note why. The baking hashes (provinceRG … biomeColor) also change without a version bump — when the renderer changes.
 */
const FINGERPRINT = {
  // Climate fields as separate keys, so the world reference above is not changed.
  climate: {
    temperature: '72579061',
    moisture: 'df0babb0',
    arcana: 'eaaa4394',
  },
  // v3 (lakes): the lake biome on closed water body cells — biome and terrain (channel G) change.
  // v3, stage 1.5 task 5 (same version): sea provinces are larger away from the shore — provinceOf,
  // the edges and the provinceRG bake change.
  // v3, task 6 (same version): the biome is chosen by temperature and moisture jittered with noise
  // (classifyTemperatureJitter / classifyMoistureJitter) — biome, provinceOf, the edges and the
  // provinceRG, terrain, biomeColor bakes change. The climate fields do not change.
  // There too, fix round: moisture jitter ±0.05 → ±0.15 — the same arrays plus provinceSeaRG;
  // the jitter scale is 40–120 cells at any size (changes only small/large, here FANTASY_SMALL).
  // Task 6b (render, same version): a new provinceSeaRG texture — owners where the screen shows
  // water (displaySeaProvinceOf). The other hashes do not change.
  // Fix round 6b: one of the baked fields is no longer baked (the shader never read it) — its hash is gone.
  // Task 7, fix round (render): a new seaDepth texture — smooth sea depth. The others do not change.
  // Task 7, round 2: seaDepth — large-scale depth of the real bottom on a grid 4 times smaller
  // (no halos at the shore). Round 3: σ 24 → 16, then 20. Only the seaDepth hash changes each time.
  // Final stage 1.5 fixes (render): channel A of provinceSeaRG now stores the water kind of the cell
  // (land 255, sea 128, lake 0; it used to be always 255) — the shader takes the lake from there with
  // no extra lookups. Only the provinceSeaRG hash changes.
  genVersion: 3,
  world: {
    height: '9f842423',
    biome: '1abe8225',
    provinceOf: 'da129b5b',
    riverMask: '61e3f25d',
    edges: 'a972fa1e',
  },
  bake: {
    provinceRG: 'd2fb384e',
    provinceSeaRG: '55724b76',
    terrain: '75715fe9',
    bakeHeight: '8c184fb8',
    surface: 'a378f8da',
    biomeColor: '56c7e2f4',
    seaDepth: 'c62b13b1',
  },
};

/** Fantasy on (fantasy=1), small size: catches drift of arcana and fantasy biomes. */
const FANTASY_SMALL = {
  world: { height: 'a62966d8', biome: 'af01c386', provinceOf: '457112f3', riverMask: '285b5862', edges: '6a0d52d3' },
  climate: { temperature: '7911d17e', moisture: 'c26fbf9e', arcana: 'a5ff6b92' },
};

function climateHashes(world: World): Record<string, string> {
  return { temperature: fnv1a(world.temperature), moisture: fnv1a(world.moisture), arcana: fnv1a(world.arcana) };
}

function worldHashes(world: World): Record<string, string> {
  return {
    height: fnv1a(world.height),
    biome: fnv1a(world.biome),
    provinceOf: fnv1a(world.provinceOf),
    riverMask: fnv1a(world.riverMask),
    edges: fnv1a(edgesBytes(world)),
  };
}

const CHANGED = 'генерация изменилась — подними GEN_VERSION и обнови отпечаток (tests/sim/world/fingerprint.test.ts)';

describe('world fingerprint (seed "1", default params)', () => {
  let world: World;
  let bake: WorldBake;
  beforeAll(() => {
    world = generateWorld(defaultParams('1'));
    bake = bakeWorld(world);
  }, 60000);

  it('the generator version matches the fingerprint version and is stored in the world', () => {
    expect(GEN_VERSION, CHANGED).toBe(FINGERPRINT.genVersion);
    expect(world.params.genVersion).toBe(GEN_VERSION);
  });

  it('the world arrays and edges match the fingerprint bit for bit', () => {
    expect(worldHashes(world), CHANGED).toEqual(FINGERPRINT.world);
  });

  it('the climate fields match the fingerprint bit for bit', () => {
    expect(climateHashes(world), CHANGED).toEqual(FINGERPRINT.climate);
  });

  it('the baked textures match the reference bit for bit', () => {
    expect(
      {
        provinceRG: fnv1a(bake.provinceRG),
        provinceSeaRG: fnv1a(bake.provinceSeaRG),
        terrain: fnv1a(bake.terrain),
        bakeHeight: fnv1a(bake.height),
        surface: fnv1a(bake.surface),
        biomeColor: fnv1a(bake.biomeColor),
        seaDepth: fnv1a(bake.seaDepth),
      },
      'запекание изменилось — обнови хэши, если так задумано',
    ).toEqual(FINGERPRINT.bake);
  });
});

describe('world fingerprint with fantasy (seed "1", small, fantasy=1)', () => {
  it('the world arrays and climate match the fingerprint bit for bit', () => {
    const p = defaultParams('1');
    p.options.fantasy = true;
    p.options.size = 'small';
    const world = generateWorld(p);
    expect({ world: worldHashes(world), climate: climateHashes(world) }, CHANGED).toEqual(FANTASY_SMALL);
  }, 60000);
});

/** worldHash (the world hash for online comparison) of seed "1", small, without fantasy — another reference, also here. */
const WORLD_HASH_SMALL = '1cbd4496';

describe('worldHash of seed "1", small', () => {
  it('matches the reference', () => {
    const p = defaultParams('1');
    p.options.size = 'small';
    expect(worldHash(generateWorld(p)), CHANGED).toBe(WORLD_HASH_SMALL);
  }, 60000);
});
