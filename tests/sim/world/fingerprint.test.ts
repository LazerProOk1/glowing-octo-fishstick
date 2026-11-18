import { beforeAll, describe, expect, it } from 'vitest';
import { bakeWorld, type WorldBake } from '../../../src/render/bakeWorld';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams, GEN_VERSION } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';

/** FNV-1a (32 бита) по байтам массива. */
function fnv1a(v: ArrayBufferView): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Рёбра соседства одним массивом: a, b, length, флаги (бит 0 — река, бит 1 — пролив). */
function edgesBytes(world: World): Int32Array {
  const out = new Int32Array(world.adjacency.length * 4);
  world.adjacency.forEach((e, i) => {
    out.set([e.a, e.b, e.length, (e.river ? 1 : 0) | (e.strait ? 2 : 0)], i * 4);
  });
  return out;
}

/**
 * Отпечаток мира по умолчанию (сид "1", medium, базовый пак) — единственное место с эталонными
 * хэшами. Ловит любое изменение результата генерации или запекания, в том числе от «чистых»
 * оптимизаций. Если результат генерации меняется намеренно — поднимите GEN_VERSION
 * (src/sim/world/params.ts) и обновите здесь genVersion и хэши в том же коммите, с пояснением.
 * Хэши запекания (provinceRG … biomeColor) меняются и без смены версии — при правке рендера.
 */
const FINGERPRINT = {
  genVersion: 2,
  world: {
    height: '9f842423',
    biome: 'f90fce94',
    provinceOf: '73a46d57',
    riverMask: '61e3f25d',
    edges: '522b084f',
  },
  bake: {
    provinceRG: 'f52e8e7b',
    terrain: '698d898a',
    border: '71e81ee6',
    bakeHeight: '8c184fb8',
    surface: 'a378f8da',
    biomeColor: 'af7d1df9',
  },
};

const CHANGED = 'генерация изменилась — подними GEN_VERSION и обнови отпечаток (tests/sim/world/fingerprint.test.ts)';

describe('отпечаток мира (сид "1", параметры по умолчанию)', () => {
  let world: World;
  let bake: WorldBake;
  beforeAll(() => {
    world = generateWorld(defaultParams('1'));
    bake = bakeWorld(world);
  }, 60000);

  it('версия генератора совпадает с версией отпечатка и записана в мир', () => {
    expect(GEN_VERSION, CHANGED).toBe(FINGERPRINT.genVersion);
    expect(world.params.genVersion).toBe(GEN_VERSION);
  });

  it('массивы мира и рёбра побитно совпадают с отпечатком', () => {
    expect(
      {
        height: fnv1a(world.height),
        biome: fnv1a(world.biome),
        provinceOf: fnv1a(world.provinceOf),
        riverMask: fnv1a(world.riverMask),
        edges: fnv1a(edgesBytes(world)),
      },
      CHANGED,
    ).toEqual(FINGERPRINT.world);
  });

  it('запечённые текстуры побитно совпадают с эталоном', () => {
    expect(
      {
        provinceRG: fnv1a(bake.provinceRG),
        terrain: fnv1a(bake.terrain),
        border: fnv1a(bake.border),
        bakeHeight: fnv1a(bake.height),
        surface: fnv1a(bake.surface),
        biomeColor: fnv1a(bake.biomeColor),
      },
      'запекание изменилось — обнови хэши, если так задумано',
    ).toEqual(FINGERPRINT.bake);
  });
});
