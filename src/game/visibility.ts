import type { World } from '../sim/world/types';

/** Visibility by province id: 0 unknown, 1 visible. At the start: the start group and all its neighbours. */
export function startVisibility(world: World, group: readonly number[]): Uint8Array {
  const vis = new Uint8Array(world.provinces.length);
  for (const id of group) {
    vis[id] = 1;
    for (const n of world.provinces[id]?.neighbors ?? []) vis[n] = 1;
  }
  return vis;
}

/** Any non-zero value is visible (the render fog reads it the same way). */
export function isVisible(vis: Uint8Array, id: number): boolean {
  return (vis[id] ?? 0) !== 0;
}
