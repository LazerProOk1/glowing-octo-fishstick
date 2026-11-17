import type { Rng } from '../rng';
import { createNoise2D, fbm } from '../noise';
import { HILL_LEVEL, SEA_LEVEL } from './types';

const EQUATOR_TEMP = 28;
const POLE_TEMP = -25;
const LAPSE = 30; // °C lost between sea level and height 1
const MOISTURE_SCALE = 220; // cells: e-folding distance of coastal humidity
/** Zonal moisture by latitude (0 equator .. 1 pole): wet equator, dry subtropics, wet mid-latitudes, dry poles. */
const LAT_WET: readonly (readonly [number, number])[] = [
  [0, 0.85],
  [0.33, 0.08],
  [0.7, 0.62],
  [1, 0.25],
];

function zonalWetness(lat: number): number {
  for (let k = 1; k < LAT_WET.length; k++) {
    const a = LAT_WET[k - 1] ?? [0, 0];
    const b = LAT_WET[k] ?? [1, 0];
    if (lat <= b[0]) {
      const t = (lat - a[0]) / (b[0] - a[0]);
      const e = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return LAT_WET[LAT_WET.length - 1]?.[1] ?? 0;
}
const STEP = 4;
/** Amplitude of the fine latitude wobble (0.012 ~ 6 rows on a 1024-row map). */
const LAT_WOBBLE = 0.012;

/** Fill `out` by bilinearly upsampling fn(u, v) evaluated on a coarse STEP-spaced grid. */
function sampleCoarse(fn: (u: number, v: number) => number, w: number, h: number, out: Float32Array): void {
  const cw = Math.ceil(w / STEP) + 1;
  const ch = Math.ceil(h / STEP) + 1;
  const c = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) c[cy * cw + cx] = fn((cx * STEP) / w, (cy * STEP) / h);
  }
  for (let y = 0; y < h; y++) {
    const fy = y / STEP;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x / STEP;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = y0 * cw + x0;
      const top = (c[i] ?? 0) * (1 - tx) + (c[i + 1] ?? 0) * tx;
      const bot = (c[i + cw] ?? 0) * (1 - tx) + (c[i + cw + 1] ?? 0) * tx;
      out[y * w + x] = top * (1 - ty) + bot * ty;
    }
  }
}

/** Rows a rain-shadow streak is blurred over (box radius, applied twice). */
const SHADOW_BLUR = 4;

/** In-place vertical box blur with radius r (clamped at the map edges), row-major running sums. */
function blurRows(a: Float32Array, w: number, h: number, r: number): void {
  const src = a.slice();
  const sum = new Float32Array(w);
  const row = (y: number): number => Math.min(h - 1, Math.max(0, y)) * w;
  for (let y = -r; y <= r; y++) {
    const o = row(y);
    for (let x = 0; x < w; x++) sum[x] = (sum[x] ?? 0) + (src[o + x] ?? 0);
  }
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const add = row(y + r + 1);
    const sub = row(y - r);
    for (let x = 0; x < w; x++) {
      a[o + x] = (sum[x] ?? 0) * k;
      sum[x] = (sum[x] ?? 0) + (src[add + x] ?? 0) - (src[sub + x] ?? 0);
    }
  }
}

/** Distance (4-connected steps) from each cell to the nearest water cell; 0 on water. */
function distanceToSea(height: Float32Array, w: number, h: number): Uint16Array {
  const n = w * h;
  const dist = new Uint16Array(n).fill(65535);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if ((height[i] ?? 0) <= SEA_LEVEL) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++] ?? 0;
    const d = (dist[i] ?? 0) + 1;
    const x = i % w;
    const push = (j: number): void => {
      if ((dist[j] ?? 0) > d) {
        dist[j] = d;
        queue[tail++] = j;
      }
    };
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  return dist;
}

export function computeClimate(
  rng: Rng,
  height: Float32Array,
  w: number,
  h: number,
): { temperature: Float32Array; moisture: Float32Array } {
  const n = w * h;
  const tNoise = createNoise2D(rng.fork('temp'));
  const mNoise = createNoise2D(rng.fork('moist'));
  const mNoise2 = createNoise2D(rng.fork('moist2'));
  const latNoise = createNoise2D(rng.fork('lat'));

  const tJit = new Float32Array(n);
  sampleCoarse((u, v) => fbm(tNoise, u * 6, v * 3, 3), w, h, tJit);
  const mJit = new Float32Array(n);
  sampleCoarse(
    (u, v) => fbm(mNoise, u * 7 + 20, v * 3.5 + 20, 4) * 0.7 + fbm(mNoise2, u * 18 + 5, v * 9 + 5, 3) * 0.3,
    w,
    h,
    mJit,
  );

  // Per-cell latitude (0 equator .. 1 pole), warped by low-frequency noise so belts wander.
  const warp = new Float32Array(n);
  sampleCoarse((u, v) => fbm(latNoise, u * 3 + 40, v * 3 + 40, 3), w, h, warp);
  // Fine wobble (~32-cell wavelength, a few rows) so belt edges and biome borders are not straight lines.
  const wobble = new Float32Array(n);
  sampleCoarse((u, v) => fbm(latNoise, u * 64 + 7, v * 32 + 7, 2), w, h, wobble);
  const lats = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const base = Math.abs((y + 0.5) / h - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const l = base + 0.08 * (warp[y * w + x] ?? 0) + LAT_WOBBLE * (wobble[y * w + x] ?? 0);
      lats[y * w + x] = l < 0 ? 0 : l > 1 ? 1 : l;
    }
  }

  const temperature = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lat = lats[i] ?? 0;
    const base = EQUATOR_TEMP + (POLE_TEMP - EQUATOR_TEMP) * Math.pow(lat, 2.6);
    const alt = Math.max(0, ((height[i] ?? 0) - SEA_LEVEL) / (1 - SEA_LEVEL));
    temperature[i] = base - LAPSE * alt * alt + (tJit[i] ?? 0) * 3;
  }

  // Rain shadow: per row, sweep along the prevailing wind carrying a decaying "blocked" value.
  // Trade winds (east -> west) near the equator, westerlies elsewhere. Both sweeps are computed and
  // blended by the (warped) latitude so there is no hard seam along a row where the wind flips.
  const shadowE = new Float32Array(n);
  const shadowW = new Float32Array(n);
  for (const [east2west, out] of [
    [true, shadowE],
    [false, shadowW],
  ] as const) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let k = 0; k < w; k++) {
        const x = east2west ? w - 1 - k : k;
        const i = y * w + x;
        const hh = height[i] ?? 0;
        if (hh <= SEA_LEVEL) {
          s *= 0.97;
        } else {
          s *= 0.985;
          if (hh > HILL_LEVEL) {
            const block = 0.25 + 0.75 * Math.min(1, (hh - HILL_LEVEL) / (1 - HILL_LEVEL));
            if (block > s) s = block;
          }
        }
        out[i] = s;
      }
    }
  }
  const shadow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, ((lats[i] ?? 0) - 0.28) / 0.1));
    const westerly = t * t * (3 - 2 * t);
    shadow[i] = (shadowE[i] ?? 0) * (1 - westerly) + (shadowW[i] ?? 0) * westerly;
  }
  // Per-row sweeps leave shadow streaks with hard row edges; blur across rows so they fade out.
  blurRows(shadow, w, h, SHADOW_BLUR);
  blurRows(shadow, w, h, SHADOW_BLUR);

  const dist = distanceToSea(height, w, h);
  const moisture = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((height[i] ?? 0) <= SEA_LEVEL) {
        moisture[i] = 1;
        continue;
      }
      const coast = Math.exp(-(dist[i] ?? 0) / MOISTURE_SCALE);
      const m = zonalWetness(lats[i] ?? 0) * (0.6 + 0.4 * coast) + 0.1 * coast + (mJit[i] ?? 0) * 0.25 - (shadow[i] ?? 0) * 0.25;
      moisture[i] = m < 0 ? 0 : m > 1 ? 1 : m;
    }
  }
  return { temperature, moisture };
}
