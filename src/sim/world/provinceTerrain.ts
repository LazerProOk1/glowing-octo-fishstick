import { BIOME_SLOTS as BIOME_SLOTS_, MergeGraph, mergeSmallOn } from './provinceCleanup';

// Imported constants copied to module locals (cheap access in hot loops under module transforms).
const BIOME_SLOTS = BIOME_SLOTS_;

/** Terrain-purity passes over a province ownership grid (see provinces.ts). */


export interface MergeOptions {
  minLand: number;
  minSea: number;
  /** Target share of a land province's majority biome. */
  minPurity: number;
  /** Take the purest union even below the target when it beats the province alone. */
  greedy: boolean;
  /** Minority hand-over for provinces still impure: keep at least this many cells; -1 = skip. */
  keepCells: number;
}

/**
 * One merge pass on a province graph built once from the grid:
 * 1. provinces under the minimum size join their purest neighbour (lone islands stay);
 * 2. land provinces below `minPurity` join the neighbour that makes the union purest when the union
 *    reaches the target (with `greedy`, also when it merely beats the province alone);
 * 3. small provinces again; then the ownership grid is relabelled.
 * Provinces still impure hand minority cells to neighbours dominated by that biome (unless
 * `keepCells` is -1); that may split them, so run fixFragments afterwards.
 */
export function mergeProvinces(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  isLand: number[],
  opt: MergeOptions,
  w: number,
  h: number,
): void {
  const count = isLand.length;
  const g = new MergeGraph(owner, kind, biomes, count, w, h);
  mergeSmallOn(g, isLand, opt.minLand, opt.minSea);
  const stuck = new Set<number>();
  for (let round = 0; round < 30; round++) {
    let merged = 0;
    stuck.clear();
    for (let p = 0; p < count; p++) {
      if (!isLand[p] || g.find(p) !== p || g.size[p] === 0 || g.purity(p) >= opt.minPurity) continue;
      let q = -1;
      let best = opt.minPurity;
      for (const [cand] of g.neighbors(p)) {
        const pur = g.purity(p, cand);
        if (pur >= best && (q < 0 || pur > best)) {
          q = cand;
          best = pur;
        }
      }
      if (q < 0 && opt.greedy) {
        let bestPur = g.purity(p) + 1e-9;
        for (const [cand] of g.neighbors(p)) {
          const pur = g.purity(p, cand);
          if (pur > bestPur) {
            q = cand;
            bestPur = pur;
          }
        }
      }
      if (q < 0) stuck.add(p);
      else {
        g.merge(p, q);
        merged++;
      }
    }
    if (merged === 0) break;
  }
  mergeSmallOn(g, isLand, opt.minLand, opt.minSea);
  g.apply(owner);
  if (opt.keepCells >= 0 && stuck.size > 0) {
    const roots = new Set([...stuck].map((p) => g.find(p)));
    dissolveMinority(owner, kind, biomes, roots, count, opt.keepCells, w, h);
  }
}

/**
 * For impure provinces no merge can fix: their cells of a non-dominant biome move, layer by layer,
 * to an adjacent province dominated by that biome. Run fixFragments afterwards.
 */
function dissolveMinority(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  set: Set<number>,
  count: number,
  keepCells: number,
  w: number,
  h: number,
): void {
  const n = w * h;
  const dom = dominantBiomes(owner, biomes, count, n);
  const size = new Int32Array(count);
  for (let i = 0; i < n; i++) if (owner[i]! >= 0) size[owner[i]!]!++;
  // Only cells of the listed provinces can move; collect them once.
  let cells: number[] = [];
  for (let i = 0; i < n; i++) if (set.has(owner[i]!) && biomes[i] !== dom[owner[i]!]) cells.push(i);
  for (let pass = 0; pass < 40 && cells.length > 0; pass++) {
    const moves: number[] = [];
    const rest: number[] = [];
    for (const c of cells) {
      const p = owner[c]!;
      const x = c % w;
      let target = -1;
      for (let k = 0; k < 4 && target < 0; k++) {
        const d = k === 0 ? (x < w - 1 ? c + 1 : -1) : k === 1 ? (x > 0 ? c - 1 : -1) : k === 2 ? c - w : c + w;
        if (d < 0 || d >= n || kind[d] !== kind[c]) continue;
        const q = owner[d]!;
        if (q >= 0 && q !== p && dom[q] === biomes[c]) target = q;
      }
      if (target >= 0) moves.push(c, target);
      else rest.push(c);
    }
    let moved = 0;
    for (let m = 0; m < moves.length; m += 2) {
      const c = moves[m]!;
      const q = moves[m + 1]!;
      const p = owner[c]!;
      if (size[p]! <= keepCells) {
        rest.push(c);
        continue;
      }
      owner[c] = q;
      size[p]!--;
      size[q]!++;
      moved++;
    }
    if (moved === 0) return;
    cells = rest;
  }
}

export function dominantBiomes(owner: Int32Array, biomes: Uint8Array, count: number, n: number): Int32Array {
  const counts = new Int32Array(count * BIOME_SLOTS);
  for (let i = 0; i < n; i++) if (owner[i]! >= 0) counts[owner[i]! * BIOME_SLOTS + biomes[i]!]!++;
  const out = new Int32Array(count);
  for (let p = 0; p < count; p++) {
    let best = 0;
    for (let b = 1; b < BIOME_SLOTS; b++) if (counts[p * BIOME_SLOTS + b]! > counts[p * BIOME_SLOTS + best]!) best = b;
    out[p] = best;
  }
  return out;
}

/**
 * A land province still below `minPurity` after the merges (a lone island cannot merge at all; on
 * small maps biome patches are coarse relative to provinces, so a few inland ones stay mixed too)
 * that has two biomes of at least `minCells` cells each is split: the largest connected patch of
 * its second biome becomes a province of its own when both parts keep `minCells` cells.
 * Run fixFragments afterwards.
 */
export function splitImpure(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  isLand: number[],
  minPurity: number,
  minCells: number,
  w: number,
  h: number,
): void {
  const n = w * h;
  const count = isLand.length;
  const g = new MergeGraph(owner, kind, biomes, count, w, h);
  const cells = new Map<number, number[]>();
  for (let p = 0; p < count; p++) {
    if (!isLand[p] || g.size[p] === 0 || g.purity(p) >= minPurity) continue;
    const order = [...Array(BIOME_SLOTS).keys()].sort(
      (a, b) => g.bc[p * BIOME_SLOTS + b]! - g.bc[p * BIOME_SLOTS + a]! || a - b,
    );
    if (g.bc[p * BIOME_SLOTS + order[1]!]! < minCells) continue;
    cells.set(p, [order[1]!]);
  }
  if (cells.size === 0) return;
  // Largest 4-connected patch of the second biome inside each such island.
  const seen = new Uint8Array(n);
  const best = new Map<number, number[]>();
  for (let s = 0; s < n; s++) {
    const p = owner[s]!;
    const target = cells.get(p);
    if (!target || seen[s] || biomes[s] !== target[0]) continue;
    const comp: number[] = [s];
    seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k]!;
      const x = c % w;
      for (let j = 0; j < 4; j++) {
        const d = j === 0 ? (x < w - 1 ? c + 1 : -1) : j === 1 ? (x > 0 ? c - 1 : -1) : j === 2 ? c - w : c + w;
        if (d < 0 || d >= n || seen[d] || owner[d] !== p || biomes[d] !== target[0]) continue;
        seen[d] = 1;
        comp.push(d);
      }
    }
    if (comp.length > (best.get(p)?.length ?? 0)) best.set(p, comp);
  }
  for (const [p, comp] of [...best].sort((a, b) => a[0] - b[0])) {
    if (comp.length < minCells || g.size[p]! - comp.length < minCells) continue;
    const q = isLand.length;
    isLand.push(1);
    for (const c of comp) owner[c] = q;
  }
}
