import { KIND_CORRIDOR as KIND_CORRIDOR_ } from './provinceSeeds';
import { BIOME_SLOTS as BIOME_SLOTS_, borderCounts } from './provinceCleanup';

// Imported constants copied to module locals (cheap access in hot loops under module transforms).
const KIND_CORRIDOR = KIND_CORRIDOR_;
const BIOME_SLOTS = BIOME_SLOTS_;

/** Terrain-purity and border-shape passes over a province ownership grid (see provinces.ts). */

/**
 * Land provinces whose majority biome covers less than `minPurity` of their cells join the land
 * neighbour that makes the union purest, when the union reaches `minPurity` (e.g. a small tundra
 * province that absorbed a glacier enclave joins a bigger tundra neighbour). With `allowDissolve`,
 * provinces no merge can fix hand minority cells to neighbours (may split them: run fixFragments).
 */
export function mergeImpure(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  isLand: number[],
  minPurity: number,
  allowDissolve: boolean,
  w: number,
  h: number,
): void {
  const n = w * h;
  const count = isLand.length;
  const dissolve = new Set<number>();
  for (let iter = 0; iter < 8; iter++) {
    dissolve.clear();
    const size = new Int32Array(count);
    const bc = new Int32Array(count * BIOME_SLOTS);
    for (let i = 0; i < n; i++) {
      const p = owner[i]!;
      if (p < 0) continue;
      size[p]!++;
      bc[p * BIOME_SLOTS + biomes[i]!]!++;
    }
    const purity = (p: number, q: number): number => {
      let m = 0;
      for (let b = 0; b < BIOME_SLOTS; b++) {
        m = Math.max(m, bc[p * BIOME_SLOTS + b]! + (q >= 0 ? bc[q * BIOME_SLOTS + b]! : 0));
      }
      return m / (size[p]! + (q >= 0 ? size[q]! : 0));
    };
    const impure = (p: number): boolean => p >= 0 && isLand[p] === 1 && size[p]! > 0 && purity(p, -1) < minPurity;
    const border = borderCounts(owner, kind, owner, impure, w, h);
    const target = new Int32Array(count).fill(-1);
    const absorbs = new Uint8Array(count);
    let merged = 0;
    for (const p of [...border.keys()].sort((a, b) => a - b)) {
      let q = -1;
      let best = minPurity;
      for (const cand of [...border.get(p)!.keys()].sort((a, b) => a - b)) {
        const pur = purity(p, cand);
        if (pur >= best && (q < 0 || pur > best)) {
          q = cand;
          best = pur;
        }
      }
      if (q < 0) {
        dissolve.add(p);
        continue;
      }
      if (absorbs[p] || target[q]! >= 0) continue;
      absorbs[q] = 1;
      target[p] = q;
      merged++;
    }
    if (merged === 0) break;
    for (let i = 0; i < n; i++) {
      const p = owner[i]!;
      if (p >= 0 && target[p]! >= 0) owner[i] = target[p]!;
    }
  }
  if (allowDissolve && dissolve.size > 0) dissolveMinority(owner, kind, biomes, dissolve, count, w, h);
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
    const moves: Array<[number, number]> = [];
    const rest: number[] = [];
    for (const c of cells) {
      const p = owner[c]!;
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      let target = -1;
      for (const d of nb) {
        if (d < 0 || d >= n || kind[d] !== kind[c]) continue;
        const q = owner[d]!;
        if (q >= 0 && q !== p && dom[q] === biomes[c]) {
          target = q;
          break;
        }
      }
      if (target >= 0) moves.push([c, target]);
      else rest.push(c);
    }
    let moved = 0;
    for (const [c, q] of moves) {
      const p = owner[c]!;
      if (size[p]! <= DISSOLVE_KEEP) {
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

/** dissolveMinority never shrinks a province below this many cells (stays above the 40 minimum). */
const DISSOLVE_KEEP = 50;

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
 * Final roughening: along every horizontal or vertical grid line, a border run longer than
 * `maxRun` edges gets a one-cell notch in its middle (the cell on one side joins the province on
 * the other side), so no border keeps a perfectly straight 0/90-degree stretch. A cell only moves
 * between provinces of its own kind, and a mountain cell only into a province dominated by
 * mountains or hills. Run fixFragments afterwards.
 */
export function breakStraightRuns(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  isRelief: (b: number) => boolean,
  isMountain: (b: number) => boolean,
  count: number,
  maxRun: number,
  w: number,
  h: number,
): void {
  const n = w * h;
  const dom = dominantBiomes(owner, biomes, count, n);
  const canMove = (c: number, to: number): boolean =>
    to >= 0 && owner[c]! >= 0 && (!isMountain(biomes[c]!) || isRelief(dom[to]!));
  const notch = (a: number, b: number): void => {
    // a and b are the two cells across the middle edge of the run.
    if (canMove(a, owner[b]!)) owner[a] = owner[b]!;
    else if (canMove(b, owner[a]!)) owner[b] = owner[a]!;
  };
  const edge = (a: number, b: number): boolean =>
    owner[a] !== owner[b] && owner[a]! >= 0 && owner[b]! >= 0 && kind[a] === kind[b] && kind[a] !== KIND_CORRIDOR;
  // Horizontal lines: edges between (x, y) and (x, y + 1).
  for (let y = 0; y < h - 1; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      const a = y * w + x;
      run = edge(a, a + w) ? run + 1 : 0;
      if (run > maxRun) {
        const m = a - (run >> 1);
        notch(m, m + w);
        run = 0;
      }
    }
  }
  // Vertical lines: edges between (x, y) and (x + 1, y).
  for (let x = 0; x < w - 1; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) {
      const a = y * w + x;
      run = edge(a, a + 1) ? run + 1 : 0;
      if (run > maxRun) {
        const m = a - (run >> 1) * w;
        notch(m, m + 1);
        run = 0;
      }
    }
  }
}
