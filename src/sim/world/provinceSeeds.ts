import type { Rng } from '../rng';
import { SEA_LEVEL } from './types';

/**
 * Labels 4-connected components of cells for which `same(a, b)` holds between neighbours.
 * Returns per-cell component id and per-component sizes.
 */
export function labelComponents(
  n: number,
  w: number,
  h: number,
  same: (a: number, b: number) => boolean,
): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = s;
    comp[s] = id;
    while (top > 0) {
      const c = stack[--top]!;
      size++;
      const x = c % w;
      if (x > 0 && comp[c - 1] === -1 && same(c, c - 1)) {
        comp[c - 1] = id;
        stack[top++] = c - 1;
      }
      if (x < w - 1 && comp[c + 1] === -1 && same(c, c + 1)) {
        comp[c + 1] = id;
        stack[top++] = c + 1;
      }
      if (c >= w && comp[c - w] === -1 && same(c, c - w)) {
        comp[c - w] = id;
        stack[top++] = c - w;
      }
      if (c + w < n && comp[c + w] === -1 && same(c, c + w)) {
        comp[c + w] = id;
        stack[top++] = c + w;
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

/** 1 = land (height > SEA_LEVEL). Expects input already passed through `normalizeShoreline`. */
export function landMask(height: Float32Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = height[i]! > SEA_LEVEL ? 1 : 0;
  return land;
}

/**
 * Maximal Poisson-disk sampling by random sequential adsorption: cells are visited in a random
 * order and accepted when no earlier sample of the same pattern lies closer than its radius.
 * The land pattern covers land cells only; the sea pattern covers the whole map.
 */
export function poissonSeeds(
  rng: Rng,
  land: Uint8Array,
  w: number,
  h: number,
  landRadius: number,
  seaRadius: number,
): number[] {
  const n = w * h;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  const landGrid = makeGrid(landRadius, w, h);
  const seaGrid = makeGrid(seaRadius, w, h);
  const seeds: number[] = [];
  for (let k = 0; k < n; k++) {
    const c = order[k]!;
    const x = c % w;
    const y = (c - x) / w;
    if (land[c] && landGrid.tryInsert(x, y)) seeds.push(c);
    // The sea pattern is sampled over the whole map and kept only on water, so sea seeds do not
    // pack densely along coastlines.
    if (seaGrid.tryInsert(x, y) && !land[c]) seeds.push(c);
  }
  return seeds;
}

interface Grid {
  tryInsert(x: number, y: number): boolean;
}

/** Background grid with cell size r/sqrt(2): at most one sample per grid cell. */
function makeGrid(r: number, w: number, h: number): Grid {
  const size = r / Math.SQRT2;
  const gw = Math.ceil(w / size);
  const gh = Math.ceil(h / size);
  const cells = new Int32Array(gw * gh).fill(-1);
  const r2 = r * r;
  return {
    tryInsert(x, y) {
      const gx = Math.floor(x / size);
      const gy = Math.floor(y / size);
      if (cells[gy * gw + gx]! >= 0) return false;
      for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++) {
        for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
          const s = cells[yy * gw + xx]!;
          if (s < 0) continue;
          const sx = s % w;
          const sy = (s - sx) / w;
          if ((sx - x) * (sx - x) + (sy - y) * (sy - y) < r2) return false;
        }
      }
      cells[gy * gw + gx] = y * w + x;
      return true;
    },
  };
}

/** Smooth value noise in [0, 1) on a lattice of spacing `scale`, periodic with `period` lattice cells. */
export function valueNoise(x: number, y: number, scale: number, period: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let fx = gx - ix;
  let fy = gy - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = ix % period;
  const y0 = iy % period;
  const x1 = (ix + 1) % period;
  const y1 = (iy + 1) % period;
  const a = hash2(x0, y0);
  const b = hash2(x1, y0);
  const c = hash2(x0, y1);
  const d = hash2(x1, y1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function hash2(x: number, y: number): number {
  let hh = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
  hh ^= hh >>> 16;
  return (hh >>> 0) / 4294967296;
}
