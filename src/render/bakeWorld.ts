// Подготовка данных всех текстур мира без pixi.js: выполняется в воркерах генерации,
// чтобы главный поток только загружал готовые массивы на GPU.
import type { BiomeDef } from '../content/biomes/types';
import { SEA_LEVEL } from '../content/terrainLevels';
import type { Province, World } from '../sim/world/types';
import { borderDistance } from '../sim/geom/edt';
import { bakeTextures, type BakedTextures } from './bake';
import { bakeBiomeColors } from './biomeColors';
import { toHalf, toHalfArray } from './halfFloat';
import { blur } from '../sim/geom/blur';
import { COAST_SIGMA, bakeGradient, coastNearness } from './normals';

/** Текстуры, которые зависят только от высоты и биомов (готовы сразу после этапа берегов). */
export interface SurfaceBake {
  /** R16F: высота − SEA_LEVEL. */
  height: Uint16Array;
  /** RGBA16F: градиент, береговая высота, близость берега. */
  surface: Uint16Array;
  biomeColor: Uint8Array;
}

/** Готовые пиксели текстур мира (раскладка каналов — см. WorldTextures в textures.ts). */
export interface WorldBake extends SurfaceBake, ProvinceBake {}

/** Текстуры, которые зависят от провинций (печём после всей генерации). */
export interface ProvinceBake extends BakedTextures {
  /** R16F: знаковое расстояние до берега в клетках (+ суша, − вода), см. coastSignedDistance. */
  coastSd: Uint16Array;
}

/**
 * Знаковое расстояние (в клетках) от центра клетки до границы «суша/вода» по клеткам провинций:
 * больше 0 на суше, меньше 0 на воде. Береговая линия в шейдере — его нулевая линия, поэтому
 * берег совпадает с клеточной границей сухопутных провинций (подсветка и заливка без лесенки).
 */
export function coastSignedDistance(
  provinces: readonly Pick<Province, 'isLand'>[],
  provinceOf: Uint16Array,
  w: number,
  h: number,
): Float32Array {
  const landOf = new Uint8Array(provinces.length);
  provinces.forEach((p, id) => (landOf[id] = p.isLand ? 1 : 0));
  const n = w * h;
  const mask = new Uint16Array(n);
  for (let i = 0; i < n; i++) mask[i] = landOf[provinceOf[i] as number] as number;
  const d = borderDistance(mask, w, h);
  for (let i = 0; i < n; i++) if (mask[i] === 0) d[i] = -(d[i] as number);
  return d;
}

/** Текстуры провинций и берега. */
export function bakeProvinces(world: World): ProvinceBake {
  const { w, h } = world;
  return {
    ...bakeTextures(world),
    coastSd: toHalfArray(coastSignedDistance(world.provinces, world.provinceOf, w, h)),
  };
}

/** RGBA16F сразу в половинной точности, без промежуточного float32-массива на 8 млн значений. */
function packSurface(height: Float32Array, w: number, h: number): Uint16Array {
  const grad = bakeGradient(height, w, h);
  const coast = blur(height, w, h, COAST_SIGMA);
  const near = coastNearness(height, w, h, SEA_LEVEL);
  const out = new Uint16Array(w * h * 4);
  const f = new Float32Array(1); // то же округление до float32, что и при записи в Float32Array
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    out[o] = toHalf(grad[i * 2] as number);
    out[o + 1] = toHalf(grad[i * 2 + 1] as number);
    f[0] = (coast[i] as number) - SEA_LEVEL;
    out[o + 2] = toHalf(f[0] as number);
    out[o + 3] = toHalf(near[i] as number);
  }
  return out;
}

export function bakeSurface(
  height: Float32Array,
  biome: Uint8Array,
  defs: readonly BiomeDef[],
  w: number,
  h: number,
): SurfaceBake {
  return {
    height: toHalfArray(height, SEA_LEVEL),
    surface: packSurface(height, w, h),
    biomeColor: bakeBiomeColors(biome, defs, w, h),
  };
}

export function bakeWorld(world: World, surface?: SurfaceBake): WorldBake {
  const { w, h } = world;
  return {
    ...bakeProvinces(world),
    ...(surface ?? bakeSurface(world.height, world.biome, world.biomes, w, h)),
  };
}

/** Буферы типизированных массивов, каждый один раз (повтор в списке передачи — ошибка). */
export function uniqueBuffers(views: Iterable<ArrayBufferView>): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const v of views) {
    if (v.buffer instanceof ArrayBuffer) seen.add(v.buffer);
  }
  return [...seen];
}

/** Буферы запечённых текстур, каждый один раз. */
export function bakeTransferables(bake: Partial<WorldBake>): ArrayBuffer[] {
  return uniqueBuffers(Object.values(bake) as ArrayBufferView[]);
}
