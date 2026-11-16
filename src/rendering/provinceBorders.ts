import { SEA_LEVEL } from '@/simulation/mapGenerator';
import { hash2D } from '@/simulation/noise';
import type { World } from '@/types/world';

export interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Raw boundary polyline in tile coordinates. Smoothing happens in the renderer:
 * a midpoint quadratic curve through these vertices has no corners at all.
 */
export interface BoundaryPolyline {
  readonly points: readonly CurvePoint[];
  readonly closed: boolean;
}

interface LatticePoint {
  readonly x: number;
  readonly y: number;
}

interface BorderEdge {
  readonly from: number;
  readonly to: number;
}

interface Chain {
  readonly points: readonly LatticePoint[];
  readonly closed: boolean;
}

/** Douglas-Peucker tolerance in tiles: collapses the tile staircase into runs */
const SIMPLIFY_TOLERANCE = 1;
/** Deterministic vertex jitter in tiles: breaks the square grid of the lattice */
const VERTEX_JITTER = 0.3;

/** The coastline is clipped geometry, so it follows the bake more closely */
const COAST_SIMPLIFY_TOLERANCE = 0.4;
const COAST_JITTER = 0.08;

const JITTER_SEED_X = 1297;
const JITTER_SEED_Y = 2699;

function distance(a: CurvePoint, b: CurvePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Perpendicular distance from `point` to the segment `start`-`end` */
function segmentDistance(point: CurvePoint, start: CurvePoint, end: CurvePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return distance(point, start);
  }
  const t = Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

/** Douglas-Peucker: the staircase becomes a handful of long runs */
function simplify(points: readonly LatticePoint[], tolerance: number): LatticePoint[] {
  if (points.length <= 2) {
    return [...points];
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<readonly [number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (range === undefined) {
      break;
    }
    const [first, last] = range;
    const start = points[first];
    const end = points[last];
    if (start === undefined || end === undefined) {
      continue;
    }

    let worstDistance = 0;
    let worstIndex = -1;
    for (let index = first + 1; index < last; index += 1) {
      const point = points[index];
      if (point === undefined) {
        continue;
      }
      const candidate = segmentDistance(point, start, end);
      if (candidate > worstDistance) {
        worstDistance = candidate;
        worstIndex = index;
      }
    }

    if (worstIndex >= 0 && worstDistance > tolerance) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const result: LatticePoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined && keep[index] === 1) {
      result.push(point);
    }
  }
  return result;
}

/**
 * Vertex displacement keyed by the lattice coordinate itself, so the two
 * provinces that share a border compute exactly the same displacement and the
 * highlight polygon never drifts away from the stroked line.
 */
function jitterPoint(point: LatticePoint, seed: number, amplitude: number): CurvePoint {
  const keyX = Math.round(point.x * 4);
  const keyY = Math.round(point.y * 4);
  const offsetX = (hash2D(keyX, keyY, seed + JITTER_SEED_X) - 0.5) * 2;
  const offsetY = (hash2D(keyX, keyY, seed + JITTER_SEED_Y) - 0.5) * 2;
  return {
    x: point.x + offsetX * amplitude,
    y: point.y + offsetY * amplitude,
  };
}

function prepare(
  points: readonly LatticePoint[],
  seed: number,
  tolerance: number,
  amplitude: number,
): CurvePoint[] {
  return simplify(points, tolerance).map((point) => jitterPoint(point, seed, amplitude));
}

function latticeKey(x: number, y: number, latticeWidth: number): number {
  return y * latticeWidth + x;
}

function latticePoint(key: number, latticeWidth: number): LatticePoint {
  return { x: key % latticeWidth, y: Math.floor(key / latticeWidth) };
}

/** Links unordered lattice edges into open chains or closed loops. */
function linkChains(edges: readonly BorderEdge[], latticeWidth: number): Chain[] {
  if (edges.length === 0) {
    return [];
  }

  const adjacency = new Map<number, number[]>();
  const used = new Uint8Array(edges.length);

  edges.forEach((edge, index) => {
    const fromList = adjacency.get(edge.from);
    if (fromList === undefined) {
      adjacency.set(edge.from, [index]);
    } else {
      fromList.push(index);
    }
    const toList = adjacency.get(edge.to);
    if (toList === undefined) {
      adjacency.set(edge.to, [index]);
    } else {
      toList.push(index);
    }
  });

  const chains: Chain[] = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex] === 1) {
      continue;
    }
    const startEdge = edges[startIndex];
    if (startEdge === undefined) {
      continue;
    }

    used[startIndex] = 1;
    const nodes: number[] = [startEdge.from];
    let current = startEdge.from;
    let edgeIndex = startIndex;
    let closed = false;

    for (;;) {
      const edge = edges[edgeIndex];
      if (edge === undefined) {
        break;
      }
      const next = edge.from === current ? edge.to : edge.from;
      if (next === nodes[0]) {
        nodes.push(next);
        closed = true;
        break;
      }
      nodes.push(next);

      let nextEdgeIndex = -1;
      for (const candidate of adjacency.get(next) ?? []) {
        if (used[candidate] === 1) {
          continue;
        }
        nextEdgeIndex = candidate;
        break;
      }
      if (nextEdgeIndex < 0) {
        break;
      }
      used[nextEdgeIndex] = 1;
      current = next;
      edgeIndex = nextEdgeIndex;
    }

    chains.push({ points: nodes.map((key) => latticePoint(key, latticeWidth)), closed });
  }

  return chains;
}

/**
 * Splits the interior border graph into elementary chains: a chain starts and
 * ends at a junction (three or more provinces) or where the boundary meets the
 * coast, so the province on the other side of a chain is constant. The fill and
 * the stroke therefore share exactly the same polyline.
 */
function splitBorderChains(
  edges: readonly BorderEdge[],
  latticeWidth: number,
  isCoastNode: (x: number, y: number) => boolean,
): Chain[] {
  if (edges.length === 0) {
    return [];
  }

  const adjacency = new Map<number, number[]>();
  const used = new Uint8Array(edges.length);

  edges.forEach((edge, index) => {
    const fromList = adjacency.get(edge.from);
    if (fromList === undefined) {
      adjacency.set(edge.from, [index]);
    } else {
      fromList.push(index);
    }
    const toList = adjacency.get(edge.to);
    if (toList === undefined) {
      adjacency.set(edge.to, [index]);
    } else {
      toList.push(index);
    }
  });

  const isJunction = (node: number): boolean => {
    if ((adjacency.get(node)?.length ?? 0) !== 2) {
      return true;
    }
    return isCoastNode(node % latticeWidth, Math.floor(node / latticeWidth));
  };

  const walk = (startEdge: number, startNode: number): Chain => {
    used[startEdge] = 1;
    const nodes: number[] = [startNode];
    let current = startNode;
    let edgeIndex = startEdge;

    for (;;) {
      const edge = edges[edgeIndex];
      if (edge === undefined) {
        break;
      }
      const next = edge.from === current ? edge.to : edge.from;
      if (next === nodes[0]) {
        nodes.push(next);
        return { points: nodes.map((key) => latticePoint(key, latticeWidth)), closed: true };
      }
      nodes.push(next);

      if (isJunction(next)) {
        break;
      }

      let nextEdgeIndex = -1;
      for (const candidate of adjacency.get(next) ?? []) {
        if (used[candidate] === 1) {
          continue;
        }
        nextEdgeIndex = candidate;
        break;
      }
      if (nextEdgeIndex < 0) {
        break;
      }
      used[nextEdgeIndex] = 1;
      current = next;
      edgeIndex = nextEdgeIndex;
    }

    return { points: nodes.map((key) => latticePoint(key, latticeWidth)), closed: false };
  };

  const chains: Chain[] = [];

  for (const edgeIndex of edges.keys()) {
    if (used[edgeIndex] === 1) {
      continue;
    }
    const edge = edges[edgeIndex];
    if (edge === undefined || !isJunction(edge.from)) {
      continue;
    }
    chains.push(walk(edgeIndex, edge.from));
  }

  // Pure cycles have no junction to start from.
  for (const edgeIndex of edges.keys()) {
    if (used[edgeIndex] === 1) {
      continue;
    }
    const edge = edges[edgeIndex];
    if (edge === undefined) {
      continue;
    }
    chains.push(walk(edgeIndex, edge.from));
  }

  return chains;
}

function unorderedEdgeKey(a: LatticePoint, b: LatticePoint, latticeWidth: number): string {
  const first = latticeKey(a.x, a.y, latticeWidth);
  const second = latticeKey(b.x, b.y, latticeWidth);
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

interface BorderGraph {
  readonly chains: readonly Chain[];
  /** Canonical edge key -> chain that contains it */
  readonly edgeChains: Map<string, { readonly chain: number }>;
}

/** Interior political borders: land province against a different land province. */
function buildBorderGraph(world: World): BorderGraph {
  const { width, height, tiles } = world;
  const latticeWidth = width + 1;
  const edges: BorderEdge[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < width; x += 1) {
      const id = row[x]?.provinceId ?? -1;
      if (id < 0) {
        continue;
      }

      const east = row[x + 1]?.provinceId;
      if (east !== undefined && east >= 0 && east !== id) {
        edges.push({
          from: latticeKey(x + 1, y, latticeWidth),
          to: latticeKey(x + 1, y + 1, latticeWidth),
        });
      }

      const south = tiles[y + 1]?.[x]?.provinceId;
      if (south !== undefined && south >= 0 && south !== id) {
        edges.push({
          from: latticeKey(x, y + 1, latticeWidth),
          to: latticeKey(x + 1, y + 1, latticeWidth),
        });
      }
    }
  }

  const isCoastNode = (x: number, y: number): boolean => {
    let land = 0;
    let water = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const) {
      const tile = tiles[y + dy]?.[x + dx];
      if (tile !== undefined && tile.elevation >= SEA_LEVEL) {
        land += 1;
      } else {
        water += 1;
      }
    }
    return land > 0 && water > 0;
  };

  const chains = splitBorderChains(edges, latticeWidth, isCoastNode);
  const edgeChains = new Map<string, { chain: number }>();

  chains.forEach((chain, chainIndex) => {
    for (let index = 0; index < chain.points.length - 1; index += 1) {
      const first = chain.points[index];
      const second = chain.points[index + 1];
      if (first === undefined || second === undefined) {
        continue;
      }
      edgeChains.set(unorderedEdgeKey(first, second, latticeWidth), { chain: chainIndex });
    }
  });

  return { chains, edgeChains };
}

/** Smoothed political borders, ready to be stroked. */
export function buildProvinceBorders(world: World): BoundaryPolyline[] {
  const { chains } = buildBorderGraph(world);
  const polylines: BoundaryPolyline[] = [];

  for (const chain of chains) {
    const points = prepare(chain.points, world.seed, SIMPLIFY_TOLERANCE, VERTEX_JITTER);
    if (points.length >= 2) {
      polylines.push({ points, closed: chain.closed });
    }
  }

  return polylines;
}

/**
 * Closed boundary of one province. Shared borders reuse the prepared points of
 * the border chains, so the highlight polygon and the stroked line are the very
 * same polyline; only the coastline is generated separately.
 */
export function buildProvinceOutline(world: World, provinceId: number): BoundaryPolyline[] {
  const { width, height, tiles } = world;
  const latticeWidth = width + 1;
  const { chains, edgeChains } = buildBorderGraph(world);

  const edges: BorderEdge[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < width; x += 1) {
      if (row[x]?.provinceId !== provinceId) {
        continue;
      }
      if ((row[x - 1]?.provinceId ?? -1) !== provinceId) {
        edges.push({
          from: latticeKey(x, y, latticeWidth),
          to: latticeKey(x, y + 1, latticeWidth),
        });
      }
      if ((row[x + 1]?.provinceId ?? -1) !== provinceId) {
        edges.push({
          from: latticeKey(x + 1, y, latticeWidth),
          to: latticeKey(x + 1, y + 1, latticeWidth),
        });
      }
      if ((tiles[y - 1]?.[x]?.provinceId ?? -1) !== provinceId) {
        edges.push({
          from: latticeKey(x, y, latticeWidth),
          to: latticeKey(x + 1, y, latticeWidth),
        });
      }
      if ((tiles[y + 1]?.[x]?.provinceId ?? -1) !== provinceId) {
        edges.push({
          from: latticeKey(x, y + 1, latticeWidth),
          to: latticeKey(x + 1, y + 1, latticeWidth),
        });
      }
    }
  }

  const loops = linkChains(edges, latticeWidth);
  const polylines: BoundaryPolyline[] = [];
  const preparedChains = new Map<number, CurvePoint[]>();

  const preparedChain = (chainIndex: number): CurvePoint[] => {
    const cached = preparedChains.get(chainIndex);
    if (cached !== undefined) {
      return cached;
    }
    const chain = chains[chainIndex];
    const points = chain === undefined ? [] : prepare(chain.points, world.seed, SIMPLIFY_TOLERANCE, VERTEX_JITTER);
    preparedChains.set(chainIndex, points);
    return points;
  };

  for (const loop of loops) {
    if (loop.points.length < 3) {
      continue;
    }

    const points = loop.points;
    const count = points.length;
    const prepared: CurvePoint[] = [];

    let index = 0;
    while (index < count) {
      const from = points[index];
      const to = points[(index + 1) % count];
      if (from === undefined || to === undefined) {
        index += 1;
        continue;
      }

      const key = unorderedEdgeKey(from, to, latticeWidth);
      const chainRef = edgeChains.get(key);

      // Walk the maximal run of edges that belongs to one chain (shared border)
      // or to no chain at all (coastline).
      const run: LatticePoint[] = [from];
      while (index < count) {
        const runFrom = points[index];
        const runTo = points[(index + 1) % count];
        if (runFrom === undefined || runTo === undefined) {
          break;
        }
        const runRef = edgeChains.get(unorderedEdgeKey(runFrom, runTo, latticeWidth));
        if (chainRef === undefined) {
          if (runRef !== undefined) {
            break;
          }
        } else if (runRef === undefined || runRef.chain !== chainRef.chain) {
          break;
        }
        run.push(runTo);
        index += 1;
      }

      if (chainRef === undefined) {
        const coast = prepare(run, world.seed, COAST_SIMPLIFY_TOLERANCE, COAST_JITTER);
        for (let position = prepared.length === 0 ? 0 : 1; position < coast.length; position += 1) {
          const point = coast[position];
          if (point !== undefined) {
            prepared.push(point);
          }
        }
        continue;
      }

      const chain = chains[chainRef.chain];
      const chainPoints = preparedChain(chainRef.chain);
      const wholeChain = chain !== undefined && chain.points.length === run.length;
      const chainStart = chain?.points[0];
      const forward =
        wholeChain && chainStart !== undefined && from.x === chainStart.x && from.y === chainStart.y;
      const ordered = wholeChain
        ? forward
          ? chainPoints
          : [...chainPoints].reverse()
        : prepare(run, world.seed, SIMPLIFY_TOLERANCE, VERTEX_JITTER);

      for (let position = prepared.length === 0 ? 0 : 1; position < ordered.length; position += 1) {
        const point = ordered[position];
        if (point !== undefined) {
          prepared.push(point);
        }
      }
    }

    if (prepared.length >= 3) {
      polylines.push({ points: prepared, closed: true });
    }
  }

  return polylines;
}

/**
 * Land silhouette from the elevation field by marching squares, so the clip
 * follows the interpolated coastline of the bake instead of the tile blocks.
 */
export function buildLandOutline(world: World): BoundaryPolyline[] {
  const { width, height, elevationMap } = world;
  const latticeWidth = width + 1;
  const segments: Array<readonly [number, number]> = [];
  const points = new Map<number, CurvePoint>();

  const horizontalKey = (x: number, y: number): number => latticeKey(x, y, latticeWidth) * 2;
  const verticalKey = (x: number, y: number): number => latticeKey(x, y, latticeWidth) * 2 + 1;

  const sample = (key: number, point: CurvePoint): number => {
    if (!points.has(key)) {
      points.set(key, point);
    }
    return key;
  };

  const elevationAt = (x: number, y: number): number => elevationMap[y * width + x] ?? 0;
  const cross = (first: number, second: number): number | null => {
    if (first === second) {
      return null;
    }
    if (first > SEA_LEVEL === second > SEA_LEVEL) {
      return null;
    }
    return (SEA_LEVEL - first) / (second - first);
  };

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = elevationAt(x, y);
      const b = elevationAt(x + 1, y);
      const c = elevationAt(x + 1, y + 1);
      const d = elevationAt(x, y + 1);

      const topT = cross(a, b);
      const rightT = cross(b, c);
      const bottomT = cross(d, c);
      const leftT = cross(a, d);

      const top = topT === null ? null : sample(horizontalKey(x, y), { x: x + topT, y });
      const right = rightT === null ? null : sample(verticalKey(x + 1, y), { x: x + 1, y: y + rightT });
      const bottom = bottomT === null ? null : sample(horizontalKey(x, y + 1), { x: x + bottomT, y: y + 1 });
      const left = leftT === null ? null : sample(verticalKey(x, y), { x, y: y + leftT });

      const index =
        (a > SEA_LEVEL ? 8 : 0) |
        (b > SEA_LEVEL ? 4 : 0) |
        (c > SEA_LEVEL ? 2 : 0) |
        (d > SEA_LEVEL ? 1 : 0);
      const centerIsLand = (a + b + c + d) / 4 > SEA_LEVEL;

      const push = (first: number | null, second: number | null): void => {
        if (first === null || second === null) {
          return;
        }
        segments.push([first, second]);
      };

      switch (index) {
        case 1:
        case 14:
          push(left, bottom);
          break;
        case 2:
        case 13:
          push(bottom, right);
          break;
        case 3:
        case 12:
          push(left, right);
          break;
        case 4:
        case 11:
          push(top, right);
          break;
        case 6:
        case 9:
          push(top, bottom);
          break;
        case 7:
        case 8:
          push(top, left);
          break;
        case 5:
          if (centerIsLand) {
            push(top, right);
            push(bottom, left);
          } else {
            push(top, left);
            push(bottom, right);
          }
          break;
        case 10:
          if (centerIsLand) {
            push(top, left);
            push(bottom, right);
          } else {
            push(top, right);
            push(bottom, left);
          }
          break;
        default:
          break;
      }
    }
  }

  const adjacency = new Map<number, number[]>();
  const used = new Uint8Array(segments.length);

  segments.forEach((segment, index) => {
    const [from, to] = segment;
    const fromList = adjacency.get(from);
    if (fromList === undefined) {
      adjacency.set(from, [index]);
    } else {
      fromList.push(index);
    }
    const toList = adjacency.get(to);
    if (toList === undefined) {
      adjacency.set(to, [index]);
    } else {
      toList.push(index);
    }
  });

  const loops: number[][] = [];

  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    if (used[startIndex] === 1) {
      continue;
    }
    const start = segments[startIndex];
    if (start === undefined) {
      continue;
    }

    used[startIndex] = 1;
    const nodes: number[] = [start[0], start[1]];
    let current = start[1];

    for (let step = 0; step < segments.length; step += 1) {
      let nextEdge = -1;
      for (const candidate of adjacency.get(current) ?? []) {
        if (used[candidate] === 1) {
          continue;
        }
        nextEdge = candidate;
        break;
      }
      if (nextEdge < 0) {
        break;
      }
      used[nextEdge] = 1;
      const edge = segments[nextEdge];
      if (edge === undefined) {
        break;
      }
      const next = edge[0] === current ? edge[1] : edge[0];
      current = next;
      if (current === nodes[0]) {
        break;
      }
      nodes.push(current);
    }

    if (nodes.length > 2) {
      loops.push(nodes);
    }
  }

  const polylines: BoundaryPolyline[] = [];

  for (const loop of loops) {
    const raw: LatticePoint[] = loop
      .map((key) => points.get(key))
      .filter((point): point is CurvePoint => point !== undefined)
      .map((point) => ({ x: point.x, y: point.y }));

    if (raw.length < 3) {
      continue;
    }

    const prepared = prepare(raw, world.seed, COAST_SIMPLIFY_TOLERANCE, COAST_JITTER);
    if (prepared.length >= 3) {
      polylines.push({ points: prepared, closed: true });
    }
  }

  return polylines;
}
