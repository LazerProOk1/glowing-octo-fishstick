// Soft province membership — the CPU mirror of the map shader (mapShader.ts, softSide).
// No pixi.js: pure functions over the baked arrays, checked by the tests as well.
import { fromHalf } from './halfFloat';

/** Baked maps the province is chosen from (layouts — see WorldBake). */
export interface ProvinceMaps {
  w: number;
  h: number;
  /** RGBA8 provinceRG: the id where the screen shows land. */
  land: Uint8Array;
  /** RGBA8 provinceSeaRG: the id where the screen shows water. */
  sea: Uint8Array;
  /** RGBA16F surface: channel B — slightly blurred height − SEA_LEVEL (the shoreline). */
  surface: Uint16Array;
}

export interface SoftProvince {
  /** Bank side at a point: land if the blurred height is above zero. */
  landSide: boolean;
  /** Province with the largest share nearby (−1 — no cell of that side around). */
  best: number;
  /** Second province by share (−1 — none). */
  second: number;
  /** Distance to the border of best and second in cells (≥ 0; Infinity if second is absent). */
  edge: number;
}

/** Cubic B-spline weights for 4 cells (offsets −1, 0, 1, 2) at fractional part t. */
export function bspline(t: number): [number, number, number, number] {
  const s = 1 - t;
  const t2 = t * t;
  const t3 = t2 * t;
  return [(s * s * s) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

/** Derivatives of the bspline weights with respect to t. */
export function bsplineD(t: number): [number, number, number, number] {
  const s = 1 - t;
  return [-0.5 * s * s, 1.5 * t * t - 2 * t, -1.5 * t * t + t + 0.5, 0.5 * t * t];
}

function clampI(v: number, n: number): number {
  return v < 0 ? 0 : v >= n ? n - 1 : v;
}

/** Bilinear shore height at point (x, y) in cells, like texture() with clamp-to-edge in the shader. */
export function coastAt(maps: ProvinceMaps, x: number, y: number): number {
  const { w, h, surface } = maps;
  const cx = Math.floor(x - 0.5);
  const cy = Math.floor(y - 0.5);
  const tx = x - 0.5 - cx;
  const ty = y - 0.5 - cy;
  const at = (ix: number, iy: number): number => fromHalf(surface[(clampI(iy, h) * w + clampI(ix, w)) * 4 + 2] as number);
  const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
  const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Province shares around the 4×4 cell neighbourhood of point (x, y) with cubic B-spline weights, using
 * only cells of its own bank side (the map of that side). Candidates are the provinces of the 4 nearest cells.
 * The border of two provinces is the line of equal shares: smooth, not a per-cell staircase.
 * Limitations (the same in the shader):
 * - thin province strips a cell wide or less may vanish: their share never reaches a majority
 *   anywhere, and a neighbour takes the point;
 * - candidates are only the provinces of the 4 nearest cells: where 4 or more provinces meet, a fifth one
 *   that could have had a larger share is ignored — a small seam is possible;
 * - the bank side is computed on the CPU with half-float in JS precision, on the GPU with the texture
 *   filtering precision: right at the shoreline the side (and the chosen map) may differ by at most 1 px.
 */
export function softProvince(maps: ProvinceMaps, x: number, y: number): SoftProvince {
  const landSide = coastAt(maps, x, y) > 0;
  const map = landSide ? maps.land : maps.sea;
  const { w, h } = maps;
  const cx = Math.floor(x - 0.5);
  const cy = Math.floor(y - 0.5);
  const wx = bspline(x - 0.5 - cx);
  const wy = bspline(y - 0.5 - cy);
  const dx = bsplineD(x - 0.5 - cx);
  const dy = bsplineD(y - 0.5 - cy);
  const ids: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const o = (clampI(cy + j - 1, h) * w + clampI(cx + i - 1, w)) * 4;
      const land = (map[o + 2] as number) > 127;
      ids.push(land === landSide ? (map[o] as number) | ((map[o + 1] as number) << 8) : -1);
    }
  }
  const cand = [ids[5] as number, ids[6] as number, ids[9] as number, ids[10] as number];
  let sum = 0;
  let sumX = 0;
  let sumY = 0;
  const a = [0, 0, 0, 0];
  const ax = [0, 0, 0, 0];
  const ay = [0, 0, 0, 0];
  for (let k = 0; k < 16; k++) {
    const id = ids[k] as number;
    if (id < 0) continue;
    const i = k & 3;
    const j = k >> 2;
    const wgt = (wx[i] as number) * (wy[j] as number);
    const gx = (dx[i] as number) * (wy[j] as number);
    const gy = (wx[i] as number) * (dy[j] as number);
    sum += wgt;
    sumX += gx;
    sumY += gy;
    for (let c = 0; c < 4; c++) {
      if (cand[c] !== id) continue;
      a[c] = (a[c] as number) + wgt;
      ax[c] = (ax[c] as number) + gx;
      ay[c] = (ay[c] as number) + gy;
    }
  }
  if (sum < 1e-4) return { landSide, best: -1, second: -1, edge: Infinity };
  // Share m = a / sum and its gradient (quotient rule).
  const m = a.map((v, c) => ((cand[c] as number) < 0 ? -1 : v / sum));
  const mx = a.map((v, c) => ((ax[c] as number) * sum - v * sumX) / (sum * sum));
  const my = a.map((v, c) => ((ay[c] as number) * sum - v * sumY) / (sum * sum));
  let b = -1;
  for (let c = 0; c < 4; c++) if ((cand[c] as number) >= 0 && (b < 0 || (m[c] as number) > (m[b] as number))) b = c;
  if (b < 0) return { landSide, best: -1, second: -1, edge: Infinity };
  const best = cand[b] as number;
  let s = -1;
  for (let c = 0; c < 4; c++) {
    const id = cand[c] as number;
    if (id >= 0 && id !== best && (s < 0 || (m[c] as number) > (m[s] as number))) s = c;
  }
  if (s < 0) return { landSide, best, second: -1, edge: Infinity };
  const diff = (m[b] as number) - (m[s] as number);
  const g = Math.hypot((mx[b] as number) - (mx[s] as number), (my[b] as number) - (my[s] as number));
  return { landSide, best, second: cand[s] as number, edge: diff / Math.max(g, 1e-3) };
}

/** Province under point (x, y) in cells — the one the shader highlights; null — outside the map. */
export function pickProvince(maps: ProvinceMaps, x: number, y: number): number | null {
  if (!(x >= 0 && y >= 0 && x < maps.w && y < maps.h)) return null;
  const r = softProvince(maps, x, y);
  return r.best >= 0 ? r.best : null;
}
