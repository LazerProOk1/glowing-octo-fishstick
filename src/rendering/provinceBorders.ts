import type { World } from '@/types/world';

export interface BorderPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProvinceBorderLoop {
  readonly points: readonly BorderPoint[];
  readonly closed: boolean;
}

const SMOOTHING_ITERATIONS = 2;
const MIN_LOOP_POINTS = 4;

interface Edge {
  readonly from: number;
  readonly to: number;
}

function chaikin(points: readonly BorderPoint[], closed: boolean): BorderPoint[] {
  if (points.length < MIN_LOOP_POINTS) {
    return [...points];
  }

  let current: readonly BorderPoint[] = points;
  for (let iteration = 0; iteration < SMOOTHING_ITERATIONS; iteration += 1) {
    const next: BorderPoint[] = [];
    const count = current.length;
    const last = closed ? count : count - 1;

    if (!closed) {
      const first = current[0];
      if (first !== undefined) {
        next.push(first);
      }
    }

    for (let index = 0; index < last; index += 1) {
      const point = current[index];
      const nextPoint = current[(index + 1) % count];
      if (point === undefined || nextPoint === undefined) {
        continue;
      }
      next.push({ x: point.x * 0.75 + nextPoint.x * 0.25, y: point.y * 0.75 + nextPoint.y * 0.25 });
      next.push({ x: point.x * 0.25 + nextPoint.x * 0.75, y: point.y * 0.25 + nextPoint.y * 0.75 });
    }

    if (!closed) {
      const lastPoint = current[count - 1];
      if (lastPoint !== undefined) {
        next.push(lastPoint);
      }
    }

    current = next;
  }

  return [...current];
}

/**
 * Collects the tile edges where two provinces meet, links them into loops and
 * smooths the loops with Chaikin, so political borders read as drawn curves
 * instead of a 4 px staircase.
 */
export function buildProvinceBorderLoops(world: World): ProvinceBorderLoop[] {
  const latticeWidth = world.width + 1;
  const edges: Edge[] = [];

  for (let y = 0; y < world.height; y += 1) {
    const row = world.tiles[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < world.width; x += 1) {
      const id = row[x]?.provinceId ?? -1;

      const east = row[x + 1]?.provinceId;
      if (east !== undefined && east !== id) {
        edges.push({
          from: y * latticeWidth + (x + 1),
          to: (y + 1) * latticeWidth + (x + 1),
        });
      }

      const south = world.tiles[y + 1]?.[x]?.provinceId;
      if (south !== undefined && south !== id) {
        edges.push({
          from: (y + 1) * latticeWidth + x,
          to: (y + 1) * latticeWidth + (x + 1),
        });
      }
    }
  }

  if (edges.length === 0) {
    return [];
  }

  const adjacency = new Map<number, number[]>();
  const used = new Uint8Array(edges.length);

  edges.forEach((edge, edgeIndex) => {
    const fromList = adjacency.get(edge.from);
    if (fromList === undefined) {
      adjacency.set(edge.from, [edgeIndex]);
    } else {
      fromList.push(edgeIndex);
    }
    const toList = adjacency.get(edge.to);
    if (toList === undefined) {
      adjacency.set(edge.to, [edgeIndex]);
    } else {
      toList.push(edgeIndex);
    }
  });

  const pointOf = (key: number): BorderPoint => ({
    x: key % latticeWidth,
    y: Math.floor(key / latticeWidth),
  });

  const loops: ProvinceBorderLoop[] = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex] === 1) {
      continue;
    }
    const startEdge = edges[startIndex];
    if (startEdge === undefined) {
      continue;
    }

    used[startIndex] = 1;
    const loopKeys: number[] = [startEdge.from, startEdge.to];
    let currentNode = startEdge.to;
    let closed = false;

    for (let step = 0; step < edges.length; step += 1) {
      const candidates = adjacency.get(currentNode) ?? [];
      let nextEdgeIndex = -1;
      let nextNode = -1;

      for (const candidateIndex of candidates) {
        if (used[candidateIndex] === 1) {
          continue;
        }
        const candidate = edges[candidateIndex];
        if (candidate === undefined) {
          continue;
        }
        nextEdgeIndex = candidateIndex;
        nextNode = candidate.from === currentNode ? candidate.to : candidate.from;
        break;
      }

      if (nextEdgeIndex < 0 || nextNode < 0) {
        break;
      }

      used[nextEdgeIndex] = 1;
      currentNode = nextNode;

      if (currentNode === loopKeys[0]) {
        closed = true;
        break;
      }
      loopKeys.push(currentNode);
    }

    if (loopKeys.length < 2) {
      continue;
    }

    const rawPoints = loopKeys.map((key) => pointOf(key));
    loops.push({ points: chaikin(rawPoints, closed), closed });
  }

  return loops;
}
