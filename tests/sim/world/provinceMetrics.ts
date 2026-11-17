import { BIOMES, SEA_LEVEL, type Province } from '../../../src/sim/world/types';

/** Rivers at least this wide must separate provinces. */
export const MAJOR_RIVER = 2;
/** Land regions (or biome patches) smaller than this count as enclaves / part of the river. */
export const ENCLAVE_CELLS = 40;

/** 4-connected components of cells where `inSet` holds; -1 outside the set. */
export function components(n: number, w: number, inSet: (i: number) => boolean): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1 || !inSet(s)) continue;
    const id = sizes.length;
    let size = 0;
    comp[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const d of nb) {
        if (d >= 0 && d < n && comp[d] === -1 && inSet(d)) {
          comp[d] = id;
          stack.push(d);
        }
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

/**
 * Land provinces whose non-river cells touch more than one "river region" (4-component of land
 * minus major-river cells). Regions under ENCLAVE_CELLS are slivers cut off by the river and count
 * as part of it.
 */
export function riverViolations(
  height: Float32Array,
  riverMask: Uint8Array,
  provinceOf: Uint16Array,
  provinces: Province[],
  w: number,
): number[] {
  const n = provinceOf.length;
  const free = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! < MAJOR_RIVER;
  const { comp, sizes } = components(n, w, free);
  const regions = provinces.map(() => new Set<number>());
  for (let i = 0; i < n; i++) {
    const k = comp[i]!;
    if (k >= 0 && sizes[k]! >= ENCLAVE_CELLS) regions[provinceOf[i]!]!.add(k);
  }
  return provinces.filter((p) => p.isLand && regions[p.id]!.size > 1).map((p) => p.id);
}

/** Share of each province's cells in its majority biome. */
export function purity(biomes: Uint8Array, provinceOf: Uint16Array, count: number): Float64Array {
  const k = BIOMES.length;
  const counts = new Int32Array(count * k);
  const total = new Int32Array(count);
  for (let i = 0; i < provinceOf.length; i++) {
    const p = provinceOf[i]!;
    counts[p * k + biomes[i]!]!++;
    total[p]!++;
  }
  const out = new Float64Array(count);
  for (let p = 0; p < count; p++) {
    let m = 0;
    for (let b = 0; b < k; b++) m = Math.max(m, counts[p * k + b]!);
    out[p] = m / total[p]!;
  }
  return out;
}

/** Mountain cells outside enclaves (< ENCLAVE_CELLS) whose province is not mountains/hills. */
export function strayMountainCells(biomes: Uint8Array, provinceOf: Uint16Array, provinces: Province[], w: number): number {
  const mountains = BIOMES.indexOf('mountains');
  const { comp, sizes } = components(biomes.length, w, (i) => biomes[i] === mountains);
  let bad = 0;
  for (let i = 0; i < biomes.length; i++) {
    const k = comp[i]!;
    if (k < 0 || sizes[k]! < ENCLAVE_CELLS) continue;
    const b = provinces[provinceOf[i]!]!.biome;
    if (b !== 'mountains' && b !== 'hills') bad++;
  }
  return bad;
}

/**
 * Longest perfectly straight border run: consecutive border edges on one grid line (0/90 degrees)
 * or the exact 45-degree staircase, in cells. Edges touching a cell near the coast or a major river
 * (within one cell, 8-neighbourhood) are ignored.
 */
export function longestStraightBorder(
  height: Float32Array,
  riverMask: Uint8Array,
  provinceOf: Uint16Array,
  w: number,
  h: number,
  long?: Array<{ at: number; kind: string }>,
): { axis: number; diagonal: number; at: number } {
  const n = w * h;
  const land = (i: number): boolean => height[i]! > SEA_LEVEL;
  const major = (i: number): boolean => land(i) && riverMask[i]! >= MAJOR_RIVER;
  const near = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let bad = major(i);
      for (let dy = -1; dy <= 1 && !bad; dy++) {
        for (let dx = -1; dx <= 1 && !bad; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (land(j) !== land(i) || major(j)) bad = true;
        }
      }
      near[i] = bad ? 1 : 0;
    }
  }
  // R: border edge between (x,y) and (x+1,y); D: between (x,y) and (x,y+1); both valid (not near).
  const R = new Uint8Array(n);
  const D = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1 && provinceOf[i] !== provinceOf[i + 1] && !near[i] && !near[i + 1]) R[i] = 1;
      if (y < h - 1 && provinceOf[i] !== provinceOf[i + w] && !near[i] && !near[i + w]) D[i] = 1;
    }
  }
  let axis = 0;
  let diagonal = 0;
  let at = -1;
  const run = new Int32Array(n);
  // Horizontal lines (D edges along x), vertical lines (R edges along y).
  for (const [edge, prev] of [
    [D, 1],
    [R, w],
  ] as const) {
    run.fill(0);
    for (let i = 0; i < n; i++) {
      if (!edge[i]) continue;
      const ok = prev === 1 ? i % w > 0 : i >= w;
      run[i] = (ok ? run[i - prev]! : 0) + 1;
      if (long && run[i] === 13) long.push({ at: i, kind: prev === 1 ? 'horizontal' : 'vertical' });
      if (run[i]! > axis) {
        axis = run[i]!;
        at = i;
      }
    }
  }
  // Staircases: down-right (R at a, D at a+1, next a+w+1) and up-right (R at a, D at a+1-w, next a+1-w).
  for (const dir of [1, -1]) {
    run.fill(0);
    const order = dir === 1 ? [...Array(h).keys()] : [...Array(h).keys()].reverse();
    for (const y of order) {
      for (let x = 0; x < w - 1; x++) {
        const a = y * w + x;
        const ok = dir === 1 ? R[a] && D[a + 1] : y > 0 && R[a] && D[a + 1 - w];
        if (!ok) continue;
        const py = y - dir;
        const prev = x > 0 && py >= 0 && py < h ? run[py * w + x - 1]! : 0;
        run[a] = prev + 1;
        if (long && run[a] === 13) long.push({ at: a, kind: dir === 1 ? 'diag-down' : 'diag-up' });
        if (run[a]! > diagonal) {
          diagonal = run[a]!;
          if (diagonal > axis) at = a;
        }
      }
    }
  }
  return { axis, diagonal, at };
}
