import { SEA_LEVEL } from '../../content/terrainLevels';
import type { RiverPath } from './types';
import { MinHeap } from './minHeap';
import { SIZE_PRESETS } from './params';

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
/** Tiny slope added while flooding so flat areas and filled pits still drain. */
const EPS = 1e-6;
/** Headwaters on a medium map; other sizes in proportion to the map area. */
const MAX_SOURCES = 110;
const MEDIUM_AREA = SIZE_PRESETS.medium.w * SIZE_PRESETS.medium.h;
const MIN_RIVER_CELLS = 30;

interface Flow {
  /** Receiver cell index, -1 for sea cells. */
  recv: Int32Array;
  /** Accumulated moisture-weighted flow. */
  acc: Float32Array;
  /** Height after priority-flood depression filling (with epsilon slope). */
  filled: Float32Array;
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
  const off = DX.map((dx, d) => DY[d]! * w + dx);
  while (heap.size > 0) {
    const c = heap.pop();
    const level = heap.lastKey;
    order[count++] = c;
    filled[c] = level;
    const cx = c % w;
    const cy = (c - cx) / w;
    const interior = cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1;
    for (let d = 0; d < 8; d++) {
      if (!interior) {
        const nx = cx + DX[d]!;
        const ny = cy + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      }
      const ni = c + off[d]!;
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

/**
 * Land cells at/above threshold with no upstream neighbour at/above it, ascending. `cands` — the land
 * cells with acc >= some lower threshold, ascending (every cell this can return or look at).
 */
function findSources(flow: Flow, cands: Int32Array, n: number, t: number): number[] {
  const { recv, acc } = flow;
  const hasUp = new Uint8Array(n);
  for (const i of cands) {
    const r = recv[i]!;
    if (r >= 0 && acc[i]! >= t) hasUp[r] = 1;
  }
  const out: number[] = [];
  for (const i of cands) {
    if (acc[i]! >= t && !hasUp[i]) out.push(i);
  }
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
  const maxSources = Math.round((MAX_SOURCES * (w * h)) / MEDIUM_AREA);
  let t = 40;
  // The threshold only rises: cells under the first one never matter, so scan the rest only.
  const cands: number[] = [];
  for (let i = 0; i < n; i++) if (acc[i]! >= t && height[i]! >= SEA_LEVEL) cands.push(i);
  const candCells = Int32Array.from(cands);
  let sources = findSources(flow, candCells, n, t);
  while (sources.length > maxSources && t < 1e7) {
    t *= 1.5;
    sources = findSources(flow, candCells, n, t);
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
