import type { Rng } from '../rng';
import { createNoise2D, fbm } from '../noise';
import { SEA_LEVEL, MOUNTAIN_LEVEL, HILL_LEVEL } from './types';

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
  const ridgeN = createNoise2D(rng.fork('ridge'));

  // Expensive noise is evaluated on a half-resolution grid and bilinearly upsampled.
  const STEP = 2;
  const cw = Math.ceil(w / STEP) + 1;
  const ch = Math.ceil(h / STEP) + 1;
  const coarse = new Float32Array(cw * ch);
  const coarseE = new Float32Array(cw * ch); // land elevation (ridges), ranked later
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
        // Beyond d = 1/0.9 a blob contributes exactly 0 and can never raise `base`; the cheap
        // squared-distance test (with margin) skips Math.hypot there. Inside it, the same formula.
        const ex = px - b.cx;
        const ey = py - b.cy;
        if (ex * ex + ey * ey > b.r * b.r * 1.44) continue;
        const d = Math.hypot(ex, ey) / b.r;
        const val = b.weight * (1 - smooth(d * 0.9));
        if (val > base) base = val;
      }
      const relief = fbm(shape, u * 8, v * 4, 6);
      const fine = fbm(detail, u * 24 + 50, v * 12 + 50, 3);
      coarse[cy * cw + cx] = base + relief * 0.3 + fine * 0.06;
      // Mountain chains: ridged noise, only inland; domes only shape the land mask.
      let ridge = 0;
      let amp = 1;
      let freq = 1;
      let norm = 0;
      for (let o = 0; o < 4; o++) {
        const n = 1 - Math.abs(ridgeN(u * 5 * freq + 31.7, v * 2.5 * freq + 5.3));
        ridge += n * n * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      ridge /= norm;
      const inland = smooth(base / 0.7);
      coarseE[cy * cw + cx] = ridge * inland * 0.8 + base * 0.2 + relief * 0.1 + fine * 0.04;
    }
  }

  const field = new Float32Array(w * h);
  const elev = new Float32Array(w * h);
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
      const te = (coarseE[i] ?? 0) * (1 - tx) + (coarseE[i + 1] ?? 0) * tx;
      const be = (coarseE[i + cw] ?? 0) * (1 - tx) + (coarseE[i + cw + 1] ?? 0) * tx;
      elev[y * w + x] = te * (1 - ty) + be * ty;
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

  // Water: [lo,thr] -> [0,SEA_LEVEL] linearly. Land: rank by elevation, then shape the
  // quantile curve so lowlands form a gradient, hills ~12% and mountains ~3% of land.
  const out = new Float32Array(w * h);
  const loSpan = thr - lo || 1;
  let eLo = Infinity;
  let eHi = -Infinity;
  let landCount = 0;
  for (let i = 0; i < field.length; i++) {
    if ((field[i] ?? 0) <= thr) continue;
    landCount++;
    const e = elev[i] ?? 0;
    if (e < eLo) eLo = e;
    if (e > eHi) eHi = e;
  }
  const eSpan = eHi - eLo || 1;
  const eHist = new Uint32Array(BINS);
  for (let i = 0; i < field.length; i++) {
    if ((field[i] ?? 0) <= thr) continue;
    const b = Math.min(BINS - 1, Math.floor((((elev[i] ?? 0) - eLo) / eSpan) * BINS));
    eHist[b] = (eHist[b] ?? 0) + 1;
  }
  const cdf = new Float64Array(BINS + 1); // cells strictly below bin b
  for (let b = 0; b < BINS; b++) cdf[b + 1] = (cdf[b] ?? 0) + (eHist[b] ?? 0);
  const total = landCount || 1;
  const shape01 = (q: number): number => {
    if (q < 0.85) return SEA_LEVEL + (HILL_LEVEL - SEA_LEVEL) * (q / 0.85);
    if (q < 0.97) return HILL_LEVEL + (MOUNTAIN_LEVEL - HILL_LEVEL) * ((q - 0.85) / 0.12);
    return MOUNTAIN_LEVEL + (1 - MOUNTAIN_LEVEL) * ((q - 0.97) / 0.03);
  };
  for (let i = 0; i < field.length; i++) {
    const f = field[i] ?? 0;
    let r: number;
    if (f <= thr) {
      r = ((f - lo) / loSpan) * SEA_LEVEL;
    } else {
      const pos = (((elev[i] ?? 0) - eLo) / eSpan) * BINS;
      const b = Math.min(BINS - 1, Math.floor(pos));
      const frac = Math.min(1, pos - b);
      const q = ((cdf[b] ?? 0) + (eHist[b] ?? 0) * frac) / total;
      r = Math.max(shape01(q), SEA_LEVEL + 1e-6);
    }
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
