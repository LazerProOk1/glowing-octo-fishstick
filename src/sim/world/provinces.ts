import type { Rng } from '../rng';
import { assignCorridor, fixFragments, jitterOwners, mergeSmall, pruneTendrils } from './provinceCleanup';
import { breakStraightRuns, mergeImpure } from './provinceTerrain';
import { jitterBiomes, noiseField } from './provinceNoise';
import { KIND_CORRIDOR as KIND_CORRIDOR_, KIND_LAND as KIND_LAND_, KIND_WATER as KIND_WATER_, labelByKey, poissonSeeds } from './provinceSeeds';
import { BIOMES, HILL_LEVEL as HILL_LEVEL_, MOUNTAIN_LEVEL as MOUNTAIN_LEVEL_, SEA_LEVEL as SEA_LEVEL_, type Province } from './types';

// Imported constants copied to module locals: in hot loops, live import bindings can be slow
// (e.g. under Vite/Vitest module transforms).
const KIND_CORRIDOR = KIND_CORRIDOR_;
const KIND_LAND = KIND_LAND_;
const KIND_WATER = KIND_WATER_;
const HILL_LEVEL = HILL_LEVEL_;
const MOUNTAIN_LEVEL = MOUNTAIN_LEVEL_;
const SEA_LEVEL = SEA_LEVEL_;

/** Poisson-disk radius on land, tuned for ~3100-3200 land provinces (mean ~250 cells). */
const LAND_RADIUS = 15.8;
/** Sea provinces are larger: radius x3. */
const SEA_RADIUS = LAND_RADIUS * 3;
/** Land pieces smaller than this merge into a land neighbour (lone islands are exempt). */
const MIN_LAND_CELLS = 40;
/** Sea slivers smaller than this merge into a sea neighbour. */
const MIN_SEA_CELLS = 800;
/** Longest allowed perfectly straight 0/90-degree border run (cells). */
const MAX_STRAIGHT = 10;
const mountainCode = BIOMES.indexOf('mountains');
const hillsCode = BIOMES.indexOf('hills');
/**
 * Target share of a land province's majority biome (spec: at least 80%; the margin absorbs later
 * notches and river cells).
 */
const MIN_PURITY = 0.84;
const SPEC_PURITY = 0.8;
/** Every biome patch at least this large gets its own seed; tiny ones then merge as enclaves. */
const MIN_PATCH_CELLS = 1;
/** Rivers at least this wide (riverMask) are hard province borders. */
const MAJOR_RIVER = 2;

// Step cost terms for the multi-source Dijkstra.
const UPHILL_COST = 120;
const HILL_COST = 0.6;
const MOUNTAIN_COST = 2.5;
/** Crossing a small stream (riverMask 1); major rivers are hard borders instead. */
const RIVER_COST = 0.5;
/** Shared cost noise (simplex fbm) added to the step multiplier: amplitude, wavelength in cells. */
const NOISE_AMP = 0.4;
const NOISE_WAVE = 12;
/** Domain-warp displacement in cells on land (the sea uses SEA_WARP_SCALE times more). */
const WARP_AMP = 8;
const WARP_WAVE = 32;
const SEA_WARP_SCALE = 2;
/** Cell-scale jitter of biome edges and of ownership after growth (amplitude, wavelength in cells). */
const JITTER_AMP = 5;
const JITTER_WAVE = 5;
/** Biome-edge jitter uses this fraction of the jitter displacement (keeps terrain purity high). */
const BIOME_JITTER_SCALE = 0.5;

/** Lower bound of a step length (keeps keys strictly increasing for the bucket queue). */
const MIN_STEP = 0.05;

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Partitions the map into land and sea provinces (input must be normalised by `normalizeShoreline`).
 * - Major rivers (riverMask >= 2) are hard borders: growth never passes through them; their cells
 *   are handed to one bank at the end.
 * - Land seeds are Poisson-disk samples per biome with a seed in every biome patch, and growth never
 *   leaves its biome patch, so a province has one terrain type and mountain massifs become mountain
 *   provinces; patches too small for a province merge into the neighbour that stays purest.
 * - Growth is a 4-neighbour Dijkstra whose step is the growth of the Euclidean distance to the
 *   seed measured in a smoothly domain-warped space, times a shared noise field and terrain factors
 *   (slopes, hills/mountains, streams), so borders are wiggly curves following relief.
 */
export function computeProvinces(
  rng: Rng,
  height: Float32Array,
  biomes: Uint8Array,
  riverMask: Uint8Array,
  w: number,
  h: number,
): { provinceOf: Uint16Array; provinces: Province[] } {
  const trueBiomes = biomes;
  const n = w * h;
  const { kind } = classify(height, riverMask, w, h);
  // Partition by a slightly jittered biome map so borders along smooth (sometimes straight) biome
  // and relief edges wiggle too.
  // Cell-scale jitter field, shared by the biome-edge jitter and the ownership jitter.
  const jitX = noiseField(rng.fork('jitter-x'), w, h, JITTER_WAVE, JITTER_AMP);
  const jitY = noiseField(rng.fork('jitter-y'), w, h, JITTER_WAVE, JITTER_AMP);
  biomes = jitterBiomes(biomes, kind, jitX, jitY, BIOME_JITTER_SCALE, w, h);
  // Biome patches: 4-connected land cells of one biome (other kinds get keys that never match land).
  const patchKey = new Int32Array(n);
  for (let i = 0; i < n; i++) patchKey[i] = kind[i] === KIND_LAND ? biomes[i]! : -1 - kind[i]!;
  const patches = labelByKey(patchKey, w, h);
  const seeds = poissonSeeds(
    rng.fork('seeds'),
    kind,
    biomes,
    patches.comp,
    patches.sizes,
    MIN_PATCH_CELLS,
    w,
    h,
    LAND_RADIUS,
    SEA_RADIUS,
  );
  const costNoise = noiseField(rng.fork('cost-noise'), w, h, NOISE_WAVE, NOISE_AMP);
  // Warped coordinates: distances are Euclidean in this smoothly warped space, so borders are
  // curved bisectors instead of straight lines.
  const wx = noiseField(rng.fork('warp-x'), w, h, WARP_WAVE, WARP_AMP);
  const wy = noiseField(rng.fork('warp-y'), w, h, WARP_WAVE, WARP_AMP);
  for (let i = 0; i < n; i++) {
    const s = kind[i] === KIND_WATER ? SEA_WARP_SCALE : 1;
    const x = i % w;
    wx[i] = x + s * wx[i]!;
    wy[i] = (i - x) / w + s * wy[i]!;
  }
  for (let i = 0; i < n; i++) costNoise[i] = 1 + costNoise[i]!;
  const owner = grow(seeds, costNoise, wx, wy, height, biomes, riverMask, kind, w, h);
  const isLand: number[] = seeds.map((s) => (kind[s] === KIND_LAND ? 1 : 0));
  seedUnreached(owner, kind, biomes, isLand, w, h);
  const cls = new Uint8Array(n);
  for (let i = 0; i < n; i++) cls[i] = (kind[i]! << 4) | (kind[i] === KIND_LAND ? biomes[i]! : 0);
  jitterOwners(owner, cls, jitX, jitY, w, h);
  pruneTendrils(owner, kind, isLand.length, w, h);
  pruneTendrils(owner, kind, isLand.length, w, h);
  fixFragments(owner, kind, isLand, w, h);
  mergeSmall(owner, kind, trueBiomes, isLand, MIN_LAND_CELLS, MIN_SEA_CELLS, w, h);
  const isMountain = (b: number): boolean => b === mountainCode;
  const isRelief = (b: number): boolean => b === mountainCode || b === hillsCode;
  breakStraightRuns(owner, kind, trueBiomes, isRelief, isMountain, isLand.length, MAX_STRAIGHT, w, h);
  // Notches can leave a few pieces under the minimum size.
  mergeSmall(owner, kind, trueBiomes, isLand, MIN_LAND_CELLS, MIN_SEA_CELLS, w, h);
  mergeImpure(owner, kind, trueBiomes, isLand, MIN_PURITY, true, w, h);
  fixFragments(owner, kind, isLand, w, h);
  assignCorridor(owner, kind, isLand, w, h);
  // Last guard after river cells joined their banks: whole-province merges only (stay connected).
  mergeImpure(owner, kind, trueBiomes, isLand, SPEC_PURITY, false, w, h);
  return finalize(owner, kind, trueBiomes, isLand.length, w, h);
}

/**
 * Cell kinds. Corridor = land cells of major rivers plus land pockets cut off by them (or by river
 * and coast) that are too small for a province.
 */
function classify(height: Float32Array, riverMask: Uint8Array, w: number, h: number): { kind: Uint8Array } {
  const n = w * h;
  const kind = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (height[i]! <= SEA_LEVEL) kind[i] = KIND_WATER;
    else kind[i] = riverMask[i]! >= MAJOR_RIVER ? KIND_CORRIDOR : KIND_LAND;
  }
  const lab = labelByKey(Int32Array.from(kind), w, h);
  const touchesCorridor = new Uint8Array(lab.sizes.length);
  for (let i = 0; i < n; i++) {
    if (kind[i] !== KIND_CORRIDOR) continue;
    const x = i % w;
    if (x > 0) touchesCorridor[lab.comp[i - 1]!] = 1;
    if (x < w - 1) touchesCorridor[lab.comp[i + 1]!] = 1;
    if (i >= w) touchesCorridor[lab.comp[i - w]!] = 1;
    if (i + w < n) touchesCorridor[lab.comp[i + w]!] = 1;
  }
  for (let i = 0; i < n; i++) {
    const k = lab.comp[i]!;
    if (kind[i] === KIND_LAND && touchesCorridor[k] && lab.sizes[k]! < MIN_LAND_CELLS) kind[i] = KIND_CORRIDOR;
  }
  return { kind };
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

/** Multi-source Dijkstra (bucket queue); returns the owning seed index per cell (-1 if unreached). */
function grow(
  seeds: number[],
  stepMul: Float32Array,
  wx: Float32Array,
  wy: Float32Array,
  height: Float32Array,
  biomes: Uint8Array,
  riverMask: Uint8Array,
  kind: Uint8Array,
  w: number,
  h: number,
): Int32Array {
  const n = w * h;
  const dist = new Float32Array(n).fill(Infinity);
  const owner = new Int32Array(n).fill(-1);
  // Packed per-cell class: kind in bits 4-5, biome (land only) in bits 0-3, bit 7 = finalised.
  // Growth only steps between cells of equal class, i.e. same kind and, on land, same biome.
  const DONE = 0x80;
  const cls = new Uint8Array(n);
  for (let i = 0; i < n; i++) cls[i] = (kind[i]! << 4) | (kind[i] === KIND_LAND ? biomes[i]! : 0);
  const queue = new BucketQueue();
  seeds.forEach((s, p) => {
    dist[s] = 0;
    owner[s] = p;
    queue.push(0, s);
  });
  const landCls = KIND_LAND << 4;
  const seedX = new Float32Array(seeds.length);
  const seedY = new Float32Array(seeds.length);
  seeds.forEach((s, p) => {
    seedX[p] = wx[s]!;
    seedY[p] = wy[s]!;
  });
  for (;;) {
    const c = queue.pop();
    if (c < 0) break;
    const cc = cls[c]!;
    if (cc & DONE) continue;
    cls[c] = cc | DONE;
    const p = owner[c]!;
    const isLandCell = (cc & 0x30) === landCls;
    const cx = c % w;
    const cy = (c - cx) / w;
    const px = seedX[p]!;
    const py = seedY[p]!;
    const ex = wx[c]! - px;
    const ey = wy[c]! - py;
    const ec = Math.sqrt(ex * ex + ey * ey);
    const interior = cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1;
    const hc = height[c]!;
    const rc = riverMask[c]!;
    const dc = dist[c]!;
    for (let k = 0; k < 4; k++) {
      const x = cx + DX[k]!;
      const y = cy + DY[k]!;
      if (!interior && (x < 0 || y < 0 || x >= w || y >= h)) continue;
      const d = y * w + x;
      // Same class and not finalised (a finalised cell has bit 7 set, so it never compares equal).
      if (cls[d] !== cc) continue;
      // Step length = growth of the (warped-space) Euclidean distance to the province's seed. These
      // increments telescope along monotone paths, so on uniform terrain distances are Euclidean
      // even with 4 neighbours and borders are smooth curved bisectors, not the 0/45/90-degree
      // segments of a grid (octile) metric.
      const fx = wx[d]! - px;
      const fy = wy[d]! - py;
      const step = Math.max(MIN_STEP, Math.sqrt(fx * fx + fy * fy) - ec);
      let mul = stepMul[d]!;
      let add = 0;
      if (isLandCell) {
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

/** Unseeded same-kind (and, on land, same-biome) components become provinces; corridor stays -1. */
function seedUnreached(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  isLand: number[],
  w: number,
  h: number,
): void {
  const n = w * h;
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (owner[s] !== -1 || kind[s] === KIND_CORRIDOR) continue;
    const p = isLand.length;
    isLand.push(kind[s] === KIND_LAND ? 1 : 0);
    let top = 0;
    stack[top++] = s;
    owner[s] = p;
    while (top > 0) {
      const c = stack[--top]!;
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const d of nb) {
        if (d >= 0 && d < n && owner[d] === -1 && kind[d] === kind[c] && (kind[c] !== KIND_LAND || biomes[d] === biomes[c])) {
          owner[d] = p;
          stack[top++] = d;
        }
      }
    }
  }
}

/** Compacts ids and computes per-province attributes. */
function finalize(
  owner: Int32Array,
  kind: Uint8Array,
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
    isLand[p] = kind[i] === KIND_WATER ? 0 : 1;
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
