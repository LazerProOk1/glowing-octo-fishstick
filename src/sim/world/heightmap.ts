import type { Rng } from '../rng';
import { createNoise2D, fbm } from '../noise';
import { SEA_LEVEL } from './types';

const TARGET_LAND = 0.38;
const BINS = 4096;

interface Blob {
  cx: number;
  cy: number;
  r: number;
  weight: number;
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Blob centres/radii are in units of map height; x is scaled by aspect ratio. */
function makeBlobs(rng: Rng, aspect: number): Blob[] {
  const blobs: Blob[] = [];
  const count = rng.int(4, 7); // 4..6 continents
  const tryPlace = (rMin: number, rMax: number, weight: number, margin: number, spacing: number): void => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const r = rMin + rng.next() * (rMax - rMin);
      const cx = (margin + r * 0.5) + rng.next() * (aspect - 2 * margin - r);
      const cy = (margin + r * 0.3) + rng.next() * (1 - 2 * margin - r * 0.6);
      const ok = blobs.every((b) => Math.hypot(b.cx - cx, b.cy - cy) > (b.r + r) * spacing);
      if (ok || attempt === 39) {
        blobs.push({ cx, cy, r, weight });
        return;
      }
    }
  };
  for (let i = 0; i < count; i++) tryPlace(0.17, 0.3, 1, 0.08, 0.75);
  const islands = rng.int(6, 11);
  for (let i = 0; i < islands; i++) tryPlace(0.04, 0.09, 0.85, 0.06, 1.0);
  return blobs;
}

/**
 * Continent heightmap in [0,1], index y*w+x. Land is exactly the cells above SEA_LEVEL,
 * covering ~38% of the map.
 */
export function generateHeight(rng: Rng, w: number, h: number): Float32Array {
  const aspect = w / h;
  const blobs = makeBlobs(rng.fork('blobs'), aspect);
  const warpX = createNoise2D(rng.fork('warpX'));
  const warpY = createNoise2D(rng.fork('warpY'));
  const shape = createNoise2D(rng.fork('shape'));
  const detail = createNoise2D(rng.fork('detail'));

  // Expensive noise is evaluated on a half-resolution grid and bilinearly upsampled.
  const STEP = 2;
  const cw = Math.ceil(w / STEP) + 1;
  const ch = Math.ceil(h / STEP) + 1;
  const coarse = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    const v = (cy * STEP) / h;
    for (let cx = 0; cx < cw; cx++) {
      const u = (cx * STEP) / w;
      // domain warp: large, low-frequency displacement for ragged coastlines
      const nx = u * 5;
      const ny = v * 2.5;
      const wx = fbm(warpX, nx + 11.3, ny + 3.7, 4) * 0.13;
      const wy = fbm(warpY, nx + 7.1, ny + 19.9, 4) * 0.13;
      const px = u * aspect + wx;
      const py = v + wy;

      let base = 0;
      for (const b of blobs) {
        const d = Math.hypot(px - b.cx, py - b.cy) / b.r;
        const val = b.weight * (1 - smooth(d * 0.9));
        if (val > base) base = val;
      }
      const relief = fbm(shape, u * 8, v * 4, 6);
      const fine = fbm(detail, u * 24 + 50, v * 12 + 50, 3);
      coarse[cy * cw + cx] = base + relief * 0.3 + fine * 0.06;
    }
  }

  const field = new Float32Array(w * h);
  let lo = Infinity;
  let hi = -Infinity;
  const edgeBand = 0.09; // fraction of height where the field fades to deep water
  for (let y = 0; y < h; y++) {
    const fy = y / STEP;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x / STEP;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = y0 * cw + x0;
      const top = (coarse[i] ?? 0) * (1 - tx) + (coarse[i + 1] ?? 0) * tx;
      const bot = (coarse[i + cw] ?? 0) * (1 - tx) + (coarse[i + cw + 1] ?? 0) * tx;
      let f = top * (1 - ty) + bot * ty;
      const ed = Math.min(x, y, w - 1 - x, h - 1 - y) / h;
      const m = smooth(ed / edgeBand);
      f = f * m - (1 - m) * 0.5;
      field[y * w + x] = f;
      if (f < lo) lo = f;
      if (f > hi) hi = f;
    }
  }

  // Histogram -> threshold giving TARGET_LAND share of land.
  const span = hi - lo || 1;
  const hist = new Uint32Array(BINS);
  for (let i = 0; i < field.length; i++) {
    const b = Math.min(BINS - 1, Math.floor((((field[i] ?? 0) - lo) / span) * BINS));
    hist[b] = (hist[b] ?? 0) + 1;
  }
  const waterCells = (1 - TARGET_LAND) * field.length;
  let acc = 0;
  let tBin = 0;
  for (let b = 0; b < BINS; b++) {
    acc += hist[b] ?? 0;
    if (acc >= waterCells) {
      tBin = b + 1;
      break;
    }
  }
  const thr = lo + (tBin / BINS) * span;

  // Piecewise-linear remap: [lo,thr] -> [0,SEA_LEVEL], [thr,hi] -> [SEA_LEVEL,1].
  const out = new Float32Array(w * h);
  const loSpan = thr - lo || 1;
  const hiSpan = hi - thr || 1;
  for (let i = 0; i < field.length; i++) {
    const f = field[i] ?? 0;
    const r = f <= thr ? ((f - lo) / loSpan) * SEA_LEVEL : SEA_LEVEL + ((f - thr) / hiSpan) * (1 - SEA_LEVEL);
    out[i] = r < 0 ? 0 : r > 1 ? 1 : r;
  }
  return out;
}

/** Count 4-connected land (> SEA_LEVEL) components with at least `minCells` cells. */
export function countLandmasses(height: Float32Array, w: number, h: number, minCells: number): number {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || (height[s] ?? 0) <= SEA_LEVEL) continue;
    let sp = 0;
    let size = 0;
    stack[sp++] = s;
    seen[s] = 1;
    while (sp > 0) {
      const i = stack[--sp] ?? 0;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      const visit = (j: number): void => {
        if (!seen[j] && (height[j] ?? 0) > SEA_LEVEL) {
          seen[j] = 1;
          stack[sp++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
    if (size >= minCells) count++;
  }
  return count;
}
