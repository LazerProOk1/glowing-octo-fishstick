import { hash2D } from './noise';

export interface HydrologyOptions {
  readonly elevation: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly seaLevel: number;
  readonly seed: number;
  /** Elevation jitter that bends channels into meanders */
  readonly meander: number;
  /** Flow accumulation at which a tile becomes a drawn river */
  readonly riverThreshold: number;
}

export interface Hydrology {
  readonly flowAccumulation: Float32Array;
  readonly flowDownstream: Int32Array;
  readonly riverTiles: Uint8Array;
}

/**
 * D8 flow routing with accumulation. Every land tile drains into its lowest
 * neighbour, upstream counts are summed in descending elevation order, and the
 * tiles above the accumulation threshold form the dendritic river network.
 */
export function computeHydrology(options: HydrologyOptions): Hydrology {
  const { elevation, width, height, seaLevel, seed, meander, riverThreshold } = options;
  const size = width * height;
  const accumulation = new Float32Array(size);
  const downstream = new Int32Array(size);
  downstream.fill(-1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      accumulation[index] = 1;

      const current = elevation[index] ?? 0;
      if (current <= seaLevel) {
        continue;
      }

      let bestScore = Number.POSITIVE_INFINITY;
      let bestIndex = -1;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const neighbour = ny * width + nx;
          const value = elevation[neighbour] ?? 0;
          if (value >= current) {
            continue;
          }
          const score = value + hash2D(nx, ny, seed + 4211) * meander;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = neighbour;
          }
        }
      }

      downstream[index] = bestIndex;
    }
  }

  const order = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    order[index] = index;
  }
  order.sort((a, b) => (elevation[b] ?? 0) - (elevation[a] ?? 0));

  for (let i = 0; i < size; i += 1) {
    const index = order[i] ?? 0;
    const next = downstream[index] ?? -1;
    if (next >= 0) {
      accumulation[next] = (accumulation[next] ?? 0) + (accumulation[index] ?? 0);
    }
  }

  const riverTiles = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    if ((elevation[index] ?? 0) > seaLevel && (accumulation[index] ?? 0) >= riverThreshold) {
      riverTiles[index] = 1;
    }
  }

  return { flowAccumulation: accumulation, flowDownstream: downstream, riverTiles };
}
