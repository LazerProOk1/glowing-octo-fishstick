import type { Biome, Province, Tile, TileCoord } from '@/types/world';
import { hash2D } from './noise';

export interface ProvinceOptions {
  readonly tiles: Tile[][];
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** How many provinces to try to grow */
  readonly targetCount: number;
  /** Chebyshev distance between province seeds in tiles */
  readonly minSeedSpacing: number;
  /** Cost at which growth stops, keeping open sea unclaimed */
  readonly maxCost: number;
}

const SEA_LEVEL = 24;

const WATER_COST = 9;
const MOUNTAIN_COST = 7;
const HILL_COST = 3;
const DIAGONAL_COST = 1.4142;

const BIOME_COST: Record<Biome, number> = {
  ocean: WATER_COST,
  coast: WATER_COST,
  plains: 1,
  forest: 1.8,
  mountains: HILL_COST,
  desert: 1.7,
  tundra: 2,
  swamp: 3,
  volcanic: 6,
};

/** Terrain cost of entering a tile: ridges and water are expensive on purpose. */
export function terrainCost(tile: Tile): number {
  if (tile.elevation <= SEA_LEVEL) {
    return WATER_COST;
  }
  if (tile.elevation >= 70) {
    return MOUNTAIN_COST;
  }
  if (tile.elevation >= 50) {
    return HILL_COST;
  }
  return BIOME_COST[tile.biome];
}

interface QueueNode {
  readonly cost: number;
  readonly index: number;
}

/** Minimal binary heap, enough for a grid Dijkstra. */
class CostQueue {
  private readonly nodes: QueueNode[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: QueueNode): void {
    this.nodes.push(node);
    let child = this.nodes.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const parentNode = this.nodes[parent];
      const childNode = this.nodes[child];
      if (parentNode === undefined || childNode === undefined || parentNode.cost <= childNode.cost) {
        break;
      }
      this.nodes[parent] = childNode;
      this.nodes[child] = parentNode;
      child = parent;
    }
  }

  pop(): QueueNode | undefined {
    const top = this.nodes[0];
    const last = this.nodes.pop();
    if (top === undefined || last === undefined) {
      return top;
    }
    if (this.nodes.length > 0) {
      this.nodes[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        const smallestNode = this.nodes[smallest];
        const leftNode = this.nodes[left];
        const rightNode = this.nodes[right];
        if (leftNode !== undefined && smallestNode !== undefined && leftNode.cost < smallestNode.cost) {
          smallest = left;
        }
        const currentSmallest = this.nodes[smallest];
        if (rightNode !== undefined && currentSmallest !== undefined && rightNode.cost < currentSmallest.cost) {
          smallest = right;
        }
        if (smallest === parent) {
          break;
        }
        const a = this.nodes[parent];
        const b = this.nodes[smallest];
        if (a === undefined || b === undefined) {
          break;
        }
        this.nodes[parent] = b;
        this.nodes[smallest] = a;
        parent = smallest;
      }
    }
    return top;
  }
}

interface SeedCandidate {
  readonly x: number;
  readonly y: number;
  readonly priority: number;
}

function pickSeeds(options: ProvinceOptions): TileCoord[] {
  const { tiles, width, height, seed, targetCount, minSeedSpacing } = options;
  const candidates: SeedCandidate[] = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const tile = tiles[y]?.[x];
      if (tile === undefined || tile.elevation <= SEA_LEVEL + 1) {
        continue;
      }
      candidates.push({ x, y, priority: hash2D(x, y, seed + 8123) });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);

  const seeds: TileCoord[] = [];
  for (const candidate of candidates) {
    if (seeds.length >= targetCount) {
      break;
    }
    const tooClose = seeds.some(
      (seedTile) =>
        Math.abs(seedTile.x - candidate.x) <= minSeedSpacing &&
        Math.abs(seedTile.y - candidate.y) <= minSeedSpacing,
    );
    if (tooClose) {
      continue;
    }
    seeds.push({ x: candidate.x, y: candidate.y });
  }

  return seeds;
}

/**
 * Grows provinces with a multi-source Dijkstra. Because mountain and water tiles
 * are 5-10x more expensive than plains, borders settle on ridges and coastlines
 * instead of cutting across them.
 */
export function generateProvinces(options: ProvinceOptions): Province[] {
  const { tiles, width, height, maxCost } = options;
  const size = width * height;
  const seeds = pickSeeds(options);

  if (seeds.length === 0) {
    return [];
  }

  const provinceByIndex = new Int32Array(size);
  provinceByIndex.fill(-1);
  const bestCost = new Float64Array(size);
  bestCost.fill(Number.POSITIVE_INFINITY);

  const queue = new CostQueue();
  const costCache = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const tile = tiles[Math.floor(index / width)]?.[index % width];
    costCache[index] = tile === undefined ? WATER_COST : terrainCost(tile);
  }

  seeds.forEach((seedTile, provinceId) => {
    const index = seedTile.y * width + seedTile.x;
    provinceByIndex[index] = provinceId;
    bestCost[index] = 0;
    queue.push({ cost: 0, index });
  });

  const neighbours: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, DIAGONAL_COST],
    [1, -1, DIAGONAL_COST],
    [-1, 1, DIAGONAL_COST],
    [-1, -1, DIAGONAL_COST],
  ];

  while (queue.size > 0) {
    const node = queue.pop();
    if (node === undefined) {
      break;
    }
    if (node.cost > (bestCost[node.index] ?? Number.POSITIVE_INFINITY)) {
      continue;
    }

    const x = node.index % width;
    const y = Math.floor(node.index / width);
    const provinceId = provinceByIndex[node.index] ?? -1;
    if (provinceId < 0) {
      continue;
    }

    for (const [dx, dy, distance] of neighbours) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const neighbourIndex = ny * width + nx;
      const nextCost = node.cost + (costCache[neighbourIndex] ?? WATER_COST) * distance;
      if (nextCost > maxCost || nextCost >= (bestCost[neighbourIndex] ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      bestCost[neighbourIndex] = nextCost;
      provinceByIndex[neighbourIndex] = provinceId;
      queue.push({ cost: nextCost, index: neighbourIndex });
    }
  }

  const biomeCounts = seeds.map(() => new Map<Biome, number>());
  const tileCounts = seeds.map(() => 0);

  for (let y = 0; y < height; y += 1) {
    const row = tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < width; x += 1) {
      const tile = row[x];
      if (tile === undefined) {
        continue;
      }
      const provinceId = provinceByIndex[y * width + x] ?? -1;
      tile.provinceId = provinceId;
      if (provinceId < 0) {
        continue;
      }
      tileCounts[provinceId] = (tileCounts[provinceId] ?? 0) + 1;
      const counts = biomeCounts[provinceId];
      if (counts !== undefined) {
        counts.set(tile.biome, (counts.get(tile.biome) ?? 0) + 1);
      }
    }
  }

  const provinces: Province[] = [];

  seeds.forEach((seedTile, provinceId) => {
    const counts = biomeCounts[provinceId];
    let dominantBiome: Biome = 'plains';
    let best = 0;
    if (counts !== undefined) {
      for (const [biome, count] of counts) {
        if (count > best) {
          best = count;
          dominantBiome = biome;
        }
      }
    }
    provinces.push({
      id: provinceId,
      seed: seedTile,
      tileCount: tileCounts[provinceId] ?? 0,
      dominantBiome,
      population: 0,
      ownerId: null,
    });
  });

  return provinces;
}
