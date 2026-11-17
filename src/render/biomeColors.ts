import { BIOMES } from '../sim/world/types';
import { blur } from './normals';
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
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const code = biome[i] as number;
    if (isWater(code)) continue;
    const biomeName = BIOMES[code];
    const col: RGB = biomeName ? PALETTE[biomeName] : MAP_COLORS.beach;
    r[i] = col[0];
    g[i] = col[1];
    b[i] = col[2];
    c[i] = 1;
  }
  const br = blur(r, w, h, sigma);
  const bg = blur(g, w, h, sigma);
  const bb = blur(b, w, h, sigma);
  const bc = blur(c, w, h, sigma);
  const out = new Uint8Array(n * 4);
  const [fr, fg, fb] = MAP_COLORS.beach;
  for (let i = 0; i < n; i++) {
    const cov = bc[i] as number;
    const o = i * 4;
    if (cov < 1e-6) {
      out[o] = fr;
      out[o + 1] = fg;
      out[o + 2] = fb;
      out[o + 3] = 0;
      continue;
    }
    out[o] = Math.round((br[i] as number) / cov);
    out[o + 1] = Math.round((bg[i] as number) / cov);
    out[o + 2] = Math.round((bb[i] as number) / cov);
    out[o + 3] = Math.round(Math.min(1, cov) * 255);
  }
  return out;
}
