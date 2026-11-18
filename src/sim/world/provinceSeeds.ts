import type { Rng } from '../rng';

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
 * map and is kept only on water, so sea seeds do not pack densely along coastlines. Its radius varies
 * per cell (`seaRadiusAt`, at most `seaRadiusMax`): a candidate is accepted when every earlier sea
 * sample lies at least max(r(candidate), r(sample)) away.
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
  seaRadiusAt: (cell: number) => number,
  seaRadiusMax: number,
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
  const seaGrid = makeVarGrid(seaRadiusMax, w, h);
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
    if (seaGrid.tryInsert(x, y, seaRadiusAt(c)) && kind[c] === KIND_WATER) seeds.push(c);
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

interface VarGrid {
  tryInsert(x: number, y: number, r: number): boolean;
}

/**
 * Background grid for variable radii up to `rMax`: buckets of size rMax hold linked lists of samples,
 * so every sample that can conflict (closer than rMax) lies in the 3x3 buckets around a candidate.
 */
function makeVarGrid(rMax: number, w: number, h: number): VarGrid {
  const gw = Math.ceil(w / rMax);
  const gh = Math.ceil(h / rMax);
  const head = new Int32Array(gw * gh).fill(-1);
  const next: number[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  const sr: number[] = [];
  return {
    tryInsert(x, y, r) {
      if (!(r > 0 && r <= rMax)) throw new Error(`sea radius ${r} outside (0, ${rMax}]`);
      const gx = Math.floor(x / rMax);
      const gy = Math.floor(y / rMax);
      for (let yy = Math.max(0, gy - 1); yy <= Math.min(gh - 1, gy + 1); yy++) {
        for (let xx = Math.max(0, gx - 1); xx <= Math.min(gw - 1, gx + 1); xx++) {
          for (let s = head[yy * gw + xx]!; s >= 0; s = next[s]!) {
            const m = Math.max(r, sr[s]!);
            const dx = sx[s]! - x;
            const dy = sy[s]! - y;
            if (dx * dx + dy * dy < m * m) return false;
          }
        }
      }
      const b = gy * gw + gx;
      next.push(head[b]!);
      head[b] = sx.length;
      sx.push(x);
      sy.push(y);
      sr.push(r);
      return true;
    },
  };
}
