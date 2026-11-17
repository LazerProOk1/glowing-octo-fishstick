import type { Rng } from '../rng';

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

/** 4-connected components of equal `key` values (fast path of labelComponents). */
export function labelByKey(key: Int32Array, w: number, h: number): { comp: Int32Array; sizes: number[] } {
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const id = sizes.length;
    const k = key[s]!;
    let size = 0;
    let top = 0;
    stack[top++] = s;
    comp[s] = id;
    while (top > 0) {
      const c = stack[--top]!;
      size++;
      const x = c % w;
      if (x > 0 && comp[c - 1] === -1 && key[c - 1] === k) {
        comp[c - 1] = id;
        stack[top++] = c - 1;
      }
      if (x < w - 1 && comp[c + 1] === -1 && key[c + 1] === k) {
        comp[c + 1] = id;
        stack[top++] = c + 1;
      }
      if (c >= w && comp[c - w] === -1 && key[c - w] === k) {
        comp[c - w] = id;
        stack[top++] = c - w;
      }
      if (c + w < n && comp[c + w] === -1 && key[c + w] === k) {
        comp[c + w] = id;
        stack[top++] = c + w;
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

/** Cell kinds used by the province partition. */
export const KIND_WATER = 0;
export const KIND_LAND = 1;
/** Land cells that provinces never grow through: major rivers and tiny pockets cut off by them. */
export const KIND_CORRIDOR = 2;

/**
 * Maximal Poisson-disk sampling by random sequential adsorption: cells are visited in a random
 * order (on a stride-2 lattice) and accepted when no earlier sample of the same pattern lies closer
 * than its radius.
 * Land uses one pattern per biome over cells of biome patches with at least `minPatch` cells, and
 * every such patch is guaranteed a seed (its first visited cell). The sea pattern covers the whole
 * map and is kept only on water, so sea seeds do not pack densely along coastlines.
 */
export function poissonSeeds(
  rng: Rng,
  kind: Uint8Array,
  biomes: Uint8Array,
  patch: Int32Array,
  patchSizes: number[],
  minPatch: number,
  w: number,
  h: number,
  landRadius: number,
  seaRadius: number,
): number[] {
  // Candidates: every second cell in x and y (seed positions need no finer resolution; biome
  // patches without a candidate get a province from the unseeded-component pass instead).
  const gw = Math.ceil(w / 2);
  const n = gw * Math.ceil(h / 2);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = 2 * Math.floor(i / gw) * w + 2 * (i % gw);
  // Fisher-Yates with an inline xorshift32 seeded from rng (much cheaper than rng calls per cell).
  let st = rng.int(1, 0x7fffffff);
  for (let i = n - 1; i > 0; i--) {
    st ^= st << 13;
    st ^= st >>> 17;
    st ^= st << 5;
    const j = (st >>> 0) % (i + 1);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  const landGrids: Array<Grid | undefined> = [];
  const seaGrid = makeGrid(seaRadius, w, h);
  const firstCell = new Int32Array(patchSizes.length).fill(-1);
  const seeded = new Uint8Array(patchSizes.length);
  const seeds: number[] = [];
  for (let k = 0; k < n; k++) {
    const c = order[k]!;
    const x = c % w;
    const y = (c - x) / w;
    if (kind[c] === KIND_LAND) {
      const pc = patch[c]!;
      if (patchSizes[pc]! >= minPatch) {
        if (firstCell[pc] === -1) firstCell[pc] = c;
        const b = biomes[c]!;
        let g = landGrids[b];
        if (!g) landGrids[b] = g = makeGrid(landRadius, w, h);
        if (g.tryInsert(x, y)) {
          seeds.push(c);
          seeded[pc] = 1;
        }
      }
    }
    if (seaGrid.tryInsert(x, y) && kind[c] === KIND_WATER) seeds.push(c);
  }
  for (let pc = 0; pc < patchSizes.length; pc++) {
    if (firstCell[pc] !== -1 && !seeded[pc]) seeds.push(firstCell[pc]!);
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
