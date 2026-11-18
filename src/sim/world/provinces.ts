import type { BiomeDef } from '../../content/biomes/types';
import type { Rng } from '../rng';
import { BucketQueue } from './bucketQueue';
import { assignCorridor, fixFragments, pruneTendrils, smoothOwners } from './provinceCleanup';
import { mergeProvinces, splitImpure } from './provinceTerrain';
import { jitterBiomes, noiseField } from './provinceNoise';
import { KIND_CORRIDOR, KIND_LAND, KIND_WATER, poissonSeeds } from './provinceSeeds';
import { labelByKey } from '../geom/label';
import { findLakes } from './lakes';
import { SEA_LEVEL } from '../../content/terrainLevels';
import type { Province } from './types';

/** Poisson-disk radius on land, tuned for ~3100-3200 land provinces (mean ~250 cells). */
const LAND_RADIUS = 15.8;
/** Sea provinces are larger: radius x3. */
const SEA_RADIUS = LAND_RADIUS * 3;
/** Land pieces smaller than this merge into a land neighbour (lone islands are exempt). */
const MIN_LAND_CELLS = 40;
/**
 * Sea slivers smaller than this merge into a sea neighbour. Lakes are separate water bodies, so a
 * lake smaller than this ends as a single province.
 */
export const MIN_SEA_CELLS = 800;
/**
 * Target share of a land province's majority biome (spec: at least 80%; the margin absorbs the
 * later border smoothing and river cells).
 */
const MIN_PURITY = 0.84;
const SPEC_PURITY = 0.8;
/** The first minority hand-over never shrinks a province below this many cells. */
const DISSOLVE_KEEP = 50;
/** Every biome patch at least this large gets its own seed; tiny ones then merge as enclaves. */
const MIN_PATCH_CELLS = 1;
/** Rivers at least this wide (riverMask) are hard province borders. */
export const MAJOR_RIVER = 2;

// Growth: key = warped Euclidean distance to the seed + accumulated terrain penalty.
/** Penalty per unit of height climbed (total ascent), so ridges become borders. */
const UPHILL_COST = 120;
/** Crossing a small stream (riverMask 1); major rivers are hard borders instead. */
const RIVER_COST = 0.5;
/**
 * Domain warp of the distance space (simplex fbm; amplitude parameter in cells, base wavelength).
 * Coarse: 2 octaves at 40 cells (non-folding). Fine: 1 octave at 10 cells; it folds in places
 * (about a third of cells have a non-positive warp Jacobian), which is what keeps borders bending
 * every ~10 cells; the 3x3 mode filter and bump pruning then remove the cell-scale noise this
 * leaves, so borders read as smooth wiggly curves.
 */
const WARP_AMP = 4;
const WARP_WAVE = 40;
const FINE_AMP = 7;
const FINE_WAVE = 10;
/**
 * Fine-warp strength on water. Sea borders should read as long smooth curves rather than a
 * ~10-cell saw-tooth, but without the fine octave they collapse into long axis/45° runs
 * (the straight-run test fails at 0, and with a separate non-folding octave), so it is damped.
 */
const SEA_FINE_SCALE = 0.5;
/** Biome-edge jitter (amplitude parameter, wavelength): smooth, non-folding. */
const JITTER_AMP = 2.5;
const JITTER_WAVE = 16;

/** Lower bound of a step length (keeps keys strictly increasing for the bucket queue). */
const MIN_STEP = 0.05;

/**
 * Per-cell class = (kind << KIND_SHIFT) | biome code (land only): biome codes take bits 0-4
 * (MAX_BIOMES = 32), kind bits 5-6, so a class fits a byte with bit 7 free.
 */
const KIND_SHIFT = 5;
const KIND_MASK = 3 << KIND_SHIFT;

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Partitions the map into land and sea provinces (input must be normalised by `normalizeShoreline`).
 * - Major rivers (riverMask >= 2) are hard borders: growth never passes through them; their cells
 *   are handed to one bank at the end.
 * - Land seeds are Poisson-disk samples per biome with a seed in every biome patch, and growth never
 *   leaves its biome patch, so a province has one terrain type and mountain massifs become mountain
 *   provinces; patches too small for a province merge into the neighbour that stays purest.
 * - Growth orders cells by the Euclidean distance to the seed measured in a smoothly domain-warped
 *   space plus the terrain penalty along the growth path (ascent, streams), so borders are smooth
 *   curves at any angle that follow ridges.
 * - Lakes (`lake`, see findLakes) are water bodies of their own: no province mixes lake and sea cells.
 */
export function computeProvinces(
  rng: Rng,
  height: Float32Array,
  biomes: Uint8Array,
  riverMask: Uint8Array,
  w: number,
  h: number,
  defs: readonly BiomeDef[],
  lake: Uint8Array = findLakes(height, w, h),
): { provinceOf: Uint16Array; provinces: Province[] } {
  const trueBiomes = biomes;
  const n = w * h;
  const { kind } = classify(height, riverMask, w, h);
  // Partition by a smoothly jittered biome map so borders along smooth (sometimes straight) biome
  // and relief edges bend too.
  const jitX = noiseField(rng.fork('jitter-x'), w, h, JITTER_WAVE, JITTER_AMP, 2, 2);
  const jitY = noiseField(rng.fork('jitter-y'), w, h, JITTER_WAVE, JITTER_AMP, 2, 2);
  biomes = jitterBiomes(biomes, kind, jitX, jitY, 1, w, h, defs);
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
  // Warped coordinates: distances are Euclidean in this smoothly warped space, so borders are
  // curved bisectors instead of straight lines.
  const wx = noiseField(rng.fork('warp-x'), w, h, WARP_WAVE, WARP_AMP, 2, 4);
  const wy = noiseField(rng.fork('warp-y'), w, h, WARP_WAVE, WARP_AMP, 2, 4);
  // Fine warp octave: keeps borders bending at the scale of a dozen cells; damped on water
  // (land and sea never compete for a cell, so the switch at the coast shows in no border).
  const fx = noiseField(rng.fork('fine-x'), w, h, FINE_WAVE, FINE_AMP, 1);
  const fy = noiseField(rng.fork('fine-y'), w, h, FINE_WAVE, FINE_AMP, 1);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const fine = kind[i] === KIND_WATER ? SEA_FINE_SCALE : 1;
    wx[i] = x + wx[i]! + fine * fx[i]!;
    wy[i] = (i - x) / w + wy[i]! + fine * fy[i]!;
  }
  const owner = grow(seeds, wx, wy, height, biomes, riverMask, kind, w, h);
  const isLand: number[] = seeds.map((s) => (kind[s] === KIND_LAND ? 1 : 0));
  seedUnreached(owner, kind, biomes, isLand, w, h);
  // Class for the 3x3 smoothing (8-neighbourhood): lake and sea water differ, so a lake cell touching
  // the sea diagonally never changes hands. Other passes step only between 4-neighbours, and a lake
  // is a whole 4-connected water body, so they never cross the lake shore.
  const cls = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cls[i] = (kind[i]! << KIND_SHIFT) | (kind[i] === KIND_LAND ? biomes[i]! : lake[i]!);
  }
  // Smooth borders at the cell scale (3x3 mode), then drop remaining 1-cell bumps and tendril tips.
  smoothOwners(owner, cls, w, h);
  pruneTendrils(owner, kind, w, h);
  fixFragments(owner, kind, isLand, w, h);
  const merge = (minPurity: number, greedy: boolean, keepCells: number): void =>
    mergeProvinces(
      owner,
      kind,
      trueBiomes,
      isLand,
      { minLand: MIN_LAND_CELLS, minSea: MIN_SEA_CELLS, minPurity, greedy, keepCells },
      w,
      h,
    );
  merge(MIN_PURITY, false, DISSOLVE_KEEP);
  assignCorridor(owner, kind, isLand, w, h);
  // Guards after river cells joined their banks: purity at the spec level (merges, then minority
  // hand-over without a size floor), reconnect, then greedy whole-province merges for what is left;
  // nothing ends under the minimum size with a land neighbour. Two-biome leftovers (mostly lone
  // islands) split last.
  merge(SPEC_PURITY, false, 0);
  fixFragments(owner, kind, isLand, w, h);
  merge(SPEC_PURITY, true, -1);
  splitImpure(owner, kind, trueBiomes, isLand, SPEC_PURITY, MIN_LAND_CELLS, w, h);
  fixFragments(owner, kind, isLand, w, h);
  return finalize(owner, kind, lake, trueBiomes, defs, isLand.length, w, h);
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

/**
 * Step costs are clamped below BUCKETS / INV_BUCKET_WIDTH (bucketQueue.ts) so the circular bucket
 * array never wraps onto itself.
 */
const MAX_STEP = 40;

/**
 * Multi-source growth (bucket-queue Dijkstra); returns the owning seed index per cell (-1 if
 * unreached). A cell's key for province p is the Euclidean distance to p's seed measured directly
 * in the warped space, plus the terrain penalty accumulated along the growth path (total ascent and
 * stream crossings). The geometric part does not depend on the path, so on uniform terrain the
 * partition is an exact (warped) Voronoi diagram with curved borders at any angle; penalties make
 * borders follow ridges and streams.
 */
function grow(
  seeds: number[],
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
  // All per-cell growth state in one interleaved record (8 x 4 bytes), so a visit touches one
  // cache line instead of one per array: the bucket order jumps across the whole map.
  // Floats: wx, wy, height, key, pen; ints: owner, class, river. Values and their float32
  // rounding are the same as with separate typed arrays.
  const S = 8;
  const buf = new ArrayBuffer(n * S * 4);
  const f = new Float32Array(buf);
  const iv = new Int32Array(buf);
  // Packed per-cell class: kind in bits 5-6, biome (land only) in bits 0-4, bit 7 = finalised.
  // Growth only steps between cells of equal class, i.e. same kind and, on land, same biome.
  const DONE = 0x80;
  for (let i = 0, o = 0; i < n; i++, o += S) {
    f[o] = wx[i]!;
    f[o + 1] = wy[i]!;
    f[o + 2] = height[i]!;
    f[o + 3] = Infinity;
    iv[o + 5] = -1;
    iv[o + 6] = (kind[i]! << KIND_SHIFT) | (kind[i] === KIND_LAND ? biomes[i]! : 0);
    iv[o + 7] = riverMask[i]!;
  }
  const queue = new BucketQueue(n);
  const seedX = new Float32Array(seeds.length);
  const seedY = new Float32Array(seeds.length);
  seeds.forEach((s, p) => {
    f[s * S + 3] = 0;
    iv[s * S + 5] = p;
    seedX[p] = wx[s]!;
    seedY[p] = wy[s]!;
    queue.push(0, s);
  });
  const landCls = KIND_LAND << KIND_SHIFT;
  for (;;) {
    const c = queue.pop();
    if (c < 0) break;
    const co = c * S;
    const cc = iv[co + 6]!;
    if (cc & DONE) continue;
    iv[co + 6] = cc | DONE;
    const p = iv[co + 5]!;
    const isLandCell = (cc & KIND_MASK) === landCls;
    const cx = c % w;
    const cy = (c - cx) / w;
    const px = seedX[p]!;
    const py = seedY[p]!;
    const interior = cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1;
    const hc = f[co + 2]!;
    const rc = iv[co + 7]!;
    const kc = queue.lastKey;
    const pc = f[co + 4]!;
    for (let k = 0; k < 4; k++) {
      const x = cx + DX[k]!;
      const y = cy + DY[k]!;
      if (!interior && (x < 0 || y < 0 || x >= w || y >= h)) continue;
      const d = y * w + x;
      const o = d * S;
      // Same class and not finalised (a finalised cell has bit 7 set, so it never compares equal).
      if (iv[o + 6] !== cc) continue;
      let pd = pc;
      if (isLandCell) {
        pd += UPHILL_COST * Math.max(0, f[o + 2]! - hc);
        const rd = iv[o + 7]!;
        if ((rc > 0) !== (rd > 0)) pd += RIVER_COST * Math.max(rc, rd);
      }
      const fx = f[o]! - px;
      const fy = f[o + 1]! - py;
      const nd = Math.sqrt(fx * fx + fy * fy) + pd;
      if (nd < f[o + 3]!) {
        f[o + 3] = nd;
        f[o + 4] = pd;
        iv[o + 5] = p;
        // Ownership compares the true keys; only the queue priority is clamped to stay monotone
        // (where the warp folds, a neighbour can be closer to the seed than the current cell).
        queue.push(Math.min(kc + MAX_STEP, Math.max(kc + MIN_STEP, nd)), d);
      }
    }
  }
  const owner = new Int32Array(n);
  for (let i = 0; i < n; i++) owner[i] = iv[i * S + 5]!;
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
      for (let k = 0; k < 4; k++) {
        const d = k === 0 ? (x < w - 1 ? c + 1 : -1) : k === 1 ? (x > 0 ? c - 1 : -1) : k === 2 ? c - w : c + w;
        if (d < 0 || d >= n || owner[d] !== -1 || kind[d] !== kind[c]) continue;
        if (kind[c] === KIND_LAND && biomes[d] !== biomes[c]) continue;
        owner[d] = p;
        stack[top++] = d;
      }
    }
  }
}

/** Compacts ids and computes per-province attributes. */
function finalize(
  owner: Int32Array,
  kind: Uint8Array,
  lake: Uint8Array,
  biomes: Uint8Array,
  defs: readonly BiomeDef[],
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
  const k = defs.length;
  const biomeCounts = new Int32Array(m * k);
  const sx = new Float64Array(m);
  const sy = new Float64Array(m);
  const cells = new Int32Array(m);
  const isLand = new Uint8Array(m);
  const isLake = new Uint8Array(m);
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
    isLake[p] = lake[i]!;
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
      water: isLand[p] === 1 ? null : isLake[p] === 1 ? 'lake' : 'sea',
      cellCount: cells[p]!,
      center: { x: cx, y: (c - cx) / w },
      biome: defs[bi]!.id,
      neighbors,
      coastal: isLand[p] === 1 && neighbors.some((q) => isLand[q] === 0),
    });
  }
  return { provinceOf, provinces };
}
