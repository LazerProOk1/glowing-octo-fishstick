import { BIOMES } from '../sim/world/types';
import { blurInterleaved } from './normals';
import { MAP_COLORS, PALETTE, type RGB } from './palette';

/**
 * Blur of the biome colour field (cells). With a noise-warped bilinear lookup in the shader the
 * transitions are ~3 cells wide and organic; mountains and snow keep their shape at this scale.
 */
export const BIOME_SIGMA = 1.2;

const isWater = (code: number): boolean => {
  const b = BIOMES[code];
  return b === 'ocean' || b === 'coast';
};

/**
 * Soft biome colour texture: RGBA8 per cell, RGB = Gaussian-blurred land palette colour,
 * A = blurred land coverage (0..255). Normalised convolution: water cells carry no colour, so
 * land near the coast keeps its own biome colour instead of turning blue.
 */
export function bakeBiomeColors(biome: Uint8Array, w: number, h: number, sigma = BIOME_SIGMA): Uint8Array {
  const n = w * h;
  // RGB и покрытие чередуются в одном массиве и размываются за один проход.
  const rgbc = new Float32Array(n * 4);
  // Таблица по коду биома: цвет и признак воды, без поиска по имени в цикле.
  const lut = new Float32Array(256 * 4);
  for (let code = 0; code < 256; code++) {
    const biomeName = BIOMES[code];
    const col: RGB = biomeName ? PALETTE[biomeName] : MAP_COLORS.beach;
    lut[code * 4] = col[0];
    lut[code * 4 + 1] = col[1];
    lut[code * 4 + 2] = col[2];
    lut[code * 4 + 3] = isWater(code) ? 0 : 1;
  }
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
  const [fr, fg, fb] = MAP_COLORS.beach;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const cov = blurred[o + 3] as number;
    if (cov < 1e-6) {
      out[o] = fr;
      out[o + 1] = fg;
      out[o + 2] = fb;
      out[o + 3] = 0;
      continue;
    }
    out[o] = Math.round((blurred[o] as number) / cov);
    out[o + 1] = Math.round((blurred[o + 1] as number) / cov);
    out[o + 2] = Math.round((blurred[o + 2] as number) / cov);
    out[o + 3] = Math.round(Math.min(1, cov) * 255);
  }
  return out;
}
