// Sea depth for the map shader: the water tint. The tint formula here and in GLSL (mapShader.ts) is
// the same; the TS copy exists for the tests. Depth comes from the real bottom (height − SEA_LEVEL
// on water), smoothed at coarse scale only: basins, ridges and continental shelves show, fine bottom
// noise (it produced "clouds") does not. Land takes no part in the smoothing at all, so there are no
// halos around islands: near the shore only a narrow band comes from the shader.
import { SEA_LEVEL } from '../content/terrainLevels';
import { blur } from '../sim/geom/blur';

/**
 * Maximum depth: world heights lie in 0..1, so the bottom is no deeper than SEA_LEVEL below sea level.
 * Measured on medium (seeds 1, 2, 3): the minimum water height is 0.0, the median depth 0.12–0.16,
 * about 10% of the sea lies at the very bottom (depth ≥ 0.44).
 */
export const SEA_DEPTH_MAX = SEA_LEVEL;

/** Depth grid step, cells: the texture is SEA_DEPTH_STEP² times smaller than the map, the GPU interpolates. */
export const SEA_DEPTH_STEP = 4;
/**
 * Bottom smoothing scale, cells (Gaussian σ). Bottom noise finer than ~30 cells disappears, basins and
 * shelves hundreds of cells across remain.
 */
export const SEA_DEPTH_SIGMA = 20;

/**
 * Water tint by depth: 0 — shallow, 1 — deep. Curve t·(1 + K)/(t + K), t = depth / SEA_DEPTH_MAX,
 * K = 0.5: half of the transition falls on the first 25% of the depth, the slope at the shore is finite (3),
 * with no kink.
 */
export const DEPTH_TONE_K = 0.5;

/** Share of paper grain on water relative to land (map shader; 0 — smooth water, 1 — same as land). */
export const WATER_GRAIN = 0.35;

export function depthTone(depth: number): number {
  const t = Math.min(Math.max(depth / SEA_DEPTH_MAX, 0), 1);
  return (t * (1 + DEPTH_TONE_K)) / (t + DEPTH_TONE_K);
}

/** Depth grid size for a w×h cell map. */
export function seaDepthSize(w: number, h: number): { w: number; h: number } {
  return { w: Math.ceil(w / SEA_DEPTH_STEP), h: Math.ceil(h / SEA_DEPTH_STEP) };
}

/**
 * Large-scale depth of the real bottom on the seaDepthSize grid (node (bx, by) is the centre of a
 * SEA_DEPTH_STEP² cell block). Mean water depth per block, then a normalized blur
 * σ = SEA_DEPTH_SIGMA: the sum of water depths and the water share are blurred separately, and the
 * answer is their ratio. Thus land pulls the depth neither to zero nor anywhere else: a node holds
 * the mean depth of the surrounding water. With no water nearby at all (deep inland) it is 0 and
 * never reaches the screen.
 */
export function smoothSeaDepth(height: Float32Array, w: number, h: number): Float32Array {
  const s = SEA_DEPTH_STEP;
  const size = seaDepthSize(w, h);
  const sigma = SEA_DEPTH_SIGMA / s;
  // Fields with a zero border of 3σ: otherwise the clamp blur repeats the edge block and gives it
  // half the weight at the map edge (noise stripes along the edge). Zero in both fields cancels out.
  const pad = Math.ceil(3 * sigma);
  const pw = size.w + 2 * pad;
  const ph = size.h + 2 * pad;
  const sum = new Float32Array(pw * ph);
  const wet = new Float32Array(pw * ph);
  for (let y = 0; y < h; y++) {
    const row = (((y / s) | 0) + pad) * pw + pad;
    for (let x = 0; x < w; x++) {
      const v = SEA_LEVEL - (height[y * w + x] as number);
      if (v <= 0) continue;
      const b = row + ((x / s) | 0);
      sum[b] = (sum[b] as number) + Math.min(v, SEA_DEPTH_MAX);
      wet[b] = (wet[b] as number) + 1;
    }
  }
  const bs = blur(sum, pw, ph, sigma);
  const bw = blur(wet, pw, ph, sigma);
  const out = new Float32Array(size.w * size.h);
  for (let y = 0; y < size.h; y++) {
    for (let x = 0; x < size.w; x++) {
      const i = (y + pad) * pw + x + pad;
      const wgt = bw[i] as number;
      out[y * size.w + x] = wgt > 1e-4 ? Math.min((bs[i] as number) / wgt, SEA_DEPTH_MAX) : 0;
    }
  }
  return out;
}
