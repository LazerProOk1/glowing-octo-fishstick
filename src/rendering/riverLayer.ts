import type { TileCoord, World } from '@/types/world';
import { PIXELS_PER_TILE } from './bakeMap';

export interface RiverPolyline {
  /** Points in baked pixel space */
  readonly points: readonly TileCoord[];
  /** Stroke width in baked pixels at zoom 1 */
  readonly width: number;
}

const MINOR_RIVER_WIDTH = 1.2;
const MAJOR_RIVER_WIDTH = 1.9;
const MAJOR_RIVER_ANGLE = 120;

function centre(tileIndex: number, tileWidth: number): TileCoord {
  const x = tileIndex % tileWidth;
  const y = Math.floor(tileIndex / tileWidth);
  return {
    x: x * PIXELS_PER_TILE + PIXELS_PER_TILE / 2,
    y: y * PIXELS_PER_TILE + PIXELS_PER_TILE / 2,
  };
}

/**
 * Turns the D8 network into polylines from spring to mouth. The renderer strokes
 * them with smoothing, so rivers stay vector-crisp at any zoom.
 */
export function buildRiverPolylines(world: World): RiverPolyline[] {
  const tileWidth = world.width;
  const size = world.width * world.height;
  const isRiver = new Uint8Array(size);
  let riverCount = 0;

  for (let y = 0; y < world.height; y += 1) {
    const row = world.tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < world.width; x += 1) {
      if (row[x]?.river === true) {
        isRiver[y * tileWidth + x] = 1;
        riverCount += 1;
      }
    }
  }

  if (riverCount === 0) {
    return [];
  }

  const hasUpstream = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    if (isRiver[index] !== 1) {
      continue;
    }
    const downstream = world.flowDownstream[index] ?? -1;
    if (downstream >= 0) {
      hasUpstream[downstream] = 1;
    }
  }

  const polylines: RiverPolyline[] = [];

  for (let head = 0; head < size; head += 1) {
    if (isRiver[head] !== 1 || hasUpstream[head] === 1) {
      continue;
    }

    const points: TileCoord[] = [centre(head, tileWidth)];
    let peakAccumulation = world.flowAccumulation[head] ?? 0;
    let current = head;

    for (let step = 0; step < size; step += 1) {
      const downstream = world.flowDownstream[current] ?? -1;
      if (downstream < 0) {
        break;
      }
      points.push(centre(downstream, tileWidth));
      peakAccumulation = Math.max(peakAccumulation, world.flowAccumulation[downstream] ?? 0);
      if (isRiver[downstream] !== 1) {
        break;
      }
      current = downstream;
    }

    if (points.length < 3) {
      continue;
    }

    polylines.push({
      points,
      width: peakAccumulation >= MAJOR_RIVER_ANGLE ? MAJOR_RIVER_WIDTH : MINOR_RIVER_WIDTH,
    });
  }

  return polylines;
}
