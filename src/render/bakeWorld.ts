// Preparation of all world texture data without pixi.js: runs in the generation workers,
// so the main thread only uploads the finished arrays to the GPU.
import type { BiomeDef } from '../content/biomes/types';
import { SEA_LEVEL } from '../content/terrainLevels';
import type { World } from '../sim/world/types';
import { bakeTextures, provinceIdPixels, writeWaterClass, type BakedTextures } from './bake';
import { bakeBiomeColors } from './biomeColors';
import { toHalf, toHalfArray } from './halfFloat';
import { blur } from '../sim/geom/blur';
import { COAST_SIGMA, bakeGradient, coastNearness } from './normals';
import { smoothSeaDepth } from './seaDepth';

/** Textures that depend only on height and biomes (ready right after the shores stage). */
export interface SurfaceBake {
  /** R16F: height − SEA_LEVEL. */
  height: Uint16Array;
  /** RGBA16F: gradient, shore height, shore proximity. */
  surface: Uint16Array;
  biomeColor: Uint8Array;
  /** R16F, seaDepthSize grid: large-scale depth of the real bottom for the water colour (smoothSeaDepth). */
  seaDepth: Uint16Array;
}

/** Finished world texture pixels (channel layout — see WorldTextures in textures.ts). */
export interface WorldBake extends SurfaceBake {
  /** Display id where the screen shows land (displayProvinceOf). */
  provinceRG: Uint8Array;
  /** Display id where the screen shows water (displaySeaProvinceOf). */
  provinceSeaRG: Uint8Array;
  terrain: Uint8Array;
}

/**
 * Slightly blurred height − SEA_LEVEL: the shader's shoreline field (surface channel B).
 * The screen shows land where its bilinear interpolation is above zero.
 */
export function coastHeight(height: Float32Array, w: number, h: number): Float32Array {
  const coast = blur(height, w, h, COAST_SIGMA);
  for (let i = 0; i < coast.length; i++) coast[i] = (coast[i] as number) - SEA_LEVEL;
  return coast;
}

/** RGBA16F straight in half precision, without an intermediate float32 array of 8M values. */
function packSurface(height: Float32Array, coast: Float32Array, w: number, h: number): Uint16Array {
  const grad = bakeGradient(height, w, h);
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
 * Owner of a cell for display: like provinceOf, but water cells that may be visible as land
 * (the cell itself or one of its 8 neighbours has coast > 0) are given to the nearest land province
 * (breadth-first walk from land over 8 neighbours, ties — the lower id). Thus highlighting,
 * fill and province picking reach the smooth shoreline. Simulation data is unchanged.
 */
export function displayProvinceOf(
  world: Pick<World, 'w' | 'h' | 'provinces' | 'provinceOf'>,
  coast: Float32Array,
): Uint16Array {
  return spreadAcrossCoast(world, coast, true);
}

/**
 * Water mirror of displayProvinceOf: land cells that may be visible as water (the cell itself or
 * one of its 8 neighbours has coast < 0) are given to the nearest sea or lake province. With this
 * map the shader draws highlights, fill and borders where the screen shows water, and MapView picks
 * the province under the cursor. Water cells keep their own province.
 */
export function displaySeaProvinceOf(
  world: Pick<World, 'w' | 'h' | 'provinces' | 'provinceOf'>,
  coast: Float32Array,
): Uint16Array {
  return spreadAcrossCoast(world, coast, false);
}

/**
 * Common part of both display maps. toLand: water cells near visible land get land; otherwise land
 * cells near visible water get water. Breadth-first walk over 8 neighbours, ties — the lower id.
 */
function spreadAcrossCoast(
  world: Pick<World, 'w' | 'h' | 'provinces' | 'provinceOf'>,
  coast: Float32Array,
  toLand: boolean,
): Uint16Array {
  const { w, h, provinces, provinceOf } = world;
  const n = w * h;
  const out = provinceOf.slice();
  // 1 — province of the bank side the strip is given to.
  const sourceOf = new Uint8Array(provinces.length);
  provinces.forEach((p, id) => (sourceOf[id] = p.isLand === toLand ? 1 : 0));
  // The sign of coast at which a cell may be visible as the source side.
  const sign = toLand ? 1 : -1;
  // 0 — untouched, 1 — strip without an owner yet, 2 — owner found on this layer.
  const state = new Uint8Array(n);
  // The walk starts only from source cells that have a strip cell among their 8 neighbours: the rest
  // hand out nothing, so the result is the same, and the walk does not touch all the land (water).
  const seeded = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (sourceOf[provinceOf[i] as number]) continue;
    const x = i % w;
    const y = (i - x) / w;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w && sign * (coast[ny * w + nx] as number) > 0) {
          near = true;
          break;
        }
      }
    }
    if (!near) continue;
    state[i] = 1;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (sourceOf[provinceOf[j] as number]) seeded[j] = 1;
      }
    }
  }
  // A strip cell whose 8-connected strip component touches no source cell is never reached and keeps
  // its own province: there is no source province near it to give. Generated worlds have shown none
  // (checked on several seeds); the behaviour is pinned in tests/render/coast.test.ts.
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) if (seeded[i]) frontier.push(i);
  // Layer-by-layer walk: on layer d a cell's owner is the lowest id among the neighbours on layer d − 1.
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

/** Province textures by display owners: the land map and the water map (see displayProvinceOf). */
export interface ProvinceBake extends BakedTextures {
  /**
   * RGBA8 in provinceRG layout over displaySeaProvinceOf: the id map where the screen shows water.
   * Alpha — water kind by the cell's own biome (SEA_MAP_ALPHA: land, sea, lake) for the lake colour.
   */
  provinceSeaRG: Uint8Array;
}

/** coast — coastHeight of the world (passed when the nested worker has already computed it). */
export function bakeProvinces(world: World, coast = coastHeight(world.height, world.w, world.h)): ProvinceBake {
  const baked = bakeTextures(world, displayProvinceOf(world, coast));
  const provinceSeaRG = provinceIdPixels(displaySeaProvinceOf(world, coast), world.provinces);
  writeWaterClass(provinceSeaRG, world.biome, world.biomes);
  return { ...baked, provinceSeaRG };
}

export function bakeSurface(
  height: Float32Array,
  biome: Uint8Array,
  defs: readonly BiomeDef[],
  w: number,
  h: number,
  coast = coastHeight(height, w, h),
): SurfaceBake {
  return {
    height: toHalfArray(height, SEA_LEVEL),
    surface: packSurface(height, coast, w, h),
    biomeColor: bakeBiomeColors(biome, defs, w, h),
    seaDepth: toHalfArray(smoothSeaDepth(height, w, h), 0),
  };
}

export function bakeWorld(world: World, surface?: SurfaceBake): WorldBake {
  const { w, h } = world;
  const baked = bakeProvinces(world);
  return {
    provinceRG: baked.provinceRG,
    provinceSeaRG: baked.provinceSeaRG,
    terrain: baked.terrain,
    ...(surface ?? bakeSurface(world.height, world.biome, world.biomes, w, h)),
  };
}

/** Typed array buffers, each exactly once (a repeat in the transfer list is an error). */
export function uniqueBuffers(views: Iterable<ArrayBufferView>): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const v of views) {
    if (v.buffer instanceof ArrayBuffer) seen.add(v.buffer);
  }
  return [...seen];
}

/** Buffers of the baked textures, each exactly once. */
export function bakeTransferables(bake: Partial<WorldBake>): ArrayBuffer[] {
  return uniqueBuffers(Object.values(bake) as ArrayBufferView[]);
}
