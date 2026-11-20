import type { BiomeDef } from '../content/biomes/types';
import { CodedError } from '../content/errors';
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
  // RGB and coverage are interleaved in one array and blurred in a single pass.
  const rgbc = new Float32Array(n * 4);
  const lut = colorLut(defs);
  for (let i = 0; i < n; i++) {
    const o = (biome[i] as number) * 4;
    if (lut[o + 3] === 0) continue;
    if ((lut[o + 3] as number) < 0) throw new CodedError('no_biome_code', { code: biome[i] as number, cell: i });
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

/** Table by biome code: colour and land flag (RGBA), no lookup by name in the loop. */
function colorLut(defs: readonly BiomeDef[]): Float32Array {
  const lut = new Float32Array(256 * 4);
  for (let code = 0; code < 256; code++) {
    const def = defs[code];
    const col: RGB = def ? def.color : MAP_COLORS.beach;
    lut[code * 4] = col[0];
    lut[code * 4 + 1] = col[1];
    lut[code * 4 + 2] = col[2];
    lut[code * 4 + 3] = !def ? -1 : def.kind === 'water' ? 0 : 1; // -1: unknown code, an error when a cell uses it
  }
  return lut;
}

/** Normalized convolution → RGBA8: the colour is divided by the coverage; no land nearby — beach colour, A = 0. */
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

/** Rectangle in map cells. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Biome colour blur radius in cells: this many cells around an edit change colour. */
export function biomeBlurRadius(sigma = BIOME_SIGMA): number {
  return Math.ceil(3 * sigma);
}

/**
 * Recomputes biome colours in the rectangle `rect` (already clipped to the map edges) into `out`
 * (the full w·h·4 texture). Bit-identical to bakeBiomeColors: the same kernel taps in the same
 * order, the same clipping at the map edges, the same float32 rounding of the intermediate pass.
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
  // The window is the rectangle ± kernel radius, clipped to the map edges. Cells of the rectangle take
  // all kernel taps without clipping, except on sides where the window hits the map edge; there the
  // window and map clipping coincide, so blurInterleaved over the window gives them the same result.
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
      if ((lut[o + 3] as number) < 0) throw new CodedError('no_biome_code', { code: biome[y * w + x] as number, cell: y * w + x });
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
