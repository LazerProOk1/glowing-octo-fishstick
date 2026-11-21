import { CodedError } from '../content/errors';
import { createRng } from '../sim/rng';
import type { Province, World } from '../sim/world/types';

/** Start group size, and the minimum total cells of that group (default-size median land province ~230). */
const GROUP_SIZE = 3;
const MIN_GROUP_CELLS = 600;
/** Room to grow: land provinces around the group (not in it), so it is not a thin isthmus. */
const MIN_OUTER_LAND = 4;

/**
 * Start group: GROUP_SIZE adjacent land provinces, deterministic by seed; the first id is the core.
 * Candidate cores by tier (first non-empty wins): startable, full group, ≥ MIN_GROUP_CELLS, touching
 * water, with room to grow; the same without water; ≥ MIN_GROUP_CELLS with water; without; any size; then the old ladder (group may be smaller on islet worlds).
 * Throws only when the world has no land at all.
 */
export function pickStartGroup(world: World): number[] {
  const startable = new Set(world.biomes.filter((b) => b.startable).map((b) => b.id));
  const harsh = (p: Province): boolean => p.biome === 'glacier' || p.biome === 'desert';
  // 0 startable, 1 other, 2 glacier/desert: lower is better.
  const rank = (p: Province): number => (startable.has(p.biome) ? 0 : harsh(p) ? 2 : 1);
  const land = world.provinces.filter((p) => p.isLand);
  const prov = (id: number): Province => world.provinces[id]!;

  const growGroup = (core: number): number[] => {
    const group = [core];
    while (group.length < GROUP_SIZE) {
      let best: { id: number; key: number[] } | null = null;
      for (const g of group) {
        for (const n of prov(g).neighbors) {
          const p = prov(n);
          if (!p.isLand || group.includes(n)) continue;
          const links = group.filter((m) => prov(m).neighbors.includes(n)).length;
          const key = [rank(p), -links, -p.cellCount, n];
          if (!best || cmp(key, best.key) < 0) best = { id: n, key };
        }
      }
      if (!best) break;
      group.push(best.id);
    }
    return group;
  };
  const cells = (g: number[]): number => g.reduce((s, id) => s + prov(id).cellCount, 0);
  const touchesWater = (g: number[]): boolean =>
    g.some(
      (id) =>
        prov(id).coastal ||
        prov(id).lakeside ||
        (world.edgesOf[id] ?? []).some((e) => (world.adjacency[e]?.riverLength ?? 0) > 0),
    );

  const outerLand = (g: number[]): number =>
    new Set(g.flatMap((id) => prov(id).neighbors).filter((n) => prov(n).isLand && !g.includes(n)))
      .size;
  const hasRoom = (g: number[]): boolean => outerLand(g) >= MIN_OUTER_LAND;

  const startableCores = land.filter((p) => startable.has(p.biome));
  const full = startableCores.map((p) => growGroup(p.id)).filter((g) => g.length === GROUP_SIZE);
  const big = full.filter((g) => cells(g) >= MIN_GROUP_CELLS);

  const landNeighbours = (p: Province): number => p.neighbors.filter((n) => prov(n).isLand).length;
  const ladder = [
    startableCores.filter((p) => landNeighbours(p) >= 1),
    startableCores,
    land.filter((p) => !harsh(p)),
    land,
  ].find((t) => t.length > 0);
  if (!ladder) throw new CodedError('no_start_province');

  // Within a tier, groups without glacier/desert members win when there are any.
  const clean = (g: number[]): boolean => g.every((id) => !harsh(prov(id)));
  const tier = [
    big.filter((g) => touchesWater(g) && hasRoom(g)),
    big.filter(hasRoom),
    big.filter(touchesWater),
    big,
    full,
  ].find((t) => t.length > 0);
  const pool = tier
    ? tier.some(clean)
      ? tier.filter(clean)
      : tier
    : ladder.map((p) => growGroup(p.id));
  return pool[createRng(`${world.params.seed}:start`).int(0, pool.length)]!;
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}
