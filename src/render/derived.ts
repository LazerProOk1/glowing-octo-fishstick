// Производные данные мира (спец §7.4): всё, что строится из исходных данных (высота, биомы,
// реки, провинции) только для отрисовки. Строятся одной функцией и умеют пересчитываться
// для прямоугольной области — задел под редактор карты. Загрузка изменённой части текстур на
// GPU — забота MapView (по прямоугольнику, который возвращает updateDerivedRect).
import { SEA_LEVEL } from '../content/terrainLevels';
import type { World } from '../sim/world/types';
import { waterClassTable, writeTerrainCell, writeWaterClassCell } from './bake';
import { bakeWorld, type WorldBake } from './bakeWorld';
import { bakeBiomeColorsRect, biomeBlurRadius, type Rect } from './biomeColors';
import { toHalf } from './halfFloat';

export type { Rect } from './biomeColors';

/**
 * Производные данные: пиксели всех текстур мира (раскладка каналов — WorldTextures в textures.ts):
 * цвета биомов, рельеф, поверхность (градиент, береговые поля), глубина моря, карты владельцев
 * провинций для суши и для воды.
 */
export type DerivedWorld = WorldBake;

/** Все производные данные мира с нуля. */
export function buildDerived(world: World): DerivedWorld {
  return bakeWorld(world);
}

function clip(rect: Rect, w: number, h: number): Rect {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(w, Math.floor(rect.x + rect.w));
  const y1 = Math.min(h, Math.floor(rect.y + rect.h));
  if (x1 <= x0 || y1 <= y0) return { x: Math.min(x0, w), y: Math.min(y0, h), w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Пересчитывает производные данные после правки клеток (биома, влажности, рек) в `rect`:
 * terrain, height и канал A provinceSeaRG (вид воды по биому) — в самом прямоугольнике, цвета
 * биомов — с запасом на радиус размытия. Результат побитно равен buildDerived того же мира, пока
 * высота и провинции не менялись. Возвращает реально записанную область (прямоугольник,
 * расширенный на радиус размытия и обрезанный краями карты) — её и нужно загрузить на GPU.
 *
 * По области не пересчитываются (нужна полная пересборка, buildDerived): поверхность (градиент и
 * береговые поля) и глубина моря seaDepth — при правке высоты; карты владельцев provinceRG и
 * provinceSeaRG (id, кроме канала A provinceSeaRG) — при правке провинций или береговой линии.
 */
export function updateDerivedRect(world: World, derived: DerivedWorld, rect: Rect): Rect {
  const { w, h } = world;
  const r = clip(rect, w, h);
  if (r.w === 0 || r.h === 0) return r;
  const water = waterClassTable(world.biomes);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * w + x;
      writeTerrainCell(derived.terrain, world, i);
      writeWaterClassCell(derived.provinceSeaRG, world.biome, water, i);
      derived.height[i] = toHalf((world.height[i] as number) - SEA_LEVEL);
    }
  }
  const pad = biomeBlurRadius();
  const written = clip({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }, w, h);
  bakeBiomeColorsRect(world.biome, world.biomes, w, h, derived.biomeColor, written);
  return written;
}
