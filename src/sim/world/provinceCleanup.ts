import { KIND_CORRIDOR as KIND_CORRIDOR_, KIND_LAND as KIND_LAND_, labelByKey, labelComponents } from './provinceSeeds';

// Imported constants copied to module locals: in hot loops, live import bindings can be slow
// (e.g. under Vite/Vitest module transforms).
const KIND_CORRIDOR = KIND_CORRIDOR_;
const KIND_LAND = KIND_LAND_;

/**
 * Post-passes over a province ownership grid. `owner` is -1 on corridor cells (major rivers) until
 * `assignCorridor`; every other pass works only between cells of the same kind, so provinces never
 * cross the land/water line or a major river.
 */

/** Most frequent same-kind foreign province among the 4-neighbours of cell c (ties: lowest id), or -1. */
function majorityNeighbor(owner: Int32Array, kind: Uint8Array, c: number, w: number, n: number): number {
  const p = owner[c]!;
  const x = c % w;
  const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
  let best = -1;
  let bestCount = 0;
  for (const d of nb) {
    if (d < 0 || d >= n || kind[d] !== kind[c]) continue;
    const q = owner[d]!;
    if (q === p || q < 0) continue;
    let cnt = 0;
    for (const e of nb) if (e >= 0 && e < n && owner[e] === q) cnt++;
    if (cnt > bestCount || (cnt === bestCount && q < best)) {
      best = q;
      bestCount = cnt;
    }
  }
  return best;
}

/** True when the single same-province 4-neighbour of c itself has at most two same neighbours. */
function onThinLine(own: Int32Array, c: number, p: number, w: number, n: number): boolean {
  const x = c % w;
  const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
  for (const d of nb) {
    if (d < 0 || d >= n || own[d] !== p) continue;
    const dx = d % w;
    let same = 0;
    if (dx > 0 && own[d - 1] === p) same++;
    if (dx < w - 1 && own[d + 1] === p) same++;
    if (d >= w && own[d - w] === p) same++;
    if (d + w < n && own[d + w] === p) same++;
    return same <= 2;
  }
  return false;
}

/**
 * Tips of 1-cell-wide tendrils (and isolated cells) move to the majority neighbouring province.
 * Decisions use a snapshot (not raster-order cascading), and lone border bumps are kept, so
 * borders are not eroded into straight grid-axis runs.
 */
export function pruneTendrils(owner: Int32Array, kind: Uint8Array, count: number, w: number, h: number): void {
  const n = w * h;
  const src = owner.slice();
  const size = new Int32Array(count);
  for (let i = 0; i < n; i++) if (src[i]! >= 0) size[src[i]!]!++;
  for (let c = 0; c < n; c++) {
    const p = src[c]!;
    if (p < 0 || size[p]! <= 1) continue;
    const x = c % w;
    let same = 0;
    if (x > 0 && src[c - 1] === p) same++;
    if (x < w - 1 && src[c + 1] === p) same++;
    if (c >= w && src[c - w] === p) same++;
    if (c + w < n && src[c + w] === p) same++;
    if (same > 1) continue;
    // A lone bump on a border (its one same-province neighbour is well inside) is kept: it is
    // border wiggle, not a tendril. Only tips of 1-cell-wide lines move.
    if (same === 1 && !onThinLine(src, c, p, w, n)) continue;
    const q = majorityNeighbor(src, kind, c, w, n);
    if (q < 0) continue;
    owner[c] = q;
    size[p]!--;
  }
}

/**
 * Fine ownership jitter: each cell takes the owner of the cell at its rounded (dx, dy) offset when
 * that cell has the same partition class (`cls`: kind and, on land, biome). With a displacement of
 * about a cell at a short wavelength this roughens borders at the cell scale, so no border keeps a
 * long perfectly straight grid run, without moving anything across a river, coast or biome edge.
 */
export function jitterOwners(
  owner: Int32Array,
  cls: Uint8Array,
  dispX: Float32Array,
  dispY: Float32Array,
  w: number,
  h: number,
): void {
  const src = owner.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      if (src[c]! < 0) continue;
      const sx = Math.round(x + dispX[c]!);
      const sy = Math.round(y + dispY[c]!);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const d = sy * w + sx;
      if (cls[d] === cls[c] && src[d]! >= 0) owner[c] = src[d]!;
    }
  }
}

/** Keeps the largest 4-connected piece of each province; other pieces join their main foreign neighbour. */
export function fixFragments(owner: Int32Array, kind: Uint8Array, isLand: number[], w: number, h: number): void {
  const n = w * h;
  for (let iter = 0; iter < 30; iter++) {
    const count = isLand.length;
    const { comp, sizes } = labelByKey(owner, w, h);
    const main = new Int32Array(count).fill(-1);
    const compOwner = new Int32Array(sizes.length);
    for (let i = 0; i < n; i++) compOwner[comp[i]!] = owner[i]!;
    sizes.forEach((s, k) => {
      const p = compOwner[k]!;
      if (p < 0) return;
      const m = main[p]!;
      if (m < 0 || s > sizes[m]!) main[p] = k;
    });
    const isFragment = (k: number): boolean => compOwner[k]! >= 0 && main[compOwner[k]!] !== k;
    let fragments = 0;
    for (let k = 0; k < sizes.length; k++) if (isFragment(k)) fragments++;
    if (fragments === 0) return;
    // Fragments join only main pieces (never another fragment), so moves cannot ping-pong.
    let border = borderCounts(owner, kind, comp, isFragment, w, h, (b) => !isFragment(comp[b]!));
    if (border.size === 0) border = borderCounts(owner, kind, comp, isFragment, w, h);
    const target = new Map<number, number>();
    for (const [k, counts] of border) target.set(k, pickMax(counts));
    if (target.size === 0) {
      // Fragments with no same-kind neighbour at all (e.g. a piece walled off by a river and the
      // sea) become provinces of their own.
      for (let k = 0; k < sizes.length; k++) {
        if (!isFragment(k)) continue;
        target.set(k, isLand.length);
        isLand.push(isLand[compOwner[k]!]!);
      }
    }
    for (let i = 0; i < n; i++) {
      const t = target.get(comp[i]!);
      if (t !== undefined) owner[i] = t;
    }
  }
  throw new Error('fixFragments did not converge');
}

/** For each group g with interest(g), counts shared 4-edges with same-kind foreign provinces. */
export function borderCounts(
  owner: Int32Array,
  kind: Uint8Array,
  group: Int32Array,
  interest: (g: number) => boolean,
  w: number,
  h: number,
  accept: (b: number) => boolean = () => true,
): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  const add = (a: number, b: number): void => {
    const g = group[a]!;
    if (!interest(g) || !accept(b)) return;
    let m = out.get(g);
    if (!m) out.set(g, (m = new Map()));
    const q = owner[b]!;
    m.set(q, (m.get(q) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = owner[i]!;
      if (kind[i] === KIND_CORRIDOR) continue;
      if (x < w - 1 && owner[i + 1] !== p && kind[i + 1] === kind[i]) {
        add(i, i + 1);
        add(i + 1, i);
      }
      if (y < h - 1 && owner[i + w] !== p && kind[i + w] === kind[i]) {
        add(i, i + w);
        add(i + w, i);
      }
    }
  }
  return out;
}

export function pickMax(counts: Map<number, number>): number {
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

/**
 * Provinces under their kind's minimum join the same-kind neighbour that keeps the merged province
 * most terrain-pure (share of its majority biome); ties go to the longer shared border. Lone islands stay.
 */
export function mergeSmall(
  owner: Int32Array,
  kind: Uint8Array,
  biomes: Uint8Array,
  isLand: number[],
  minLand: number,
  minSea: number,
  w: number,
  h: number,
): void {
  const n = w * h;
  const count = isLand.length;
  for (let iter = 0; iter < 60; iter++) {
    const size = new Int32Array(count);
    const bc = new Int32Array(count * BIOME_SLOTS);
    for (let i = 0; i < n; i++) {
      const p = owner[i]!;
      if (p < 0) continue;
      size[p]!++;
      bc[p * BIOME_SLOTS + biomes[i]!]!++;
    }
    const isSmall = (p: number): boolean => p >= 0 && size[p]! > 0 && size[p]! < (isLand[p] ? minLand : minSea);
    const border = borderCounts(owner, kind, owner, isSmall, w, h);
    if (border.size === 0) return;
    const mergedPurity = (p: number, q: number): number => {
      let m = 0;
      for (let b = 0; b < BIOME_SLOTS; b++) m = Math.max(m, bc[p * BIOME_SLOTS + b]! + bc[q * BIOME_SLOTS + b]!);
      return m / (size[p]! + size[q]!);
    };
    const small = [...border.keys()].sort((a, b) => size[a]! - size[b]! || a - b);
    const touched = new Uint8Array(count);
    const target = new Int32Array(count).fill(-1);
    for (const p of small) {
      let q = -1;
      let bestPur = -1;
      let bestBorder = -1;
      for (const [cand, len] of border.get(p)!) {
        const pur = Math.round(mergedPurity(p, cand) * 1000);
        if (pur > bestPur || (pur === bestPur && (len > bestBorder || (len === bestBorder && cand < q)))) {
          q = cand;
          bestPur = pur;
          bestBorder = len;
        }
      }
      // p may merge unless it already absorbs another province this pass; q may absorb several,
      // but not if it is itself moving this pass.
      if (touched[p] || target[q]! >= 0) continue;
      touched[q] = 1;
      target[p] = q;
    }
    for (let i = 0; i < n; i++) {
      const p = owner[i]!;
      if (p >= 0 && target[p]! >= 0) owner[i] = target[p]!;
    }
  }
  throw new Error('mergeSmall did not converge');
}

/** Biome code slots (>= BIOMES.length). */
export const BIOME_SLOTS = 16;

/**
 * Gives every corridor cell (major river, owner -1) to an adjacent land province: first the
 * majority of its land 4-neighbours, then, for cells inside wide river patches, of already
 * assigned corridor neighbours. Each step copies a 4-neighbour's owner, so provinces stay connected.
 */
export function assignCorridor(owner: Int32Array, kind: Uint8Array, isLand: number[], w: number, h: number): void {
  const n = w * h;
  for (let pass = 0; ; pass++) {
    const src = owner.slice();
    let pending = 0;
    let changed = 0;
    for (let c = 0; c < n; c++) {
      if (src[c] !== -1) continue;
      pending++;
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      let best = -1;
      let bestCount = 0;
      for (const d of nb) {
        if (d < 0 || d >= n || kind[d] === 0) continue;
        if (pass === 0 && kind[d] !== KIND_LAND) continue;
        const q = src[d]!;
        if (q < 0) continue;
        let cnt = 0;
        for (const e of nb) if (e >= 0 && e < n && src[e] === q) cnt++;
        if (cnt > bestCount || (cnt === bestCount && q < best)) {
          best = q;
          bestCount = cnt;
        }
      }
      if (best >= 0) {
        owner[c] = best;
        changed++;
      }
    }
    if (pending === 0) return;
    if (changed === 0 && pass > 0) {
      // Corridor pieces touching no land province (e.g. an islet that is all river) become provinces.
      const { comp } = labelComponents(n, w, h, (a, b) => owner[a] === -1 && owner[b] === -1);
      const made = new Map<number, number>();
      for (let c = 0; c < n; c++) {
        if (owner[c] !== -1) continue;
        let p = made.get(comp[c]!);
        if (p === undefined) {
          p = isLand.length;
          isLand.push(1);
          made.set(comp[c]!, p);
        }
        owner[c] = p;
      }
      return;
    }
  }
}
