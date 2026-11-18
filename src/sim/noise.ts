import type { Rng } from './rng';

export type Noise2D = (x: number, y: number) => number;

const GRADS: readonly (readonly [number, number])[] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
// Scale so that the maximum amplitude of the sum is ~1 for these gradients.
const SCALE = 70;

/** 2D simplex noise with a permutation table shuffled by `rng`. Output in [-1, 1]. */
export function createNoise2D(rng: Rng): Noise2D {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = p[i] ?? 0;
    p[i] = p[j] ?? 0;
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255] ?? 0;
  // Gradient components per permutation entry (GRADS[perm % 8]) in flat tables: no per-call
  // closures or nested arrays. Arithmetic is unchanged (g·(x, y) with g ∈ {−1, 0, 1}).
  const gx = new Int8Array(512);
  const gy = new Int8Array(512);
  for (let i = 0; i < 512; i++) {
    const g = GRADS[(perm[i] ?? 0) % 8] ?? [0, 0];
    gx[i] = g[0];
    gy[i] = g[1];
  }

  return (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const g0 = ii + perm[jj]!;
    const g1 = ii + i1 + perm[jj + j1]!;
    const g2 = ii + 1 + perm[jj + 1]!;
    let n0 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (gx[g0]! * x0 + gy[g0]! * y0);
    }
    let n1 = 0;
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (gx[g1]! * x1 + gy[g1]! * y1);
    }
    let n2 = 0;
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (gx[g2]! * x2 + gy[g2]! * y2);
    }
    const v = SCALE * (n0 + n1 + n2);
    return Math.max(-1, Math.min(1, v));
  };
}

/** Fractal Brownian motion, normalized by the sum of amplitudes to ~[-1, 1]. */
export function fbm(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}
