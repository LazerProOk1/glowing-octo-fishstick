import type { BiomeDef } from '../../content/biomes/types';
import { CodedError } from '../../content/errors';
import { hasTag } from '../../content/registry';
import { labelComponents } from '../geom/label';
import { SEA_LEVEL } from '../../content/terrainLevels';

/** Land components (4-connected) smaller than this sink into shallow water. */
export const MIN_ISLAND_CELLS = 6;
/** Enclosed water components (not touching the map border) smaller than this are filled with land. */
export const MIN_LAKE_CELLS = 30;
/** Offset from SEA_LEVEL given to reclassified cells. */
const SHORE_DELTA = 0.005;

/**
 * Removes specks: islands under MIN_ISLAND_CELLS become shallow water (the `shallowWater` biome)
 * just below SEA_LEVEL, then enclosed lakes under MIN_LAKE_CELLS become land just above SEA_LEVEL
 * with the most frequent land biome of their 4-neighbours (ties: lowest code). Land is
 * `height > SEA_LEVEL` everywhere. `defs` — the world's biome list (codes are indices in it).
 * Returns new arrays; inputs are not modified.
 */
export function normalizeShoreline(
  height: Float32Array,
  biomes: Uint8Array,
  w: number,
  h: number,
  defs: readonly BiomeDef[],
): { height: Float32Array; biomes: Uint8Array } {
  const n = w * h;
  const COAST = defs.findIndex((d) => hasTag(d, 'shallowWater'));
  if (COAST < 0) throw new CodedError('no_shallow_water_biome');
  const outH = new Float32Array(height);
  const outB = new Uint8Array(biomes);
  const isLand = (i: number): boolean => outH[i]! > SEA_LEVEL;
  const landMask = (): Uint8Array => {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = isLand(i) ? 1 : 0;
    return m;
  };

  // 1. Tiny islands -> shallow water.
  {
    const { comp, sizes } = labelComponents(landMask(), w, h);
    for (let i = 0; i < n; i++) {
      if (isLand(i) && sizes[comp[i]!]! < MIN_ISLAND_CELLS) {
        outH[i] = SEA_LEVEL - SHORE_DELTA;
        outB[i] = COAST;
      }
    }
  }

  // 2. Small enclosed lakes -> land (labelled after step 1, so sunk islands join their water body).
  const { comp, sizes } = labelComponents(landMask(), w, h);
  const touchesBorder = new Uint8Array(sizes.length);
  for (let x = 0; x < w; x++) {
    touchesBorder[comp[x]!] = 1;
    touchesBorder[comp[(h - 1) * w + x]!] = 1;
  }
  for (let y = 0; y < h; y++) {
    touchesBorder[comp[y * w]!] = 1;
    touchesBorder[comp[y * w + w - 1]!] = 1;
  }
  const fill = (k: number): boolean => sizes[k]! < MIN_LAKE_CELLS && !touchesBorder[k];
  // Collect cells of each lake to fill.
  const lakes = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (isLand(i)) continue;
    const k = comp[i]!;
    if (!fill(k)) continue;
    let cells = lakes.get(k);
    if (!cells) lakes.set(k, (cells = []));
    cells.push(i);
  }
  const seen = new Int32Array(n).fill(-1);
  const counts = new Int32Array(defs.length);
  for (const [k, cells] of lakes) {
    counts.fill(0);
    for (const c of cells) {
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const d of nb) {
        if (d < 0 || d >= n || comp[d] === k || seen[d] === k) continue;
        seen[d] = k;
        counts[outB[d]!]!++;
      }
    }
    let best = -1;
    for (let b = 0; b < defs.length; b++) {
      if (defs[b]!.kind === 'water') continue;
      if (best < 0 || counts[b]! > counts[best]!) best = b;
    }
    for (const c of cells) {
      outH[c] = SEA_LEVEL + SHORE_DELTA;
      outB[c] = best;
    }
  }
  return { height: outH, biomes: outB };
}
