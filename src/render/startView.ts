import type { World } from '../sim/world/types';

/**
 * View for the start: centre and zoom so that the start group and its land neighbours fill roughly the middle
 * third of the screen. Extent per province: its centre ± the radius of a disc of the same area.
 */
export function startView(
  world: World,
  group: readonly number[],
  viewW: number,
  viewH: number,
): { cell: { x: number; y: number }; zoom: number } {
  // Land neighbours only: sea and lake provinces are huge and would zoom the camera far out.
  const ids = new Set(
    group.flatMap((id) => [
      id,
      ...(world.provinces[id]?.neighbors ?? []).filter((n) => world.provinces[n]?.isLand),
    ]),
  );
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const p = world.provinces[id];
    if (!p) continue;
    const r = Math.sqrt(p.cellCount / Math.PI);
    x0 = Math.min(x0, p.center.x - r);
    x1 = Math.max(x1, p.center.x + r);
    y0 = Math.min(y0, p.center.y - r);
    y1 = Math.max(y1, p.center.y + r);
  }
  if (x1 <= x0) return { cell: { x: world.w / 2, y: world.h / 2 }, zoom: 1 };
  const zoom = Math.min(viewW / 3 / (x1 - x0), viewH / 3 / (y1 - y0));
  return { cell: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, zoom };
}
