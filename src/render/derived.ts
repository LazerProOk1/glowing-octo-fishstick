// Derived world data (spec §7.4): everything built from the source data (height, biomes,
// rivers, provinces) for rendering only. It is built by one function and can be recomputed
// for a rectangle — groundwork for the map editor. Uploading the changed part of the textures to
// the GPU is MapView's job (over the rectangle returned by updateDerivedRect).
import { SEA_LEVEL } from '../content/terrainLevels';
import type { World } from '../sim/world/types';
import { waterClassTable, writeTerrainCell, writeWaterClassCell } from './bake';
import { bakeWorld, type WorldBake } from './bakeWorld';
import { bakeBiomeColorsRect, biomeBlurRadius, type Rect } from './biomeColors';
import { toHalf } from './halfFloat';

export type { Rect } from './biomeColors';

/**
 * Derived data: pixels of all world textures (channel layout — WorldTextures in textures.ts):
 * biome colours, terrain, surface (gradient, shore fields), sea depth, owner maps of the
 * provinces for land and for water.
 */
export type DerivedWorld = WorldBake;

/** All derived world data built from scratch. */
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
 * Recomputes derived data after cell edits (biome, moisture, rivers) in `rect`:
 * terrain, height and the alpha of provinceSeaRG (water kind by biome) — inside the rectangle itself,
 * biome colours — with a margin of the blur radius. The result is bit-identical to buildDerived of the
 * same world as long as height and provinces are unchanged. Returns the area actually written (the
 * rectangle expanded by the blur radius and clipped to the map edges) — that is what goes to the GPU.
 *
 * Not recomputed per area (a full rebuild, buildDerived, is needed): the surface (gradient and
 * shore fields) and the sea depth seaDepth — when height is edited; the owner maps provinceRG and
 * provinceSeaRG (ids, except the alpha of provinceSeaRG) — when provinces or the shoreline are edited.
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
