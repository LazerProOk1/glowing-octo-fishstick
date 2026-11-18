// Подготовка данных всех текстур мира без pixi.js: выполняется в воркерах генерации,
// чтобы главный поток только загружал готовые массивы на GPU.
import type { BiomeDef } from '../content/biomes/types';
import { SEA_LEVEL } from '../content/terrainLevels';
import type { World } from '../sim/world/types';
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
export interface WorldBake extends SurfaceBake {
  provinceRG: Uint8Array;
  terrain: Uint8Array;
  border: Uint8Array;
}

/**
 * Слегка размытая высота − SEA_LEVEL: поле береговой линии шейдера (канал B surface).
 * Суша на экране там, где его билинейная интерполяция больше нуля.
 */
export function coastHeight(height: Float32Array, w: number, h: number): Float32Array {
  const coast = blur(height, w, h, COAST_SIGMA);
  for (let i = 0; i < coast.length; i++) coast[i] = (coast[i] as number) - SEA_LEVEL;
  return coast;
}

/** RGBA16F сразу в половинной точности, без промежуточного float32-массива на 8 млн значений. */
function packSurface(height: Float32Array, w: number, h: number): Uint16Array {
  const grad = bakeGradient(height, w, h);
  const coast = coastHeight(height, w, h);
  const near = coastNearness(height, w, h, SEA_LEVEL);
  const out = new Uint16Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    out[o] = toHalf(grad[i * 2] as number);
    out[o + 1] = toHalf(grad[i * 2 + 1] as number);
    out[o + 2] = toHalf(coast[i] as number);
    out[o + 3] = toHalf(near[i] as number);
  }
  return out;
}

/**
 * Владелец клетки для показа: как provinceOf, но клетки воды, которые могут быть видны сушей
 * (у самой клетки или у одного из 8 соседей coast > 0), отдаются ближайшей сухопутной провинции
 * (обход в ширину от суши по 8 соседям, при равном расстоянии — меньший id). Так подсветка,
 * заливка и выбор провинции доходят до гладкого берега. Данные симуляции не меняются.
 */
export function displayProvinceOf(
  world: Pick<World, 'w' | 'h' | 'provinces' | 'provinceOf'>,
  coast: Float32Array,
): Uint16Array {
  const { w, h, provinces, provinceOf } = world;
  const n = w * h;
  const out = provinceOf.slice();
  const landOf = new Uint8Array(provinces.length);
  provinces.forEach((p, id) => (landOf[id] = p.isLand ? 1 : 0));
  // 0 — не трогаем, 1 — полоса воды, ещё без владельца, 2 — владелец найден на этом слое.
  const state = new Uint8Array(n);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (landOf[provinceOf[i] as number]) {
      frontier.push(i);
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w && (coast[ny * w + nx] as number) > 0) {
          near = true;
          break;
        }
      }
    }
    if (near) state[i] = 1;
  }
  // Послойный обход: на слое d владелец клетки — наименьший id среди соседей слоя d − 1.
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      const id = out[i] as number;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const j = ny * w + nx;
          const s = state[j] as number;
          if (s === 1) {
            state[j] = 2;
            out[j] = id;
            next.push(j);
          } else if (s === 2 && id < (out[j] as number)) {
            out[j] = id;
          }
        }
      }
    }
    for (const j of next) state[j] = 3;
    frontier = next;
  }
  return out;
}

/** Текстуры провинций по владельцам для показа (см. displayProvinceOf). */
export function bakeProvinces(world: World): BakedTextures {
  const owner = displayProvinceOf(world, coastHeight(world.height, world.w, world.h));
  return bakeTextures(world, owner);
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
  const baked = bakeProvinces(world);
  return {
    provinceRG: baked.provinceRG,
    terrain: baked.terrain,
    border: baked.border,
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
