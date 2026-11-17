import { BufferImageSource, ImageSource, type TextureSource } from 'pixi.js';
import { BIOMES, SEA_LEVEL, type World } from '../sim/world/types';
import { ATLAS_URL, TERRAIN_TEXTURES } from './assets';
import { bakeTextures } from './bake';
import { toHalfArray } from './halfFloat';
import { bakeBiomeColors } from './biomeColors';
import { COAST_SIGMA, bakeGradient, blur, coastNearness } from './normals';
import { PALETTE } from './palette';

/** GPU-текстуры одного мира. Все без мипмапов: читаются texelFetch или билинейно на нулевом уровне. */
export interface WorldTextures {
  /** RGBA8: R,G — id провинции, B — суша. Только texelFetch. */
  province: TextureSource;
  /** RGBA8 LINEAR: G — код биома (texelFetch), B — влажность (билинейно). */
  terrain: TextureSource;
  /** RGBA8: R — расстояние до границы ×32. Только texelFetch (своя знаковая интерполяция). */
  border: TextureSource;
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
}

/** Альфа палитры: слот детали, а у водных биомов — этот маркер. */
export const WATER_SLOT = 255;
export const PALETTE_SIZE = 16;

function rgba8(data: Uint8Array, width: number, height: number, linear: boolean): BufferImageSource {
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

export function createWorldTextures(world: World): WorldTextures {
  const { w, h } = world;
  const baked = bakeTextures(world);
  return {
    province: rgba8(baked.provinceRG, w, h, false),
    terrain: rgba8(baked.terrain, w, h, true),
    border: rgba8(baked.border, w, h, false),
    height: new BufferImageSource({
      resource: toHalfArray(world.height, SEA_LEVEL),
      width: w,
      height: h,
      format: 'r16float',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
      autoGenerateMipmaps: false,
    }),
    biomeColor: rgba8(bakeBiomeColors(world.biome, w, h), w, h, true),
    surface: new BufferImageSource({
      resource: toHalfArray(packSurface(world.height, w, h)),
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

function packSurface(height: Float32Array, w: number, h: number): Float32Array {
  const grad = bakeGradient(height, w, h);
  const coast = blur(height, w, h, COAST_SIGMA);
  const near = coastNearness(height, w, h, SEA_LEVEL);
  const out = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = grad[i * 2] as number;
    out[i * 4 + 1] = grad[i * 2 + 1] as number;
    out[i * 4 + 2] = (coast[i] as number) - SEA_LEVEL;
    out[i * 4 + 3] = near[i] as number;
  }
  return out;
}

export function destroyWorldTextures(t: WorldTextures): void {
  t.province.destroy();
  t.terrain.destroy();
  t.border.destroy();
  t.height.destroy();
  t.surface.destroy();
  t.biomeColor.destroy();
}

/** 16×1 RGBA8: RGB — цвет биома по коду, A — слот детали атласа (у воды WATER_SLOT). */
export function createPaletteTexture(): BufferImageSource {
  const data = new Uint8Array(PALETTE_SIZE * 4);
  BIOMES.forEach((biome, code) => {
    const [r, g, b] = PALETTE[biome];
    const o = code * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = biome === 'ocean' || biome === 'coast' ? WATER_SLOT : TERRAIN_TEXTURES[biome];
  });
  return rgba8(data, PALETTE_SIZE, 1, false);
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
