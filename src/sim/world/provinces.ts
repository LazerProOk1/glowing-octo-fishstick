import type { Rng } from '../rng';
import { effectiveLand, labelComponents, poissonSeeds, valueNoise } from './provinceSeeds';
import { BIOMES, HILL_LEVEL, MOUNTAIN_LEVEL, type Province } from './types';

/** Poisson-disk radius on land, tuned so the average land province is ~260 cells. */
const LAND_RADIUS = 14.1;
/** Sea provinces are larger: radius x3. */
const SEA_RADIUS = LAND_RADIUS * 3;
/** Land pieces smaller than this merge into a land neighbour (lone islands are exempt). */
const MIN_LAND_CELLS = 40;
/** Sea slivers smaller than this merge into a sea neighbour. */
const MIN_SEA_CELLS = 800;

// Step cost terms for the multi-source Dijkstra.
const UPHILL_COST = 120;
const HILL_COST = 0.6;
const MOUNTAIN_COST = 2.5;
const RIVER_COST = 2.5;
const NOISE_AMP = 0.45;
/** Side of the periodic noise tile (sampled at two offsets as two noise layers). */
const NOISE_SHIFT = 10;
const NOISE_TILE = 1 << NOISE_SHIFT;
const NOISE_MASK = NOISE_TILE - 1;
/** Lattice spacing of the value noise; NOISE_TILE / NOISE_SCALE is an integer, so the tile is periodic. */
const NOISE_SCALE = NOISE_TILE / 80;

const DX = [1, 0, -1, 0, 1, -1, -1, 1];
const DY = [0, 1, 0, -1, 1, 1, -1, -1];

/**
 * Partitions the map into land and sea provinces. Seeds come from Poisson-disk sampling; regions
 * grow by an 8-neighbour Dijkstra whose step cost rises on slopes, in hills/mountains and across
 * rivers, so borders tend to follow ridges and rivers. A per-province noise term makes borders wander.
 */
export function computeProvinces(
  rng: Rng,
  height: Float32Array,
  biomes: Uint8Array,
  riverMask: Uint8Array,
  w: number,
  h: number,
): { provinceOf: Uint16Array; provinces: Province[] } {
  const land = effectiveLand(height, w, h);
  const seeds = poissonSeeds(rng.fork('seeds'), land, w, h, LAND_RADIUS, SEA_RADIUS);
  const noiseRng = rng.fork('noise');
  // Each province mixes two shared noise layers at its own angle, so neighbours see different noise.
  const noiseCos = new Float64Array(seeds.length);
  const noiseSin = new Float64Array(seeds.length);
  for (let p = 0; p < seeds.length; p++) {
    const a = noiseRng.next() * 2 * Math.PI;
    noiseCos[p] = Math.cos(a);
    noiseSin[p] = Math.sin(a);
  }
  const owner = grow(seeds, noiseCos, noiseSin, height, riverMask, land, w, h);
  const isLand: number[] = seeds.map((s) => land[s]!);
  seedUnreached(owner, land, isLand, w, h);
  pruneTendrils(owner, land, isLand.length, w, h);
  pruneTendrils(owner, land, isLand.length, w, h);
  fixFragments(owner, land, isLand.length, w, h);
  mergeSmall(owner, land, isLand, w, h);
  return finalize(owner, land, biomes, isLand.length, w, h);
}

const INV_BUCKET_WIDTH = 50;
const BUCKETS = 2048;
/** Step costs are clamped below BUCKETS / INV_BUCKET_WIDTH so the circular bucket array never wraps onto itself. */
const MAX_STEP = 40;

/**
 * Monotone bucket priority queue (Dial's algorithm) over a circular array: keys are quantised to
 * 1 / INV_BUCKET_WIDTH; within a bucket, order is LIFO. Every push must be within MAX_STEP of the last pop.
 */
class BucketQueue {
  private readonly lists: number[][] = [];
  private cur = 0;
  private count = 0;
  constructor() {
    for (let i = 0; i < BUCKETS; i++) this.lists.push([]);
  }
  push(key: number, id: number): void {
    this.lists[((key * INV_BUCKET_WIDTH) | 0) & (BUCKETS - 1)]!.push(id);
    this.count++;
  }
  /** Returns the id of an entry with (approximately) minimal key, or -1 when empty. */
  pop(): number {
    if (this.count === 0) return -1;
    for (;;) {
      const list = this.lists[this.cur & (BUCKETS - 1)]!;
      if (list.length > 0) {
        this.count--;
        return list.pop()!;
      }
      this.cur++;
    }
  }
}

/** Multi-source Dijkstra (bucket queue); returns the owning seed index per cell (-1 if unreachable). */
function grow(
  seeds: number[],
  noiseCos: Float64Array,
  noiseSin: Float64Array,
  height: Float32Array,
  riverMask: Uint8Array,
  land: Uint8Array,
  w: number,
  h: number,
): Int32Array {
  const n = w * h;
  const dist = new Float32Array(n).fill(Infinity);
  const owner = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const queue = new BucketQueue();
  const noise = noiseTile();
  seeds.forEach((s, p) => {
    dist[s] = 0;
    owner[s] = p;
    queue.push(0, s);
  });
  for (;;) {
    const c = queue.pop();
    if (c < 0) break;
    if (done[c]) continue;
    done[c] = 1;
    const p = owner[c]!;
    const t = land[c]!;
    const cx = c % w;
    const cy = (c - cx) / w;
    const interior = cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1;
    const hc = height[c]!;
    const rc = riverMask[c]!;
    const dc = dist[c]!;
    const ca = noiseCos[p]!;
    const sa = noiseSin[p]!;
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k]!;
      const y = cy + DY[k]!;
      if (!interior && (x < 0 || y < 0 || x >= w || y >= h)) continue;
      const d = y * w + x;
      if (done[d] || land[d] !== t) continue;
      let step = 1;
      if (k >= 4) {
        // Diagonal: only through a corner shared with same-kind cells.
        if (land[cy * w + x] !== t && land[y * w + cx] !== t) continue;
        step = Math.SQRT2;
      }
      const na = noise[((y & NOISE_MASK) << NOISE_SHIFT) | (x & NOISE_MASK)]!;
      const nb = noise[(((y + NOISE_TILE / 2) & NOISE_MASK) << NOISE_SHIFT) | ((x + NOISE_TILE / 3) & NOISE_MASK)]!;
      let mul = 1 + NOISE_AMP * (ca * na + sa * nb);
      let add = 0;
      if (t) {
        const hd = height[d]!;
        mul *= 1 + UPHILL_COST * Math.max(0, hd - hc);
        if (hd > MOUNTAIN_LEVEL) mul += MOUNTAIN_COST;
        else if (hd > HILL_LEVEL) mul += HILL_COST;
        const rd = riverMask[d]!;
        if ((rc > 0) !== (rd > 0)) add = RIVER_COST * Math.max(rc, rd);
      }
      const nd = dc + Math.min(MAX_STEP, step * mul + add);
      if (nd < dist[d]!) {
        dist[d] = nd;
        owner[d] = p;
        queue.push(nd, d);
      }
    }
  }
  return owner;
}

/** Periodic tile of value noise in [-1, 1]. */
function noiseTile(): Float32Array {
  const period = NOISE_TILE / NOISE_SCALE;
  const tile = new Float32Array(NOISE_TILE * NOISE_TILE);
  for (let y = 0; y < NOISE_TILE; y++) {
    for (let x = 0; x < NOISE_TILE; x++) {
      tile[y * NOISE_TILE + x] = 2 * valueNoise(x, y, NOISE_SCALE, period) - 1;
    }
  }
  return tile;
}

/** Same-kind components without any seed (small islands, lakes) become provinces of their own. */
function seedUnreached(owner: Int32Array, land: Uint8Array, isLand: number[], w: number, h: number): void {
  const n = w * h;
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (owner[s] !== -1) continue;
    const p = isLand.length;
    isLand.push(land[s]!);
    let top = 0;
    stack[top++] = s;
    owner[s] = p;
    while (top > 0) {
      const c = stack[--top]!;
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const d of nb) {
        if (d >= 0 && d < n && owner[d] === -1 && land[d] === land[c]) {
          owner[d] = p;
          stack[top++] = d;
        }
      }
    }
  }
}

/** Most frequent same-kind foreign province among the 4-neighbours of cell c (ties: lowest id), or -1. */
function majorityNeighbor(owner: Int32Array, land: Uint8Array, c: number, w: number, n: number): number {
  const p = owner[c]!;
  const x = c % w;
  const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
  let best = -1;
  let bestCount = 0;
  for (const d of nb) {
    if (d < 0 || d >= n || land[d] !== land[c]) continue;
    const q = owner[d]!;
    if (q === p) continue;
    let cnt = 0;
    for (const e of nb) if (e >= 0 && e < n && owner[e] === q) cnt++;
    if (cnt > bestCount || (cnt === bestCount && q < best)) {
      best = q;
      bestCount = cnt;
    }
  }
  return best;
}

/** Cells with at most one same-province 4-neighbour move to the majority neighbouring province. */
function pruneTendrils(owner: Int32Array, land: Uint8Array, count: number, w: number, h: number): void {
  const n = w * h;
  const size = new Int32Array(count);
  for (let i = 0; i < n; i++) size[owner[i]!]!++;
  for (let c = 0; c < n; c++) {
    const p = owner[c]!;
    if (size[p]! <= 1) continue;
    const x = c % w;
    let same = 0;
    if (x > 0 && owner[c - 1] === p) same++;
    if (x < w - 1 && owner[c + 1] === p) same++;
    if (c >= w && owner[c - w] === p) same++;
    if (c + w < n && owner[c + w] === p) same++;
    if (same > 1) continue;
    const q = majorityNeighbor(owner, land, c, w, n);
    if (q < 0) continue;
    owner[c] = q;
    size[p]!--;
    size[q]!++;
  }
}

/** Keeps the largest 4-connected piece of each province; other pieces join their main foreign neighbour. */
function fixFragments(owner: Int32Array, land: Uint8Array, count: number, w: number, h: number): void {
  const n = w * h;
  for (let iter = 0; iter < 20; iter++) {
    const { comp, sizes } = labelComponents(n, w, h, (a, b) => owner[a] === owner[b]);
    const main = new Int32Array(count).fill(-1);
    const compOwner = new Int32Array(sizes.length);
    for (let i = 0; i < n; i++) compOwner[comp[i]!] = owner[i]!;
    sizes.forEach((s, k) => {
      const p = compOwner[k]!;
      const m = main[p]!;
      if (m < 0 || s > sizes[m]!) main[p] = k;
    });
    const isFragment = (k: number): boolean => main[compOwner[k]!] !== k;
    const border = borderCounts(owner, land, comp, isFragment, w, h);
    if (border.size === 0) return;
    const target = new Map<number, number>();
    for (const [k, counts] of border) target.set(k, pickMax(counts));
    for (let i = 0; i < n; i++) {
      const t = target.get(comp[i]!);
      if (t !== undefined) owner[i] = t;
    }
  }
}

/** For each group g (component or province) with interest(g), counts shared 4-edges with same-kind foreign provinces. */
function borderCounts(
  owner: Int32Array,
  land: Uint8Array,
  group: Int32Array,
  interest: (g: number) => boolean,
  w: number,
  h: number,
): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  const add = (a: number, b: number): void => {
    const g = group[a]!;
    if (!interest(g)) return;
    let m = out.get(g);
    if (!m) out.set(g, (m = new Map()));
    const q = owner[b]!;
    m.set(q, (m.get(q) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = owner[i]!;
      if (x < w - 1 && owner[i + 1] !== p && land[i + 1] === land[i]) {
        add(i, i + 1);
        add(i + 1, i);
      }
      if (y < h - 1 && owner[i + w] !== p && land[i + w] === land[i]) {
        add(i, i + w);
        add(i + w, i);
      }
    }
  }
  return out;
}

function pickMax(counts: Map<number, number>): number {
  let best = -1;
  let bestCount = -1;
  for (const [q, c] of counts) {
    if (c > bestCount || (c === bestCount && q < best)) {
      best = q;
      bestCount = c;
    }
  }
  return best;
}

/** Small provinces join the same-kind neighbour sharing the longest border (lone islands stay). */
function mergeSmall(owner: Int32Array, land: Uint8Array, isLand: number[], w: number, h: number): void {
  const n = w * h;
  const count = isLand.length;
  for (let iter = 0; iter < 50; iter++) {
    const size = new Int32Array(count);
    for (let i = 0; i < n; i++) size[owner[i]!]!++;
    const isSmall = (p: number): boolean =>
      size[p]! > 0 && size[p]! < (isLand[p] ? MIN_LAND_CELLS : MIN_SEA_CELLS);
    const border = borderCounts(owner, land, owner, isSmall, w, h);
    const small = [...border.keys()].sort((a, b) => size[a]! - size[b]! || a - b);
    const touched = new Uint8Array(count);
    const target = new Int32Array(count).fill(-1);
    let merged = 0;
    for (const p of small) {
      const q = pickMax(border.get(p)!);
      if (touched[p] || touched[q]) continue;
      touched[p] = touched[q] = 1;
      target[p] = q;
      merged++;
    }
    if (merged === 0) return;
    for (let i = 0; i < n; i++) {
      const t = target[owner[i]!]!;
      if (t >= 0) owner[i] = t;
    }
  }
}

/** Compacts ids and computes per-province attributes. */
function finalize(
  owner: Int32Array,
  land: Uint8Array,
  biomes: Uint8Array,
  count: number,
  w: number,
  h: number,
): { provinceOf: Uint16Array; provinces: Province[] } {
  const n = w * h;
  const size = new Int32Array(count);
  for (let i = 0; i < n; i++) size[owner[i]!]!++;
  const remap = new Int32Array(count).fill(-1);
  let m = 0;
  for (let p = 0; p < count; p++) if (size[p]! > 0) remap[p] = m++;
  if (m > 65536) throw new Error(`too many provinces: ${m}`);
  const provinceOf = new Uint16Array(n);
  const k = BIOMES.length;
  const biomeCounts = new Int32Array(m * k);
  const sx = new Float64Array(m);
  const sy = new Float64Array(m);
  const cells = new Int32Array(m);
  const isLand = new Uint8Array(m);
  const nbs: Array<Set<number>> = [];
  for (let p = 0; p < m; p++) nbs.push(new Set());
  for (let i = 0; i < n; i++) {
    const p = remap[owner[i]!]!;
    provinceOf[i] = p;
    const x = i % w;
    sx[p] = sx[p]! + x;
    sy[p] = sy[p]! + (i - x) / w;
    cells[p]!++;
    isLand[p] = land[i]!;
    biomeCounts[p * k + biomes[i]!]!++;
  }
  const best = new Float64Array(m).fill(Infinity);
  const centerCell = new Int32Array(m);
  for (let i = 0; i < n; i++) {
    const p = provinceOf[i]!;
    const x = i % w;
    const y = (i - x) / w;
    if (x < w - 1 && provinceOf[i + 1] !== p) {
      nbs[p]!.add(provinceOf[i + 1]!);
      nbs[provinceOf[i + 1]!]!.add(p);
    }
    if (y < h - 1 && provinceOf[i + w] !== p) {
      nbs[p]!.add(provinceOf[i + w]!);
      nbs[provinceOf[i + w]!]!.add(p);
    }
    const dx = x - sx[p]! / cells[p]!;
    const dy = y - sy[p]! / cells[p]!;
    const d = dx * dx + dy * dy;
    if (d < best[p]!) {
      best[p] = d;
      centerCell[p] = i;
    }
  }
  const provinces: Province[] = [];
  for (let p = 0; p < m; p++) {
    let bi = 0;
    for (let b = 1; b < k; b++) if (biomeCounts[p * k + b]! > biomeCounts[p * k + bi]!) bi = b;
    const neighbors = [...nbs[p]!].sort((a, b) => a - b);
    const c = centerCell[p]!;
    const cx = c % w;
    provinces.push({
      id: p,
      isLand: isLand[p] === 1,
      cellCount: cells[p]!,
      center: { x: cx, y: (c - cx) / w },
      biome: BIOMES[bi]!,
      neighbors,
      coastal: isLand[p] === 1 && neighbors.some((q) => isLand[q] === 0),
    });
  }
  return { provinceOf, provinces };
}
