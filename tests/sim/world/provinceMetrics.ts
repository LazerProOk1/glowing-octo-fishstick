import type { BiomeDef } from '../../../src/content/biomes/types';
import { hasTag } from '../../../src/content/registry';
import { SIZE_PRESETS } from '../../../src/sim/world/params';
import type { Province } from '../../../src/sim/world/types';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';

/** Land share the terrain generator aims for (TARGET_LAND in heightmap.ts). */
const LAND_SHARE = 0.38;
const MEDIUM_AREA = SIZE_PRESETS.medium.w * SIZE_PRESETS.medium.h;

/**
 * Province count bounds proportional to the land (and sea) area: for medium (38% land) that is
 * 2000–4000 land and 150–560 sea provinces; for small and large, in proportion to their areas.
 */
export function provinceBounds(height: Float32Array, w: number, h: number): { land: [number, number]; sea: [number, number] } {
  let landCells = 0;
  for (let i = 0; i < w * h; i++) if (height[i]! > SEA_LEVEL) landCells++;
  const kl = landCells / (LAND_SHARE * MEDIUM_AREA);
  const ks = (w * h - landCells) / ((1 - LAND_SHARE) * MEDIUM_AREA);
  return { land: [2000 * kl, 4000 * kl], sea: [150 * ks, 560 * ks] };
}

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
  let k = 1;
  for (const b of biomes) if (b >= k) k = b + 1;
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

/**
 * Cells of mountain massifs (tag `mountain`, components of one biome, enclaves under ENCLAVE_CELLS
 * excluded) whose province biome is neither a mountain nor a hill biome.
 */
export function strayMountainCells(
  biomes: Uint8Array,
  provinceOf: Uint16Array,
  provinces: Province[],
  w: number,
  defs: readonly BiomeDef[],
): number {
  const relief = new Set(defs.filter((d) => hasTag(d, 'mountain') || hasTag(d, 'hill')).map((d) => d.id));
  let bad = 0;
  defs.forEach((d, code) => {
    if (!hasTag(d, 'mountain')) return;
    const { comp, sizes } = components(biomes.length, w, (i) => biomes[i] === code);
    for (let i = 0; i < biomes.length; i++) {
      const k = comp[i]!;
      if (k < 0 || sizes[k]! < ENCLAVE_CELLS) continue;
      if (!relief.has(provinces[provinceOf[i]!]!.biome)) bad++;
    }
  });
  return bad;
}

/** 1 for cells within one cell (8-neighbourhood) of the coast or of a major river cell. */
export function nearCoastOrRiver(height: Float32Array, riverMask: Uint8Array, w: number, h: number): Uint8Array {
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
  return near;
}

/** nearCoastOrRiver, plus every water cell when `landOnly` (metrics of land borders alone). */
function excluded(height: Float32Array, riverMask: Uint8Array, w: number, h: number, landOnly: boolean): Uint8Array {
  const near = nearCoastOrRiver(height, riverMask, w, h);
  if (landOnly) for (let i = 0; i < w * h; i++) if (height[i]! <= SEA_LEVEL) near[i] = 1;
  return near;
}

/**
 * Cell-scale border noise: among border cells (a 4-neighbour in another province) away from the
 * coast and major rivers, the share with at least 3 foreign 4-neighbours (1-cell bumps and notches).
 * `landOnly`: land border cells only.
 */
export function bumpShare(
  height: Float32Array,
  riverMask: Uint8Array,
  provinceOf: Uint16Array,
  w: number,
  h: number,
  landOnly = false,
): { share: number; bumps: number; border: number } {
  const near = excluded(height, riverMask, w, h, landOnly);
  let border = 0;
  let bumps = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (near[i]) continue;
      const p = provinceOf[i];
      const foreign =
        (provinceOf[i - 1] !== p ? 1 : 0) +
        (provinceOf[i + 1] !== p ? 1 : 0) +
        (provinceOf[i - w] !== p ? 1 : 0) +
        (provinceOf[i + w] !== p ? 1 : 0);
      if (foreign === 0) continue;
      border++;
      if (foreign >= 3) bumps++;
    }
  }
  return { share: border ? bumps / border : 0, bumps, border };
}

/**
 * Longest perfectly straight border run: consecutive border edges on one grid line (0/90 degrees)
 * or the exact 45-degree staircase, in cells. Edges touching a cell near the coast or a major river
 * (within one cell, 8-neighbourhood) are ignored; with `landOnly`, edges touching water too.
 */
export function longestStraightBorder(
  height: Float32Array,
  riverMask: Uint8Array,
  provinceOf: Uint16Array,
  w: number,
  h: number,
  long?: Array<{ at: number; kind: string }>,
  landOnly = false,
): { axis: number; diagonal: number; at: number; longCells: number } {
  const n = w * h;
  const near = excluded(height, riverMask, w, h, landOnly);
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
  // Cells (edges or staircase steps) in maximal runs longer than 12, counted at each run's end.
  let longCells = 0;
  const countEnds = (run: Int32Array, next: (i: number) => number): void => {
    for (let i = 0; i < n; i++) {
      const r = run[i]!;
      if (r <= 12) continue;
      const j = next(i);
      if (j < 0 || run[j] !== r + 1) longCells += r;
    }
  };
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
    countEnds(run, prev === 1 ? (i) => (i % w < w - 1 ? i + 1 : -1) : (i) => (i + w < n ? i + w : -1));
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
    countEnds(run, (a) => {
      const x = a % w;
      const j = dir === 1 ? a + w + 1 : a - w + 1;
      return x < w - 2 && j >= 0 && j < n ? j : -1;
    });
  }
  return { axis, diagonal, at, longCells };
}

/**
 * True for a lone island that could be split: it has a 4-connected patch of a non-majority biome
 * with at least 40 cells, and at least 40 cells remain outside it.
 */
export function splittableIsland(biomes: Uint8Array, provinceOf: Uint16Array, p: Province, w: number): boolean {
  const cells: number[] = [];
  for (let i = 0; i < provinceOf.length; i++) if (provinceOf[i] === p.id) cells.push(i);
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(biomes[c]!, (counts.get(biomes[c]!) ?? 0) + 1);
  const major = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  const inP = new Set(cells);
  const seen = new Set<number>();
  for (const s of cells) {
    if (seen.has(s) || biomes[s] === major) continue;
    const comp = [s];
    seen.add(s);
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k]!;
      for (const d of [c % w > 0 ? c - 1 : -1, c % w < w - 1 ? c + 1 : -1, c - w, c + w]) {
        if (d < 0 || !inP.has(d) || seen.has(d) || biomes[d] !== biomes[s]) continue;
        seen.add(d);
        comp.push(d);
      }
    }
    if (comp.length >= 40 && cells.length - comp.length >= 40) return true;
  }
  return false;
}
