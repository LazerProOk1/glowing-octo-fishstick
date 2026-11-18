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

/** Рёбра соседства одним массивом: a, b, length, riverLength, флаги (бит 0 — река, бит 1 — пролив). */
function edgesBytes(world: World): Int32Array {
  const out = new Int32Array(world.adjacency.length * 5);
  world.adjacency.forEach((e, i) => {
    out.set([e.a, e.b, e.length, e.riverLength, (e.river ? 1 : 0) | (e.strait ? 2 : 0)], i * 5);
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
  // Поля климата — отдельными ключами, чтобы не менять эталон world выше.
  climate: {
    temperature: '72579061',
    moisture: 'df0babb0',
    arcana: 'eaaa4394',
  },
  // v3 (озёра): биом lake на клетках замкнутых водоёмов — меняются biome и terrain (канал G).
  // v3, Task 5 этапа 1.5 (та же версия): морские провинции крупнее вдали от берега — меняются
  // provinceOf, рёбра и запекание provinceRG и border.
  // v3, Task 6 (та же версия): биом выбирается по температуре и влажности со смещением шумом
  // (classifyTemperatureJitter / classifyMoistureJitter) — меняются biome, provinceOf, рёбра и
  // запекание provinceRG, terrain, border, biomeColor. Поля климата не меняются.
  // Там же, раунд правок: смещение влажности ±0.05 → ±0.15 — те же массивы плюс provinceSeaRG;
  // масштаб смещения 40–120 клеток на любом размере (меняет только small/large, здесь FANTASY_SMALL).
  // Task 6b (рендер, версия та же): новая текстура provinceSeaRG — владельцы там, где на экране
  // вода (displaySeaProvinceOf). Остальные хэши не меняются.
  // Раунд правок 6b: поле расстояний border больше не запекается (шейдер его не читал) — хэш убран.
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
    provinceSeaRG: 'febeaa62',
    terrain: '75715fe9',
    bakeHeight: '8c184fb8',
    surface: 'a378f8da',
    biomeColor: '56c7e2f4',
  },
};

/** Фэнтези включено (fantasy=1), размер small: ловит дрейф арканы и фэнтези-биомов. */
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

  it('поля климата побитно совпадают с отпечатком', () => {
    expect(climateHashes(world), CHANGED).toEqual(FINGERPRINT.climate);
  });

  it('запечённые текстуры побитно совпадают с эталоном', () => {
    expect(
      {
        provinceRG: fnv1a(bake.provinceRG),
        provinceSeaRG: fnv1a(bake.provinceSeaRG),
        terrain: fnv1a(bake.terrain),
        bakeHeight: fnv1a(bake.height),
        surface: fnv1a(bake.surface),
        biomeColor: fnv1a(bake.biomeColor),
      },
      'запекание изменилось — обнови хэши, если так задумано',
    ).toEqual(FINGERPRINT.bake);
  });
});

describe('отпечаток мира с фэнтези (сид "1", small, fantasy=1)', () => {
  it('массивы мира и климат побитно совпадают с отпечатком', () => {
    const p = defaultParams('1');
    p.options.fantasy = true;
    p.options.size = 'small';
    const world = generateWorld(p);
    expect({ world: worldHashes(world), climate: climateHashes(world) }, CHANGED).toEqual(FANTASY_SMALL);
  }, 60000);
});
