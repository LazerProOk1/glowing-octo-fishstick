import type { BiomeDef } from '../content/biomes/types';
import { blurInterleaved, gaussianKernel } from './normals';
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
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const lut = colorLut(defs);
  const clampX = (x: number): number => (x < 0 ? 0 : x >= w ? w - 1 : x);
  const clampY = (y: number): number => (y < 0 ? 0 : y >= h ? h - 1 : y);
  // Горизонтальный проход для строк [y0, y1] (прямоугольник ± радиус, по карте) и столбцов прямоугольника.
  const y0 = clampY(rect.y - r);
  const y1 = clampY(rect.y + rect.h - 1 + r);
  const rw = rect.w;
  const tmp = new Float32Array((y1 - y0 + 1) * rw * 4);
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let dx = 0; dx < rw; dx++) {
      const x = rect.x + dx;
      const t = ((y - y0) * rw + dx) * 4;
      for (let ch = 0; ch < 4; ch++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          const o = (biome[row + clampX(x + i)] as number) * 4;
          // Вода в исходном поле — нули во всех каналах.
          const v = lut[o + 3] === 0 ? 0 : (lut[o + ch] as number);
          s += (k[i + r] as number) * v;
        }
        tmp[t + ch] = s;
      }
    }
  }
  const acc = new Float64Array(rw * 4);
  const px = new Float32Array(rw * 4);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    acc.fill(0);
    for (let i = -r; i <= r; i++) {
      const src = (clampY(y + i) - y0) * rw * 4;
      const ki = k[i + r] as number;
      for (let j = 0; j < rw * 4; j++) acc[j] = (acc[j] as number) + ki * (tmp[src + j] as number);
    }
    px.set(acc);
    for (let dx = 0; dx < rw; dx++) writeColor(out, (y * w + rect.x + dx) * 4, px, dx * 4);
  }
}
