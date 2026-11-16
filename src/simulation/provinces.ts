import type { Biome, Province, Tile, TileCoord } from '@/types/world';
import { createNoise2D, hash2D } from './noise';

/** Must match SEA_LEVEL in mapGenerator: land starts here, water stays unowned */
const SEA_LEVEL = 24;

export interface ProvinceOptions {
  readonly tiles: Tile[][];
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** How many provinces to grow: small HoI4-style cells need several hundred */
  readonly targetCount: number;
  /** Highest Chebyshev distance between seeds, relaxed until targetCount is met */
  readonly minSeedSpacing: number;
}

/** Terrain cost of entering a tile; plains are the cheap baseline */
const PLAINS_COST = 1;
const HILL_COST = 2.5;
const MOUNTAIN_COST = 6;
const WATER_COST = 0;

const DIAGONAL_COST = 1.4142;

/** Jagged borders come from noise on top of the terrain cost */
const COST_NOISE_AMPLITUDE = 1.5;
const COST_NOISE_FREQUENCY = 0.17;
const MIN_STEP_COST = 0.25;
const MAX_COST = 40;

const BIOME_COST: Record<Biome, number> = {
  ocean: WATER_COST,
  coast: WATER_COST,
  plains: PLAINS_COST,
  forest: 1.4,
  mountains: HILL_COST,
  desert: 1.3,
  tundra: 1.6,
  swamp: 2.2,
  volcanic: 4,
};

/** True for tiles a province may claim: land only, water is never owned. */
export function isLandTile(tile: Tile): boolean {
  return tile.elevation >= SEA_LEVEL;
}

/** Terrain cost of entering a tile: ridges and wetlands are expensive on purpose. */
export function terrainCost(tile: Tile): number {
  if (!isLandTile(tile)) {
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
    const lastNode = this.nodes.pop();
    if (top === undefined || lastNode === undefined) {
      return top;
    }
    if (this.nodes.length === 0) {
      return top;
    }
    this.nodes[0] = lastNode;
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
      const smallestAfterLeft = this.nodes[smallest];
      if (
        rightNode !== undefined &&
        smallestAfterLeft !== undefined &&
        rightNode.cost < smallestAfterLeft.cost
      ) {
        smallest = right;
      }
      if (smallest === parent) {
        break;
      }
      const swapA = this.nodes[parent];
      const swapB = this.nodes[smallest];
      if (swapA === undefined || swapB === undefined) {
        break;
      }
      this.nodes[parent] = swapB;
      this.nodes[smallest] = swapA;
      parent = smallest;
    }
    return top;
  }
}

interface SeedCandidate extends TileCoord {
  readonly priority: number;
}

/**
 * Picks province seeds over land only, using hashed priority instead of a grid.
 * Spacing starts wide and is relaxed step by step, so the cells stay as even as
 * the coastline allows while still reaching the target count.
 */
function pickSeeds(options: ProvinceOptions): TileCoord[] {
  const { tiles, width, height, seed, targetCount, minSeedSpacing } = options;
  const candidates: SeedCandidate[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < width; x += 1) {
      const tile = row[x];
      if (tile === undefined || !isLandTile(tile)) {
        continue;
      }
      candidates.push({ x, y, priority: hash2D(x, y, seed + 8123) });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);

  const seeds: TileCoord[] = [];
  const seeded = new Uint8Array(width * height);

  const isFree = (x: number, y: number, spacing: number): boolean => {
    for (let dy = -spacing; dy <= spacing; dy += 1) {
      for (let dx = -spacing; dx <= spacing; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        if (seeded[ny * width + nx] === 1) {
          return false;
        }
      }
    }
    return true;
  };

  for (let spacing = minSeedSpacing; spacing >= 1 && seeds.length < targetCount; spacing -= 1) {
    for (const candidate of candidates) {
      if (seeds.length >= targetCount) {
        break;
      }
      if (seeded[candidate.y * width + candidate.x] === 1) {
        continue;
      }
      if (!isFree(candidate.x, candidate.y, spacing)) {
        continue;
      }
      seeded[candidate.y * width + candidate.x] = 1;
      seeds.push({ x: candidate.x, y: candidate.y });
    }
  }

  return seeds;
}

/**
 * Grows provinces with a multi-source Dijkstra restricted to land. Water tiles
 * are never claimed, so the coastline itself is the province border; high
 * frequency noise on the step cost keeps the inland borders ragged instead of
 * straight squares.
 */
export function generateProvinces(options: ProvinceOptions): Province[] {
  const { tiles, width, height, seed } = options;
  const size = width * height;
  const seeds = pickSeeds(options);

  if (seeds.length === 0) {
    return [];
  }

  const noise = createNoise2D(seed * 31 + 6151);
  const provinceByIndex = new Int32Array(size);
  provinceByIndex.fill(-1);
  const bestCost = new Float64Array(size);
  bestCost.fill(Number.POSITIVE_INFINITY);

  const costCache = new Float32Array(size);
  const land = new Uint8Array(size);

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
      const index = y * width + x;
      const terrain = terrainCost(tile);
      const noiseCost = noise(x * COST_NOISE_FREQUENCY, y * COST_NOISE_FREQUENCY) * COST_NOISE_AMPLITUDE;
      costCache[index] = Math.min(MAX_COST, Math.max(MIN_STEP_COST, terrain + noiseCost));
      land[index] = isLandTile(tile) ? 1 : 0;
    }
  }

  const queue = new CostQueue();

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
      if (land[neighbourIndex] !== 1) {
        continue;
      }
      const nextCost = node.cost + (costCache[neighbourIndex] ?? PLAINS_COST) * distance;
      if (nextCost >= (bestCost[neighbourIndex] ?? Number.POSITIVE_INFINITY)) {
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
      const provinceId = land[y * width + x] === 1 ? (provinceByIndex[y * width + x] ?? -1) : -1;
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
