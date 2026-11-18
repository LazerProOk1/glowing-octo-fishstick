import type { Rng } from '../rng';
import { createNoise2D, fbm } from '../noise';
import type { BiomeDef } from '../../content/biomes/types';
import { hasTag } from '../../content/registry';
import { KIND_LAND as KIND_LAND_ } from './provinceSeeds';

const KIND_LAND = KIND_LAND_;

/** Noise fields and the biome-edge jitter used by the province partition. */

/**
 * Biome map for partitioning: each land cell takes the biome of the land cell at a small noisy
 * offset, so smooth or straight biome/relief edges become wiggly province borders while purity
 * against the true biomes drops only along a thin strip. Mountain cells (tag `mountain`) may only
 * become hills (tag `hill`).
 */
export function jitterBiomes(
  biomes: Uint8Array,
  kind: Uint8Array,
  jx: Float32Array,
  jy: Float32Array,
  scale: number,
  w: number,
  h: number,
  defs: readonly BiomeDef[],
): Uint8Array {
  const mountain = new Uint8Array(256);
  const hill = new Uint8Array(256);
  defs.forEach((d, code) => {
    mountain[code] = hasTag(d, 'mountain') ? 1 : 0;
    hill[code] = hasTag(d, 'hill') ? 1 : 0;
  });
  // A mountain cell may only become hills (a massif never leaks into a lowland province); every
  // other land cell may take the biome of its jittered source, including mountains.
  const allowed = (from: number, to: number): boolean => mountain[from] === 0 || hill[to] === 1;
  const out = new Uint8Array(biomes);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      if (kind[c] !== KIND_LAND) continue;
      const sx = Math.round(x + scale * jx[c]!);
      const sy = Math.round(y + scale * jy[c]!);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const d = sy * w + sx;
      if (kind[d] === KIND_LAND && allowed(biomes[c]!, biomes[d]!)) out[c] = biomes[d]!;
    }
  }
  return out;
}

/**
 * Isotropic simplex fbm field scaled to [-amp, amp]-ish, with the given base wavelength in cells.
 * Evaluated on a lattice of `stride` cells and bilinearly upsampled (the finest octave's wavelength
 * should stay several strides long).
 */
export function noiseField(
  rng: Rng,
  w: number,
  h: number,
  wavelength: number,
  amp: number,
  octaves = 2,
  stride = 2,
): Float32Array {
  const noise = createNoise2D(rng);
  const st = stride;
  const cw = Math.ceil(w / st) + 1;
  const ch = Math.ceil(h / st) + 1;
  const coarse = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) coarse[cy * cw + cx] = amp * fbm(noise, (st * cx) / wavelength, (st * cy) / wavelength, octaves);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / st);
    const ty = (y - y0 * st) / st;
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / st);
      const tx = (x - x0 * st) / st;
      const i = y0 * cw + x0;
      const top = coarse[i]! * (1 - tx) + coarse[i + 1]! * tx;
      const bot = coarse[i + cw]! * (1 - tx) + coarse[i + cw + 1]! * tx;
      out[y * w + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}
