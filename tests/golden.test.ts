import { beforeAll, describe, expect, it } from 'vitest';
import { bakeWorld, type WorldBake } from '../src/render/bakeWorld';
import { generateWorld } from '../src/sim/world/generateWorld';
import type { World } from '../src/sim/world/types';

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

/**
 * Эталонные хэши мира и текстур для сида "1". Ловят любое изменение результата генерации или
 * запекания — в том числе от «чистых» оптимизаций. Если результат меняется намеренно (новая
 * механика, правка палитры), эти значения обновляются вручную в том же коммите, с пояснением.
 */
const GOLDEN = {
  height: '9f842423',
  biome: 'f90fce94',
  provinceOf: '73a46d57',
  provinceRG: 'f52e8e7b',
  terrain: '698d898a',
  border: '71e81ee6',
  bakeHeight: '8c184fb8',
  surface: 'a378f8da',
  biomeColor: 'af7d1df9',
};

describe('эталонные хэши (сид "1")', () => {
  let world: World;
  let bake: WorldBake;
  beforeAll(() => {
    world = generateWorld('1');
    bake = bakeWorld(world);
  }, 60000);

  it('мир и текстуры побитно совпадают с эталоном', () => {
    expect({
      height: fnv1a(world.height),
      biome: fnv1a(world.biome),
      provinceOf: fnv1a(world.provinceOf),
      provinceRG: fnv1a(bake.provinceRG),
      terrain: fnv1a(bake.terrain),
      border: fnv1a(bake.border),
      bakeHeight: fnv1a(bake.height),
      surface: fnv1a(bake.surface),
      biomeColor: fnv1a(bake.biomeColor),
    }).toEqual(GOLDEN);
  });
});
