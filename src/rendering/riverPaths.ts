import { clamp } from '@/lib/math';
import type { World } from '@/types/world';

export interface RiverPoint {
  readonly x: number;
  readonly y: number;
}

export interface RiverPolyline {
  readonly points: readonly RiverPoint[];
  /** Stroke width in CSS pixels at zoom 1 */
  readonly width: number;
}

const MIN_RIVER_WIDTH = 1;
const MAX_RIVER_WIDTH = 2.6;

/**
 * Rivers as vector polylines through tile centres. The renderer draws them with
 * midpoint quadratic curves, so the network reads as smooth flowing lines
 * instead of a staircase of tile hops.
 */
export function buildRiverPolylines(world: World): RiverPolyline[] {
  const { width, height, flowDownstream, flowAccumulation, tiles } = world;
  const size = width * height;

  const isRiver = (index: number): boolean =>
    tiles[Math.floor(index / width)]?.[index % width]?.river === true;

  const upstreamCount = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    if (!isRiver(index)) {
      continue;
    }
    const downstream = flowDownstream[index] ?? -1;
    if (downstream >= 0 && isRiver(downstream)) {
      upstreamCount[downstream] = (upstreamCount[downstream] ?? 0) + 1;
    }
  }

  const visited = new Uint8Array(size);
  const polylines: RiverPolyline[] = [];

  const centre = (index: number): RiverPoint => ({
    x: (index % width) + 0.5,
    y: Math.floor(index / width) + 0.5,
  });

  const walk = (start: number): void => {
    const points: RiverPoint[] = [centre(start)];
    let current = start;
    let last = start;

    for (let step = 0; step < size; step += 1) {
      visited[current] = 1;
      last = current;
      const downstream = flowDownstream[current] ?? -1;
      if (downstream < 0 || downstream >= size) {
        break;
      }
      if (!isRiver(downstream)) {
        // Mouth: keep the last hop so the river visibly reaches the sea.
        points.push(centre(downstream));
        break;
      }
      if (visited[downstream] === 1) {
        break;
      }
      points.push(centre(downstream));
      current = downstream;
    }

    if (points.length < 2) {
      return;
    }

    const accumulation = flowAccumulation[last] ?? 0;
    const width = clamp(
      MIN_RIVER_WIDTH + Math.log10(1 + accumulation) * 0.5,
      MIN_RIVER_WIDTH,
      MAX_RIVER_WIDTH,
    );

    polylines.push({ points, width });
  };

  for (let index = 0; index < size; index += 1) {
    if (isRiver(index) && upstreamCount[index] === 0) {
      walk(index);
    }
  }

  // Rivers whose sources were not reached (islands of network) still get drawn.
  for (let index = 0; index < size; index += 1) {
    if (isRiver(index) && visited[index] === 0) {
      walk(index);
    }
  }

  return polylines;
}
