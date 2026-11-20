import { BufferImageSource, ImageSource, type TextureSource } from 'pixi.js';
import { MAX_BIOMES, type BiomeDef } from '../content/biomes/types';
import { waterKind } from '../content/registry';
import type { World } from '../sim/world/types';
import { ATLAS_URL, DETAIL_SLOT_OF } from './assets';
import { bakeWorld, type WorldBake } from './bakeWorld';
import { seaDepthSize } from './seaDepth';

/** GPU textures of one world. All without mipmaps: read by texelFetch or bilinearly at level 0. */
export interface WorldTextures {
  /** RGBA8: R,G — province id, B — land; owners where the screen shows land. texelFetch only. */
  province: TextureSource;
  /**
   * RGBA8, same layout: owners where the screen shows water (provinceSeaRG); A — water kind by the
   * cell biome (SEA_MAP_ALPHA in bake.ts: land, sea, lake). texelFetch only.
   */
  provinceSea: TextureSource;
  /** RGBA8 LINEAR: G — biome code (texelFetch), B — moisture (bilinear). */
  terrain: TextureSource;
  /** R16F LINEAR: height − SEA_LEVEL (half precision ~1e-6 near zero, ~1e-4 at mountains). */
  height: TextureSource;
  /**
   * RGBA16F LINEAR: RG — smoothed height gradient (dh/dx, dh/dy per cell) for shading,
   * B — slightly blurred height − SEA_LEVEL for the shoreline,
   * A — blurred land fraction (σ 3.5) for the shallow-water band.
   */
  surface: TextureSource;
  /** RGBA8 LINEAR: blurred biome colour (RGB) and land coverage (A), see bakeBiomeColors. */
  biomeColor: TextureSource;
  /** R16F LINEAR, SEA_DEPTH_STEP times smaller than the map on each axis: large-scale bottom depth (seaDepth.ts). */
  seaDepth: TextureSource;
  /** Biome palette of this world, see createPaletteTexture. */
  palette: TextureSource;
}

/** Palette alpha: the detail slot, and for water biomes this marker (sea). */
export const WATER_SLOT = 255;
/**
 * Lake water marker (a biome tagged lake). Everything ≥ LAKE_SLOT is water without a detail slot; the
 * shader tells a lake from the sea by it.
 */
export const LAKE_SLOT = 254;
export const PALETTE_SIZE = MAX_BIOMES;

/** RGBA8 source from a pixel array (alpha is data, no premultiplication, no mipmaps). */
export function rgba8(data: Uint8Array, width: number, height: number, linear: boolean): BufferImageSource {
  return new BufferImageSource({
    resource: data,
    width,
    height,
    format: 'rgba8unorm',
    scaleMode: linear ? 'linear' : 'nearest',
    addressMode: 'clamp-to-edge',
    // Alpha here is data (river width), not opacity: no premultiplication.
    alphaMode: 'no-premultiply-alpha',
    autoGenerateMipmaps: false,
  });
}

/** R16F source, bilinear, no mipmaps. */
function r16f(data: Uint16Array, width: number, height: number): BufferImageSource {
  return new BufferImageSource({
    resource: data,
    width,
    height,
    format: 'r16float',
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
    alphaMode: 'no-premultiply-alpha',
    autoGenerateMipmaps: false,
  });
}

/** bake — data baked in advance (in the worker); without it we bake here, on the main thread. */
export function createWorldTextures(world: World, bake: WorldBake = bakeWorld(world)): WorldTextures {
  const { w, h } = world;
  return {
    province: rgba8(bake.provinceRG, w, h, false),
    provinceSea: rgba8(bake.provinceSeaRG, w, h, false),
    terrain: rgba8(bake.terrain, w, h, true),
    height: r16f(bake.height, w, h),
    seaDepth: r16f(bake.seaDepth, seaDepthSize(w, h).w, seaDepthSize(w, h).h),
    biomeColor: rgba8(bake.biomeColor, w, h, true),
    palette: createPaletteTexture(world.biomes),
    surface: new BufferImageSource({
      resource: bake.surface,
      width: w,
      height: h,
      format: 'rgba16float',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
      autoGenerateMipmaps: false,
    }),
  };
}

export function destroyWorldTextures(t: WorldTextures): void {
  t.province.destroy();
  t.provinceSea.destroy();
  t.terrain.destroy();
  t.height.destroy();
  t.surface.destroy();
  t.biomeColor.destroy();
  t.seaDepth.destroy();
  t.palette.destroy();
}

/** Palette pixels: by biome code RGB is the colour, A the detail atlas slot (WATER_SLOT for sea, LAKE_SLOT for lakes). */
export function paletteData(biomes: readonly BiomeDef[]): Uint8Array {
  const data = new Uint8Array(PALETTE_SIZE * 4);
  biomes.forEach((def, code) => {
    const o = code * 4;
    data[o] = def.color[0];
    data[o + 1] = def.color[1];
    data[o + 2] = def.color[2];
    const k = waterKind(def);
    data[o + 3] = k === 'lake' ? LAKE_SLOT : k === 'sea' ? WATER_SLOT : DETAIL_SLOT_OF[def.detail];
  });
  return data;
}

/** PALETTE_SIZE×1 RGBA8 — the biome palette of the world (see paletteData). */
export function createPaletteTexture(biomes: readonly BiomeDef[]): BufferImageSource {
  return rgba8(paletteData(biomes), PALETTE_SIZE, 1, false);
}

/** Neutral atlas placeholder (luminance 0.5 = "no detail") while the PNG loads. */
export function createAtlasPlaceholder(): BufferImageSource {
  return rgba8(new Uint8Array([128, 128, 128, 255]), 1, 1, true);
}

/**
 * Detail atlas with mipmaps. The level is chosen manually in the shader (textureLod) and capped at 5:
 * the 512-pixel tiles are aligned to 2^9, so levels 0..5 do not mix neighbouring tiles, and the
 * half-texel inset of the current level prevents bleeding in bilinear sampling.
 */
export async function loadAtlas(): Promise<ImageSource> {
  const img = new Image();
  img.src = ATLAS_URL;
  await img.decode();
  return new ImageSource({
    resource: img,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
    mipmapFilter: 'linear',
    addressMode: 'clamp-to-edge',
    alphaMode: 'no-premultiply-alpha',
  });
}
