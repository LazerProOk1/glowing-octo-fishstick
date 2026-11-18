// Граф соседства провинций: рёбра с длиной общей границы и типом (река, пролив). Спец §7.3.
import { MAJOR_RIVER } from './provinces';
import { SEA_LEVEL } from '../../content/terrainLevels';
import type { ProvinceEdge } from './types';

/** Пролив: не больше стольких клеток воды по прямой между берегами (по диагонали — до 3/√2, т.е. 2). */
export const STRAIT_MAX_WATER = 3;

/** Направления поиска проливов: половина из 8 (вторая половина — те же пары с другой стороны). */
const STRAIT_DIRS: ReadonlyArray<readonly [dx: number, dy: number, maxWater: number]> = [
  [1, 0, STRAIT_MAX_WATER],
  [0, 1, STRAIT_MAX_WATER],
  [1, 1, Math.floor(STRAIT_MAX_WATER / Math.SQRT2)],
  [-1, 1, Math.floor(STRAIT_MAX_WATER / Math.SQRT2)],
];

/**
 * Рёбра соседства по провинциям (`provinceOf`, суша — `height > SEA_LEVEL`).
 * - Ребро есть у каждой пары 4-соседних провинций; length — число пар клеток на их границе.
 * - riverLength: у рёбер суша–суша — число пар границы «клетка крупной реки | клетка не реки»
 *   (крупная река — суша с riverMask ≥ MAJOR_RIVER, те же реки, что режут провинции). Клетки реки
 *   отданы одному берегу, поэтому граница по реке — это как раз пары «река | другой берег»; стык
 *   двух провинций одного берега идёт поперёк реки (пары «река | река») и в riverLength не входит.
 * - river: riverLength > 0 и не меньше половины границы (2·riverLength ≥ length).
 * - strait: две сухопутные провинции без общей границы, между клетками которых по прямой
 *   (по осям или диагонали) лежит от 1 до STRAIT_MAX_WATER клеток воды (по диагонали — не шире 3
 *   по евклидову расстоянию). Такие рёбра добавляются с length = 0.
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
  // Пара (a < b) → номер в рабочих массивах. Ключ a·m + b < 2^32 — точное целое double.
  const slot = new Map<number, number>();
  const length: number[] = [];
  /** Пары границы, где ровно одна клетка — крупная река (граница вдоль реки). */
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

/** Ключи пар сухопутных провинций через узкую воду, у которых нет общей границы (`touching`). */
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
        // Шаг 1..maxWater — вода, следующий за водой — суша другой провинции.
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
