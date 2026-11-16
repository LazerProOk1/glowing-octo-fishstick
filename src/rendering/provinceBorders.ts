import type { World } from '@/types/world';

/** One tile edge of the political grid, in tile-lattice coordinates. */
export interface ProvinceBorderSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Collects the tile edges where two provinces of the land meet. Water has
 * `provinceId = -1`, so a province never draws a line against the sea: the
 * coastline is the border already.
 */
export function buildProvinceBorderSegments(world: World): ProvinceBorderSegment[] {
  const segments: ProvinceBorderSegment[] = [];

  for (let y = 0; y < world.height; y += 1) {
    const row = world.tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < world.width; x += 1) {
      const id = row[x]?.provinceId ?? -1;
      if (id < 0) {
        continue;
      }

      const east = row[x + 1]?.provinceId;
      if (east !== undefined && east >= 0 && east !== id) {
        segments.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
      }

      const south = world.tiles[y + 1]?.[x]?.provinceId;
      if (south !== undefined && south >= 0 && south !== id) {
        segments.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
      }
    }
  }

  return segments;
}
