import {
  KIND_CORRIDOR as KIND_CORRIDOR_,
  KIND_LAND as KIND_LAND_,
  KIND_WATER as KIND_WATER_,
  labelByKey,
} from './provinceSeeds';

// Imported constants copied to module locals: in hot loops, live import bindings can be slow
// (e.g. under Vite/Vitest module transforms).
const KIND_CORRIDOR = KIND_CORRIDOR_;
const KIND_LAND = KIND_LAND_;
const KIND_WATER = KIND_WATER_;

/**
 * Post-passes over a province ownership grid. `owner` is -1 on corridor cells (major rivers) until
 * `assignCorridor`; every other pass works only between cells of the same kind, so provinces never
 * cross the land/water line or a major river.
 */

/** Biome code slots (>= BIOMES.length). */
export const BIOME_SLOTS = 16;

/** 4-neighbour index of c in direction k (0 E, 1 W, 2 N, 3 S), or -1 outside the map. */
function nbr(c: number, k: number, w: number, n: number): number {
  if (k === 0) return c % w < w - 1 ? c + 1 : -1;
  if (k === 1) return c % w > 0 ? c - 1 : -1;
  if (k === 2) return c >= w ? c - w : -1;
  return c + w < n ? c + w : -1;
}

/**
 * Cells with at most one same-province 4-neighbour (1-cell bumps, tendril tips, isolated cells) move
 * to the most frequent same-kind foreign province among their 4-neighbours. Decided on a snapshot.
 */
export function pruneTendrils(owner: Int32Array, kind: Uint8Array, w: number, h: number): void {
  const n = w * h;
  const src = owner.slice();
  for (let c = 0; c < n; c++) {
    const p = src[c]!;
    if (p < 0) continue;
    let same = 0;
    for (let k = 0; k < 4; k++) {
      const d = nbr(c, k, w, n);
      if (d >= 0 && src[d] === p) same++;
    }
    if (same > 1) continue;
    let best = -1;
    let bestCount = 0;
    for (let k = 0; k < 4; k++) {
      const d = nbr(c, k, w, n);
      if (d < 0 || kind[d] !== kind[c]) continue;
      const q = src[d]!;
      if (q === p || q < 0) continue;
      let cnt = 0;
      for (let j = 0; j < 4; j++) {
        const e = nbr(c, j, w, n);
        if (e >= 0 && src[e] === q) cnt++;
      }
      if (cnt > bestCount || (cnt === bestCount && q < best)) {
        best = q;
        bestCount = cnt;
      }
    }
    if (best >= 0) owner[c] = best;
  }
}

/**
 * 3x3 mode filter on border cells: a cell takes the province that is strictly more frequent than
 * its own among itself and its 8 neighbours of the same class. Removes 1-cell steps and notches so
 * borders read as smooth curves. Decided on a snapshot; run fixFragments afterwards.
 */
export function smoothOwners(owner: Int32Array, cls: Uint8Array, w: number, h: number): void {
  const src = owner.slice();
  const ids = new Int32Array(9);
  const cnt = new Int32Array(9);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const p = src[c]!;
      if (p < 0) continue;
      if (src[c - 1] === p && src[c + 1] === p && src[c - w] === p && src[c + w] === p) continue;
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const d = c + dy * w + dx;
          if (cls[d] !== cls[c]) continue;
          const q = src[d]!;
          if (q < 0) continue;
          let j = 0;
          while (j < m && ids[j] !== q) j++;
          if (j === m) {
            ids[m] = q;
            cnt[m] = 0;
            m++;
          }
          cnt[j]!++;
        }
      }
      let own = 0;
      for (let j = 0; j < m; j++) if (ids[j] === p) own = cnt[j]!;
      let best = p;
      let bestCount = own;
      for (let j = 0; j < m; j++) {
        if (cnt[j]! > bestCount || (cnt[j] === bestCount && ids[j] !== p && best !== p && ids[j]! < best)) {
          best = ids[j]!;
          bestCount = cnt[j]!;
        }
      }
      owner[c] = best;
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
    for (let k = 0; k < sizes.length; k++) {
      const p = compOwner[k]!;
      if (p < 0) continue;
      const m = main[p]!;
      if (m < 0 || sizes[k]! > sizes[m]!) main[p] = k;
    }
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
      if (kind[i] === KIND_CORRIDOR || p < 0) continue;
      if (x < w - 1 && owner[i + 1] !== p && owner[i + 1]! >= 0 && kind[i + 1] === kind[i]) {
        add(i, i + 1);
        add(i + 1, i);
      }
      if (y < h - 1 && owner[i + w] !== p && owner[i + w]! >= 0 && kind[i + w] === kind[i]) {
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
 * Province adjacency graph with union-find merging: sizes, biome counts and shared border lengths
 * are built once from the grid and then updated per merge (no grid rescans); `apply` relabels.
 */
export class MergeGraph {
  readonly size: Int32Array;
  readonly bc: Int32Array;
  private readonly parent: Int32Array;
  private readonly adj: Map<number, Map<number, number>>;
  constructor(owner: Int32Array, kind: Uint8Array, biomes: Uint8Array, count: number, w: number, h: number) {
    const n = w * h;
    this.size = new Int32Array(count);
    this.bc = new Int32Array(count * BIOME_SLOTS);
    this.parent = new Int32Array(count);
    for (let p = 0; p < count; p++) this.parent[p] = p;
    for (let i = 0; i < n; i++) {
      const p = owner[i]!;
      if (p < 0) continue;
      this.size[p]!++;
      this.bc[p * BIOME_SLOTS + biomes[i]!]!++;
    }
    this.adj = borderCounts(owner, kind, owner, () => true, w, h);
  }
  find(p: number): number {
    let r = p;
    while (this.parent[r] !== r) r = this.parent[r]!;
    while (this.parent[p] !== r) {
      const next = this.parent[p]!;
      this.parent[p] = r;
      p = next;
    }
    return r;
  }
  /** Current neighbours of root p with shared border length, sorted by id. */
  neighbors(p: number): Array<[number, number]> {
    const acc = new Map<number, number>();
    for (const [q, len] of this.adj.get(p) ?? []) {
      const r = this.find(q);
      if (r !== p) acc.set(r, (acc.get(r) ?? 0) + len);
    }
    return [...acc].sort((a, b) => a[0] - b[0]);
  }
  /** Share of the majority biome in root p, or in the union of roots p and q. */
  purity(p: number, q = -1): number {
    let m = 0;
    for (let b = 0; b < BIOME_SLOTS; b++) {
      m = Math.max(m, this.bc[p * BIOME_SLOTS + b]! + (q >= 0 ? this.bc[q * BIOME_SLOTS + b]! : 0));
    }
    return m / (this.size[p]! + (q >= 0 ? this.size[q]! : 0));
  }
  /** Merges root p into root q. */
  merge(p: number, q: number): void {
    this.parent[p] = q;
    this.size[q] = this.size[q]! + this.size[p]!;
    for (let b = 0; b < BIOME_SLOTS; b++) {
      this.bc[q * BIOME_SLOTS + b] = this.bc[q * BIOME_SLOTS + b]! + this.bc[p * BIOME_SLOTS + b]!;
    }
    let mq = this.adj.get(q);
    if (!mq) this.adj.set(q, (mq = new Map()));
    for (const [k, len] of this.adj.get(p) ?? []) mq.set(k, (mq.get(k) ?? 0) + len);
    this.adj.delete(p);
  }
  apply(owner: Int32Array): void {
    for (let i = 0; i < owner.length; i++) if (owner[i]! >= 0) owner[i] = this.find(owner[i]!);
  }
}

/**
 * On a merge graph: provinces under their kind's minimum join the same-kind neighbour that keeps
 * the union most terrain-pure; ties go to the longer shared border, then the lower id. Lone islands
 * (no same-kind neighbour) stay.
 */
export function mergeSmallOn(g: MergeGraph, isLand: number[], minLand: number, minSea: number): void {
  const min = (p: number): number => (isLand[p] ? minLand : minSea);
  const queue: number[] = [];
  for (let p = 0; p < isLand.length; p++) if (g.find(p) === p && g.size[p]! > 0 && g.size[p]! < min(p)) queue.push(p);
  queue.sort((a, b) => g.size[a]! - g.size[b]! || a - b);
  for (let k = 0; k < queue.length; k++) {
    const p = queue[k]!;
    if (g.find(p) !== p || g.size[p]! >= min(p)) continue;
    let q = -1;
    let bestPur = -1;
    let bestLen = -1;
    for (const [cand, len] of g.neighbors(p)) {
      const pur = Math.round(g.purity(p, cand) * 1000);
      if (pur > bestPur || (pur === bestPur && len > bestLen)) {
        q = cand;
        bestPur = pur;
        bestLen = len;
      }
    }
    if (q < 0) continue;
    g.merge(p, q);
    if (g.size[q]! < min(q)) queue.push(q);
  }
}

/**
 * Gives every corridor cell (major river, owner -1) to a land province. Each cell copies the owner
 * of its first assigned land (then corridor) 4-neighbour in a fixed order: north, west, south,
 * east. A whole river cross-section therefore goes to the same bank (the north or west one) instead
 * of zig-zagging cell by cell. Each step copies a 4-neighbour's owner, so provinces stay connected.
 */
export function assignCorridor(owner: Int32Array, kind: Uint8Array, isLand: number[], w: number, h: number): void {
  const n = w * h;
  const order = [2, 1, 3, 0];
  for (let pass = 0; ; pass++) {
    const src = owner.slice();
    let pending = 0;
    let changed = 0;
    for (let c = 0; c < n; c++) {
      if (src[c] !== -1) continue;
      pending++;
      for (const k of order) {
        const d = nbr(c, k, w, n);
        if (d < 0 || kind[d] === KIND_WATER || src[d]! < 0) continue;
        if (pass === 0 && kind[d] !== KIND_LAND) continue;
        owner[c] = src[d]!;
        changed++;
        break;
      }
    }
    if (pending === 0) return;
    if (changed === 0 && pass > 0) {
      // Corridor pieces touching no land province (e.g. an islet that is all river) become provinces.
      const key = new Int32Array(n);
      for (let i = 0; i < n; i++) key[i] = owner[i] === -1 ? -1 : 0;
      const { comp } = labelByKey(key, w, h);
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
