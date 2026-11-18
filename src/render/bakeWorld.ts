// Подготовка данных всех текстур мира без pixi.js: выполняется в воркерах генерации,
// чтобы главный поток только загружал готовые массивы на GPU.
import { SEA_LEVEL, type World } from '../sim/world/types';
import { bakeTextures } from './bake';
import { bakeBiomeColors } from './biomeColors';
import { toHalf, toHalfArray } from './halfFloat';
import { COAST_SIGMA, bakeGradient, blur, coastNearness } from './normals';

/** Текстуры, которые зависят только от высоты и биомов (готовы сразу после этапа берегов). */
export interface SurfaceBake {
  /** R16F: высота − SEA_LEVEL. */
  height: Uint16Array;
  /** RGBA16F: градиент, береговая высота, близость берега. */
  surface: Uint16Array;
  biomeColor: Uint8Array;
}

/** Готовые пиксели текстур мира (раскладка каналов — см. WorldTextures в textures.ts). */
export interface WorldBake extends SurfaceBake {
  provinceRG: Uint8Array;
  terrain: Uint8Array;
  border: Uint8Array;
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

export function bakeSurface(height: Float32Array, biome: Uint8Array, w: number, h: number): SurfaceBake {
  return {
    height: toHalfArray(height, SEA_LEVEL),
    surface: packSurface(height, w, h),
    biomeColor: bakeBiomeColors(biome, w, h),
  };
}

export function bakeWorld(world: World, surface?: SurfaceBake): WorldBake {
  const { w, h } = world;
  const baked = bakeTextures(world);
  return {
    provinceRG: baked.provinceRG,
    terrain: baked.terrain,
    border: baked.border,
    ...(surface ?? bakeSurface(world.height, world.biome, w, h)),
  };
}

/** Буферы запечённых текстур, каждый один раз. */
export function bakeTransferables(bake: Partial<WorldBake>): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const v of Object.values(bake) as ArrayBufferView[]) {
    if (v.buffer instanceof ArrayBuffer) seen.add(v.buffer);
  }
  return [...seen];
}
