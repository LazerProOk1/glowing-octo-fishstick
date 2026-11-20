import type { World } from '../sim/world/types';

/** Visibility by province id: 0 unknown, 1 visible. At the start: the province and all its neighbours. */
export function startVisibility(world: World, start: number): Uint8Array {
  const vis = new Uint8Array(world.provinces.length);
  vis[start] = 1;
  for (const n of world.provinces[start]?.neighbors ?? []) vis[n] = 1;
  return vis;
}

export function isVisible(vis: Uint8Array, id: number): boolean {
  return vis[id] === 1;
}
