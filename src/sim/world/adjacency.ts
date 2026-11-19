// Province adjacency graph: edges with shared-border length and kind (river, strait). Spec §7.3.
import { MAJOR_RIVER } from './provinces';
import { SEA_LEVEL } from '../../content/terrainLevels';
import type { ProvinceEdge } from './types';

/** Strait: at most this many water cells in a straight line between shores (diagonally: 3/√2, i.e. 2). */
export const STRAIT_MAX_WATER = 3;

/** Strait search directions: half of the 8 (the other half is the same pairs from the other side). */
const STRAIT_DIRS: ReadonlyArray<readonly [dx: number, dy: number, maxWater: number]> = [
  [1, 0, STRAIT_MAX_WATER],
  [0, 1, STRAIT_MAX_WATER],
  [1, 1, Math.floor(STRAIT_MAX_WATER / Math.SQRT2)],
  [-1, 1, Math.floor(STRAIT_MAX_WATER / Math.SQRT2)],
];

/**
 * Adjacency edges per province (`provinceOf`, land is `height > SEA_LEVEL`).
 * - Every pair of 4-adjacent provinces has an edge; length is the number of cell pairs on their border.
 * - riverLength: for land–land edges, the number of border pairs "major river cell | non-river cell"
 *   (a major river is land with riverMask ≥ MAJOR_RIVER, the same rivers that cut provinces). River
 *   cells belong to one bank, so the border along a river is exactly the pairs "river | other bank";
 *   where two provinces of the same bank meet, the border runs across the river ("river | river"
 *   pairs) and is not counted in riverLength.
 * - river: riverLength > 0 and at least half of the border (2·riverLength ≥ length).
 * - strait: two land provinces without a shared border, with 1 to STRAIT_MAX_WATER water cells in a
 *   straight line (along an axis or a diagonal) between their cells (diagonally: no wider than 3 by
 *   Euclidean distance). Such edges are added with length = 0.
 */
export function computeAdjacency(
  provinceOf: Uint16Array,
  provinces: ReadonlyArray<{ readonly isLand: boolean }>,
  height: Float32Array,
  riverMask: Uint8Array,
  w: number,
  h: number,
): { adjacency: ProvinceEdge[]; edgesOf: number[][] } {
  const m = provinces.length;
  // Pair (a < b) → index in the working arrays. The key a·m + b < 2^32 is an exact double integer.
  const slot = new Map<number, number>();
  const length: number[] = [];
  /** Border pairs where exactly one cell is a major river (border along a river). */
  const riverPairs: number[] = [];
  const isMajor = (i: number): boolean => riverMask[i]! >= MAJOR_RIVER && height[i]! > SEA_LEVEL;
  const touch = (i: number, j: number): void => {
    const p = provinceOf[i]!;
    const q = provinceOf[j]!;
    if (p === q) return;
    const k = p < q ? p * m + q : q * m + p;
    let s = slot.get(k);
    if (s === undefined) {
      s = length.length;
      slot.set(k, s);
      length.push(0);
      riverPairs.push(0);
    }
    length[s]!++;
    if (isMajor(i) !== isMajor(j)) riverPairs[s]!++;
  };
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (x < w - 1 && provinceOf[i + 1] !== provinceOf[i]) touch(i, i + 1);
      if (y < h - 1 && provinceOf[i + w] !== provinceOf[i]) touch(i, i + w);
    }
  }
  const straits = findStraits(provinceOf, height, slot, m, w, h);

  const keys = [...slot.keys(), ...straits].sort((a, b) => a - b);
  const adjacency: ProvinceEdge[] = [];
  const edgesOf: number[][] = Array.from({ length: m }, () => []);
  for (const k of keys) {
    const a = Math.floor(k / m);
    const b = k - a * m;
    const s = slot.get(k);
    const len = s === undefined ? 0 : length[s]!;
    const land = provinces[a]!.isLand && provinces[b]!.isLand;
    const r = s === undefined || !land ? 0 : riverPairs[s]!;
    const id = adjacency.length;
    adjacency.push({ a, b, length: len, riverLength: r, river: r > 0 && 2 * r >= len, strait: s === undefined });
    edgesOf[a]!.push(id);
    edgesOf[b]!.push(id);
  }
  return { adjacency, edgesOf };
}

/** Keys of land-province pairs across narrow water that have no shared border (`touching`). */
function findStraits(
  provinceOf: Uint16Array,
  height: Float32Array,
  touching: ReadonlyMap<number, number>,
  m: number,
  w: number,
  h: number,
): Set<number> {
  const out = new Set<number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (height[i]! <= SEA_LEVEL) continue;
      const p = provinceOf[i]!;
      for (const [dx, dy, maxWater] of STRAIT_DIRS) {
        // Steps 1..maxWater are water; the first land after the water belongs to the other province.
        let cx = x + dx;
        let cy = y + dy;
        let water = 0;
        while (cx >= 0 && cy < h && cx < w && height[cy * w + cx]! <= SEA_LEVEL && water <= maxWater) {
          water++;
          cx += dx;
          cy += dy;
        }
        if (water === 0 || water > maxWater || cx < 0 || cx >= w || cy >= h) continue;
        const q = provinceOf[cy * w + cx]!;
        if (q === p) continue;
        const k = p < q ? p * m + q : q * m + p;
        if (!touching.has(k)) out.add(k);
      }
    }
  }
  return out;
}
