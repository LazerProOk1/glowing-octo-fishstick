import { BufferImageSource, ImageSource, type TextureSource } from 'pixi.js';
import { MAX_BIOMES, type BiomeDef } from '../content/biomes/types';
import { hasTag } from '../content/registry';
import type { World } from '../sim/world/types';
import { ATLAS_URL, DETAIL_SLOT_OF } from './assets';
import { bakeWorld, type WorldBake } from './bakeWorld';
import { seaDepthSize } from './seaDepth';

/** GPU-текстуры одного мира. Все без мипмапов: читаются texelFetch или билинейно на нулевом уровне. */
export interface WorldTextures {
  /** RGBA8: R,G — id провинции, B — суша; владельцы там, где на экране суша. Только texelFetch. */
  province: TextureSource;
  /**
   * RGBA8, та же раскладка: владельцы там, где на экране вода (provinceSeaRG); A — вид воды по биому
   * клетки (SEA_MAP_ALPHA в bake.ts: суша, море, озеро). Только texelFetch.
   */
  provinceSea: TextureSource;
  /** RGBA8 LINEAR: G — код биома (texelFetch), B — влажность (билинейно). */
  terrain: TextureSource;
  /** R16F LINEAR: высота − SEA_LEVEL (половинная точность у нуля ~1e-6, у гор ~1e-4). */
  height: TextureSource;
  /**
   * RGBA16F LINEAR: RG — сглаженный градиент высоты (dh/dx, dh/dy на клетку) для отмывки,
   * B — слегка размытая высота − SEA_LEVEL для береговой линии,
   * A — размытая доля суши (σ 3.5) для полосы мелководья.
   */
  surface: TextureSource;
  /** RGBA8 LINEAR: размытый цвет биомов (RGB) и покрытие сушей (A), см. bakeBiomeColors. */
  biomeColor: TextureSource;
  /** R16F LINEAR, в SEA_DEPTH_STEP раз меньше карты по каждой оси: крупномасштабная глубина дна (seaDepth.ts). */
  seaDepth: TextureSource;
  /** Палитра биомов этого мира, см. createPaletteTexture. */
  palette: TextureSource;
}

/** Альфа палитры: слот детали, а у водных биомов — этот маркер (море). */
export const WATER_SLOT = 255;
/**
 * Маркер озёрной воды (биом с тегом lake). Всё, что ≥ LAKE_SLOT, — вода без детали; по нему шейдер
 * отличает озеро от моря.
 */
export const LAKE_SLOT = 254;
export const PALETTE_SIZE = MAX_BIOMES;

/** RGBA8-источник из массива пикселей (альфа — данные, без премультипликации, без мипмапов). */
export function rgba8(data: Uint8Array, width: number, height: number, linear: boolean): BufferImageSource {
  return new BufferImageSource({
    resource: data,
    width,
    height,
    format: 'rgba8unorm',
    scaleMode: linear ? 'linear' : 'nearest',
    addressMode: 'clamp-to-edge',
    // Альфа здесь — данные (ширина реки), а не прозрачность: без премультипликации.
    alphaMode: 'no-premultiply-alpha',
    autoGenerateMipmaps: false,
  });
}

/** R16F-источник, билинейный, без мипмапов. */
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

/** bake — данные, запечённые заранее (в воркере); без него печём здесь, в главном потоке. */
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

/** Пиксели палитры: по коду биома RGB — цвет, A — слот детали атласа (у моря WATER_SLOT, у озёр LAKE_SLOT). */
export function paletteData(biomes: readonly BiomeDef[]): Uint8Array {
  const data = new Uint8Array(PALETTE_SIZE * 4);
  biomes.forEach((def, code) => {
    const o = code * 4;
    data[o] = def.color[0];
    data[o + 1] = def.color[1];
    data[o + 2] = def.color[2];
    data[o + 3] = hasTag(def, 'lake') ? LAKE_SLOT : def.kind === 'water' ? WATER_SLOT : DETAIL_SLOT_OF[def.detail];
  });
  return data;
}

/** PALETTE_SIZE×1 RGBA8 — палитра биомов мира (см. paletteData). */
export function createPaletteTexture(biomes: readonly BiomeDef[]): BufferImageSource {
  return rgba8(paletteData(biomes), PALETTE_SIZE, 1, false);
}

/** Нейтральная заглушка атласа (яркость 0.5 = «без детали»), пока PNG грузится. */
export function createAtlasPlaceholder(): BufferImageSource {
  return rgba8(new Uint8Array([128, 128, 128, 255]), 1, 1, true);
}

/**
 * Атлас деталей с мипмапами. Уровень выбирается в шейдере вручную (textureLod) и ограничен 5:
 * тайлы по 512 выровнены по 2^9, поэтому уровни 0..5 не смешивают соседние тайлы, а отступ
 * в полтекселя текущего уровня исключает подмешивание при билинейной выборке.
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
