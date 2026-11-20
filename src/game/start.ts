import { CodedError } from '../content/errors';
import { createRng } from '../sim/rng';
import type { World } from '../sim/world/types';

/**
 * Start province: deterministic by seed. Candidate tiers, each used only if the previous is empty:
 * startable biome with ≥ 3 land neighbours, ≥ 1, any startable land, land that is not
 * glacier/desert, any land. Throws only when the world has no land at all.
 */
export function pickStartProvince(world: World): number {
  const startable = new Set(world.biomes.filter((b) => b.startable).map((b) => b.id));
  const land = world.provinces.filter((p) => p.isLand);
  const landNeighbours = (id: number): number =>
    (world.provinces[id]?.neighbors ?? []).filter((n) => world.provinces[n]?.isLand).length;
  const tiers = [
    land.filter((p) => startable.has(p.biome) && landNeighbours(p.id) >= 3),
    land.filter((p) => startable.has(p.biome) && landNeighbours(p.id) >= 1),
    land.filter((p) => startable.has(p.biome)),
    land.filter((p) => p.biome !== 'glacier' && p.biome !== 'desert'),
    land,
  ];
  const pool = tiers.find((t) => t.length > 0);
  if (!pool) throw new CodedError('no_start_province');
  const rng = createRng(`${world.params.seed}:start`);
  return pool[rng.int(0, pool.length)]!.id;
}
