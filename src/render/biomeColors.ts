import type { BiomeDef } from '../content/biomes/types';
import { blurInterleaved } from '../sim/geom/blur';
import { MAP_COLORS, type RGB } from './palette';

/**
 * Blur of the biome colour field (cells). With a noise-warped bilinear lookup in the shader the
 * transitions are ~3 cells wide and organic; mountains and snow keep their shape at this scale.
 */
export const BIOME_SIGMA = 1.2;

/**
 * Soft biome colour texture: RGBA8 per cell, RGB = Gaussian-blurred land palette colour,
 * A = blurred land coverage (0..255). Normalised convolution: water cells carry no colour, so
 * land near the coast keeps its own biome colour instead of turning blue. Colours and the water flag
 * come from `defs` (the world's biome list, codes are indices in it).
 */
export function bakeBiomeColors(
  biome: Uint8Array,
  defs: readonly BiomeDef[],
  w: number,
  h: number,
  sigma = BIOME_SIGMA,
): Uint8Array {
  const n = w * h;
  // RGB и покрытие чередуются в одном массиве и размываются за один проход.
  const rgbc = new Float32Array(n * 4);
  const lut = colorLut(defs);
  for (let i = 0; i < n; i++) {
    const o = (biome[i] as number) * 4;
    if (lut[o + 3] === 0) continue;
    rgbc[i * 4] = lut[o] as number;
    rgbc[i * 4 + 1] = lut[o + 1] as number;
    rgbc[i * 4 + 2] = lut[o + 2] as number;
    rgbc[i * 4 + 3] = 1;
  }
  const blurred = blurInterleaved(rgbc, w, h, 4, sigma);
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) writeColor(out, i * 4, blurred, i * 4);
  return out;
}

/** Таблица по коду биома: цвет и признак суши (RGBA), без поиска по имени в цикле. */
function colorLut(defs: readonly BiomeDef[]): Float32Array {
  const lut = new Float32Array(256 * 4);
  for (let code = 0; code < 256; code++) {
    const def = defs[code];
    const col: RGB = def ? def.color : MAP_COLORS.beach;
    lut[code * 4] = col[0];
    lut[code * 4 + 1] = col[1];
    lut[code * 4 + 2] = col[2];
    lut[code * 4 + 3] = def?.kind === 'water' ? 0 : 1;
  }
  return lut;
}

/** Нормированная свёртка → RGBA8: цвет делится на покрытие; без суши рядом — цвет пляжа, A = 0. */
function writeColor(out: Uint8Array, o: number, blurred: Float32Array, b: number): void {
  const cov = blurred[b + 3] as number;
  if (cov < 1e-6) {
    const [fr, fg, fb] = MAP_COLORS.beach;
    out[o] = fr;
    out[o + 1] = fg;
    out[o + 2] = fb;
    out[o + 3] = 0;
    return;
  }
  out[o] = Math.round((blurred[b] as number) / cov);
  out[o + 1] = Math.round((blurred[b + 1] as number) / cov);
  out[o + 2] = Math.round((blurred[b + 2] as number) / cov);
  out[o + 3] = Math.round(Math.min(1, cov) * 255);
}

/** Прямоугольник в клетках карты. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Радиус размытия цветов биомов в клетках: столько клеток вокруг правки меняют цвет. */
export function biomeBlurRadius(sigma = BIOME_SIGMA): number {
  return Math.ceil(3 * sigma);
}

/**
 * Пересчитывает цвета биомов в прямоугольнике `rect` (уже обрезанном краями карты) в `out`
 * (полная текстура w·h·4). Побитно совпадает с bakeBiomeColors: те же отводы ядра в том же
 * порядке, та же обрезка у краёв карты, те же округления float32 промежуточного прохода.
 */
export function bakeBiomeColorsRect(
  biome: Uint8Array,
  defs: readonly BiomeDef[],
  w: number,
  h: number,
  out: Uint8Array,
  rect: Rect,
  sigma = BIOME_SIGMA,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;
  // Окно = прямоугольник ± радиус ядра, обрезанное краями карты. Клетки прямоугольника в окне
  // берут все отводы ядра без обрезки, кроме тех сторон, где окно упирается в край карты, а там
  // обрезка окна и карты совпадает: blurInterleaved по окну даёт для них ровно то же, что по карте.
  const r = biomeBlurRadius(sigma);
  const x0 = Math.max(0, rect.x - r);
  const x1 = Math.min(w - 1, rect.x + rect.w - 1 + r);
  const y0 = Math.max(0, rect.y - r);
  const y1 = Math.min(h - 1, rect.y + rect.h - 1 + r);
  const ww = x1 - x0 + 1;
  const wh = y1 - y0 + 1;
  const lut = colorLut(defs);
  const rgbc = new Float32Array(ww * wh * 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (biome[y * w + x] as number) * 4;
      if (lut[o + 3] === 0) continue;
      const t = ((y - y0) * ww + (x - x0)) * 4;
      rgbc[t] = lut[o] as number;
      rgbc[t + 1] = lut[o + 1] as number;
      rgbc[t + 2] = lut[o + 2] as number;
      rgbc[t + 3] = 1;
    }
  }
  const blurred = blurInterleaved(rgbc, ww, wh, 4, sigma);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      writeColor(out, (y * w + x) * 4, blurred, ((y - y0) * ww + (x - x0)) * 4);
    }
  }
}
