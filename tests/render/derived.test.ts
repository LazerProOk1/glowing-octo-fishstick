import { beforeAll, describe, expect, it } from 'vitest';
import { buildDerived, updateDerivedRect, type DerivedWorld } from '../../src/render/derived';
import { BIOME_SIGMA } from '../../src/render/biomeColors';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { World } from '../../src/sim/world/types';

/** Небольшой мир: полное запекание быстрое. */
function smallWorld(): World {
  const p = defaultParams('производные');
  return generateWorld({ ...p, options: { ...p.options, size: 'small' } });
}

/** Копия мира с отдельными массивами биомов (остальное общее — не меняется). */
function withBiome(world: World, biome: Uint8Array): World {
  return { ...world, biome };
}

function bytes(v: ArrayBufferView): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

const BLUR_R = Math.ceil(3 * BIOME_SIGMA);

describe('производные данные: пересчёт прямоугольника', () => {
  let world: World;
  let base: DerivedWorld;
  beforeAll(() => {
    world = smallWorld();
    base = buildDerived(world);
  }, 60000);

  /** Перекрашивает клетки прямоугольника в другой биом суши (по коду) и сравнивает с полным пересчётом. */
  const check = (rect: { x: number; y: number; w: number; h: number }, code: number): void => {
    const biome = world.biome.slice();
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) biome[y * world.w + x] = code;
    }
    const edited = withBiome(world, biome);
    const partial: DerivedWorld = {
      ...base,
      biomeColor: base.biomeColor.slice(),
      terrain: base.terrain.slice(),
      height: base.height.slice(),
      provinceSeaRG: base.provinceSeaRG.slice(),
    };
    const written = updateDerivedRect(edited, partial, rect);
    const full = buildDerived(edited);
    for (const k of Object.keys(full) as Array<keyof DerivedWorld>) {
      expect(bytes(partial[k]).equals(bytes(full[k])), k).toBe(true);
    }
    // Записанная область — прямоугольник с запасом на радиус размытия, обрезанный краями карты.
    const x0 = Math.max(0, rect.x - BLUR_R);
    const y0 = Math.max(0, rect.y - BLUR_R);
    const x1 = Math.min(world.w, rect.x + rect.w + BLUR_R);
    const y1 = Math.min(world.h, rect.y + rect.h + BLUR_R);
    expect(written).toEqual({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  };

  const landCode = (id: string): number => world.biomes.findIndex((d) => d.id === id);

  it('биом в середине карты сменился — те же байты, что при полном пересчёте', () => {
    // Центр самой крупной провинции суши: там точно суша.
    const p = world.provinces.filter((q) => q.isLand).sort((a, b) => b.cellCount - a.cellCount)[0]!;
    check({ x: p.center.x - 3, y: p.center.y - 2, w: 7, h: 5 }, landCode('desert'));
  });

  it('прямоугольник у края карты (обрезка размытия) — те же байты', () => {
    check({ x: 0, y: 0, w: 6, h: 4 }, landCode('plains'));
    check({ x: world.w - 5, y: world.h - 3, w: 5, h: 3 }, landCode('forest'));
  });

  it('прямоугольник, выходящий за карту, обрезается', () => {
    const d: DerivedWorld = { ...base, biomeColor: base.biomeColor.slice(), terrain: base.terrain.slice(), height: base.height.slice() };
    expect(updateDerivedRect(world, d, { x: -10, y: -10, w: 5, h: 5 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(bytes(d.biomeColor).equals(bytes(base.biomeColor))).toBe(true);
  });
});
