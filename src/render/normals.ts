/**
 * Gradient field for hillshading, baked on the CPU.
 *
 * The heightmap is piecewise-bilinear and a one-texel difference in the shader is only C0,
 * which shows as low-poly facets. Here the height is Gaussian-blurred (σ ≈ 1.25 cells) and
 * differentiated with a 3×3 Sobel kernel; the shader samples the result bilinearly, so the
 * normal is smooth across texel lines.
 */

import { blur } from '../sim/geom/blur';

export const NORMAL_SIGMA = 1.25;
/**
 * Light blur of the height for the water depth tint near the coast. The coastline itself comes
 * from the province cells (coastSignedDistance in bakeWorld.ts), not from this field.
 */
export const COAST_SIGMA = 0.7;

/**
 * Height gradient (dh/dx, dh/dy per cell), interleaved RG, length w·h·2.
 * Sobel normalised by 8 so a plane h = a·x + b·y gives exactly (a, b).
 */
export function bakeGradient(height: Float32Array, w: number, h: number, sigma = NORMAL_SIGMA): Float32Array {
  const b = blur(height, w, h, sigma);
  const out = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const mid = y * w;
    const dn = (y + 1 < h ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x + 1 < w ? x + 1 : w - 1;
      const tl = b[up + xl] as number;
      const tc = b[up + x] as number;
      const tr = b[up + xr] as number;
      const ml = b[mid + xl] as number;
      const mr = b[mid + xr] as number;
      const bl = b[dn + xl] as number;
      const bc = b[dn + x] as number;
      const br = b[dn + xr] as number;
      const o = (y * w + x) * 2;
      out[o] = (tr + 2 * mr + br - tl - 2 * ml - bl) / 8;
      out[o + 1] = (bl + 2 * bc + br - tl - 2 * tc - tr) / 8;
    }
  }
  return out;
}

/** Blur of the land mask for the shallow-water band: lighter water fades out within ~3–6 cells. */
export const HALO_SIGMA = 3.5;

/** Smooth land fraction in [0, 1] (≈ 0.5 on a straight coast), from `height > seaLevel`. */
export function coastNearness(height: Float32Array, w: number, h: number, seaLevel: number, sigma = HALO_SIGMA): Float32Array {
  const land = new Float32Array(w * h);
  for (let i = 0; i < land.length; i++) land[i] = (height[i] as number) > seaLevel ? 1 : 0;
  return blur(land, w, h, sigma);
}
