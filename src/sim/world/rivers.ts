import { SEA_LEVEL } from './types';
import type { RiverPath } from './types';

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
/** Tiny slope added while flooding so flat areas and filled pits still drain. */
const EPS = 1e-6;
const MAX_SOURCES = 110;
const MIN_RIVER_CELLS = 30;

interface Flow {
  /** Receiver cell index, -1 for sea cells. */
  recv: Int32Array;
  /** Accumulated moisture-weighted flow. */
  acc: Float32Array;
  /** Height after priority-flood depression filling (with epsilon slope). */
  filled: Float32Array;
}

/** Binary min-heap on (key, index); ties broken by index for determinism. */
class MinHeap {
  private keys: Float64Array;
  private ids: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.ids = new Int32Array(cap);
  }
  private less(ka: number, ia: number, kb: number, ib: number): boolean {
    return ka < kb || (ka === kb && ia < ib);
  }
  push(key: number, id: number): void {
    const { keys, ids } = this;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(key, id, keys[p]!, ids[p]!)) break;
      keys[i] = keys[p]!;
      ids[i] = ids[p]!;
      i = p;
    }
    keys[i] = key;
    ids[i] = id;
  }
  /** Pops the minimum; returns its id, key available via `lastKey`. */
  lastKey = 0;
  pop(): number {
    const { keys, ids } = this;
    const topId = ids[0]!;
    this.lastKey = keys[0]!;
    const key = keys[--this.size]!;
    const id = ids[this.size]!;
    let i = 0;
    const n = this.size;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.less(keys[c + 1]!, ids[c + 1]!, keys[c]!, ids[c]!)) c++;
      if (!this.less(keys[c]!, ids[c]!, key, id)) break;
      keys[i] = keys[c]!;
      ids[i] = ids[c]!;
      i = c;
    }
    keys[i] = key;
    ids[i] = id;
    return topId;
  }
}

/** Priority-flood from all water cells; fills depressions and yields D8 receivers + flow accumulation. */
function computeFlow(height: Float32Array, moisture: Float32Array, w: number, h: number): Flow {
  const n = w * h;
  const recv = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const order = new Int32Array(n);
  const heap = new MinHeap(n);
  const filled = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (height[i]! < SEA_LEVEL) {
      seen[i] = 1;
      filled[i] = height[i]!;
      // Only coastal water cells can seed the flood; open sea never receives from land.
      const x = i % w;
      const y = (i - x) / w;
      let coastal = false;
      for (let d = 0; d < 8 && !coastal; d++) {
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && height[ny * w + nx]! >= SEA_LEVEL) coastal = true;
      }
      if (coastal) heap.push(height[i]!, i);
    }
  }
  let count = 0;
  while (heap.size > 0) {
    const c = heap.pop();
    const level = heap.lastKey;
    order[count++] = c;
    filled[c] = level;
    const cx = c % w;
    const cy = (c - cx) / w;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d]!;
      const ny = cy + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      recv[ni] = c;
      heap.push(Math.max(height[ni]!, level + EPS), ni);
    }
  }
  const acc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (height[i]! >= SEA_LEVEL) {
      const m = moisture[i]!;
      acc[i] = 0.15 + m * m;
    }
  }
  for (let k = count - 1; k >= 0; k--) {
    const c = order[k]!;
    const r = recv[c]!;
    if (r >= 0 && height[r]! >= SEA_LEVEL) acc[r] = acc[r]! + acc[c]!;
  }
  return { recv, acc, filled };
}

/** Fills depressions (priority-flood from water, epsilon slope so flats drain). */
export function fillDepressions(height: Float32Array, w: number, h: number): Float32Array {
  return computeFlow(height, new Float32Array(w * h), w, h).filled;
}

/** Land cells at/above threshold with no upstream neighbour at/above it. */
function findSources(flow: Flow, height: Float32Array, w: number, h: number, t: number): number[] {
  const { recv, acc } = flow;
  const n = w * h;
  const hasUp = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = recv[i]!;
    if (r >= 0 && acc[i]! >= t && height[i]! >= SEA_LEVEL) hasUp[r] = 1;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (acc[i]! >= t && height[i]! >= SEA_LEVEL && !hasUp[i]) out.push(i);
  }
  void h;
  return out;
}

function widthFor(a: number, t: number): number {
  return Math.max(1, Math.min(4, 1 + Math.floor(Math.log2(a / t) / 1.6)));
}

export function computeRivers(
  height: Float32Array,
  moisture: Float32Array,
  w: number,
  h: number,
): { rivers: RiverPath[]; riverMask: Uint8Array } {
  const flow = computeFlow(height, moisture, w, h);
  const { recv, acc } = flow;
  const n = w * h;

  // Choose the smallest threshold that keeps the number of headwaters bounded.
  let t = 40;
  let sources = findSources(flow, height, w, h, t);
  while (sources.length > MAX_SOURCES && t < 1e7) {
    t *= 1.5;
    sources = findSources(flow, height, w, h, t);
  }

  // Extend every headwater uphill along its largest tributary, up to the watershed crest.
  const bestUp = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const r = recv[i]!;
    if (r < 0 || height[i]! < SEA_LEVEL) continue;
    const b = bestUp[r]!;
    if (b < 0 || acc[i]! > acc[b]!) bestUp[r] = i;
  }
  sources = sources.map((s0) => {
    let c = s0;
    while (bestUp[c]! >= 0) c = bestUp[c]!;
    return c;
  });

  // Trace long rivers first so that short tributaries end by joining them.
  const traced = sources.map((s) => {
    const cells: number[] = [];
    let c = s;
    for (;;) {
      cells.push(c);
      if (height[c]! < SEA_LEVEL) break;
      c = recv[c]!;
      if (c < 0) break;
    }
    return cells;
  });
  const idx = traced.map((_, i) => i).sort((a, b) => traced[b]!.length - traced[a]!.length || a - b);

  const visited = new Uint8Array(n);
  const rivers: RiverPath[] = [];
  const riverMask = new Uint8Array(n);
  for (const i of idx) {
    const cells = traced[i]!;
    const kept: number[] = [];
    for (const c of cells) {
      kept.push(c);
      if (visited[c]) break;
    }
    if (kept.length < MIN_RIVER_CELLS) continue;
    const points: Array<{ x: number; y: number }> = [];
    const width: number[] = [];
    for (const c of kept) {
      points.push({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 });
      const wd = widthFor(acc[c]!, t);
      width.push(wd);
      if (height[c]! >= SEA_LEVEL) {
        visited[c] = 1;
        if (wd > riverMask[c]!) riverMask[c] = wd;
      }
    }
    // Width never shrinks downstream.
    for (let k = 1; k < width.length; k++) width[k] = Math.max(width[k]!, width[k - 1]!);
    rivers.push({ points, width });
  }
  return { rivers, riverMask };
}
