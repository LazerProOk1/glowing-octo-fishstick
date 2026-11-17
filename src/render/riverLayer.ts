import { Container, Graphics } from 'pixi.js';
import type { RiverPath } from '../sim/world/types';
import { MAP_COLORS, hexColor } from './palette';

type Point = { x: number; y: number };

/**
 * Сглаживание Чайкина для открытой ломаной: каждый отрезок заменяется точками на 1/4 и 3/4,
 * концы сохраняются (n точек → 2(n−1)). Результат лежит в выпуклой оболочке исходных точек.
 */
export function chaikin(points: Point[], iterations: number): Point[] {
  let cur = points.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iterations && cur.length >= 3; it++) {
    const n = cur.length;
    const out: Point[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = cur[i] as Point;
      const b = cur[i + 1] as Point;
      out.push(i === 0 ? { x: a.x, y: a.y } : { x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      out.push(i === n - 2 ? { x: b.x, y: b.y } : { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    cur = out;
  }
  return cur;
}

const SMOOTH_ITERATIONS = 3;
/** Толщина в экранных пикселях: растёт с зумом, но остаётся в 0.6..3 px. */
const MIN_PX = 0.6;
const MAX_PX = 3;
/** Шаг пересборки геометрии: четверть октавы зума (толщина отличается не более чем на ~9%). */
const BUCKETS_PER_OCTAVE = 4;

export function riverPixelWidth(width: number, zoom: number): number {
  return Math.min(MAX_PX, Math.max(MIN_PX, 0.4 * width * Math.sqrt(zoom)));
}

/** Длина волны извилин (клетки), их амплитуда и длина затухания у закреплённых точек. */
const MEANDER_WAVELENGTH = 7;
const MEANDER_AMPLITUDE = 0.34;
const MEANDER_TAPER = 3;

const pointKey = (p: Point): string => `${p.x},${p.y}`;

/** Точки, которые нельзя сдвигать: истоки, устья и концы притоков (точки слияния). */
export function pinnedPoints(rivers: RiverPath[]): Set<string> {
  const set = new Set<string>();
  for (const r of rivers) {
    const first = r.points[0];
    const last = r.points[r.points.length - 1];
    if (first) set.add(pointKey(first));
    if (last) set.add(pointKey(last));
  }
  return set;
}

/** Детерминированный хеш (целое, сид) → [−1, 1]. */
function hashSigned(i: number, seed: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(seed + 0x9e3779b9, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Гладкий 1D value noise по длине дуги, [−1, 1]. */
function noise1(s: number, seed: number): number {
  const i = Math.floor(s);
  const f = s - i;
  const u = f * f * (3 - 2 * f);
  const a = hashSigned(i, seed);
  return a + (hashSigned(i + 1, seed) - a) * u;
}

/**
 * Извилистость для D8-путей: каждая вершина (шаг 1–√2 клетки) сдвигается перпендикулярно пути
 * на низкочастотный шум (λ ≈ 7 клеток, ≤ 0.34 клетки), затухающий к закреплённым точкам.
 * Детерминирован по `seed` (номер реки).
 */
export function meander(points: Point[], seed: number, pinned: Set<string>): Point[] {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    arc[i] = (arc[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y);
  }
  // Расстояние по дуге до ближайшей закреплённой вершины (два прохода).
  const dPin = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1 || pinned.has(pointKey(points[i] as Point))) dPin[i] = 0;
  }
  for (let i = 1; i < n; i++) {
    dPin[i] = Math.min(dPin[i] as number, (dPin[i - 1] as number) + (arc[i] as number) - (arc[i - 1] as number));
  }
  for (let i = n - 2; i >= 0; i--) {
    dPin[i] = Math.min(dPin[i] as number, (dPin[i + 1] as number) + (arc[i + 1] as number) - (arc[i] as number));
  }
  return points.map((p, i) => {
    const d = dPin[i] as number;
    if (d === 0) return { x: p.x, y: p.y };
    const prev = points[i - 1] as Point;
    const next = points[i + 1] as Point;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const t = Math.min(1, d / MEANDER_TAPER);
    const envelope = t * t * (3 - 2 * t);
    const s = (arc[i] as number) / MEANDER_WAVELENGTH;
    const v = (noise1(s, seed) * 0.75 + noise1(s * 2.1 + 17, seed + 7) * 0.25) * MEANDER_AMPLITUDE * envelope;
    return { x: p.x - (ty / len) * v, y: p.y + (tx / len) * v };
  });
}

/** Участок реки одной ширины (сглаженные точки в клетках мира). */
interface Run {
  points: Point[];
  width: number;
}

/** Сглаживает реку целиком и режет её на участки одной ширины (ширина монотонна вдоль реки). */
function riverRuns(river: RiverPath, seed: number, pinned: Set<string>): Run[] {
  const n = river.points.length;
  if (n < 2) return [];
  const smooth = chaikin(meander(river.points, seed, pinned), SMOOTH_ITERATIONS);
  const m = smooth.length;
  const widthAt = (k: number): number => {
    const src = Math.round((k / (m - 1)) * (n - 1));
    return river.width[src] ?? river.width[river.width.length - 1] ?? 1;
  };
  const runs: Run[] = [];
  let start = 0;
  let w = widthAt(0);
  for (let k = 1; k < m; k++) {
    const wk = widthAt(k);
    if (wk !== w || k === m - 1) {
      // Граничная точка входит в оба участка, чтобы линия не рвалась.
      runs.push({ points: smooth.slice(start, k + 1), width: w });
      start = k;
      w = wk;
    }
  }
  return runs.filter((r) => r.points.length >= 2);
}

/** Слой рек: Graphics в координатах мира, контейнер выравнивает MapView. */
export class RiverLayer {
  readonly container = new Container();
  private graphics: Graphics | null = null;
  /** Участки, сгруппированные по ширине: одна обводка на группу. */
  private groups = new Map<number, Point[][]>();
  private bucket = Number.NaN;

  setRivers(rivers: RiverPath[]): void {
    this.groups.clear();
    const pinned = pinnedPoints(rivers);
    for (const [index, river] of rivers.entries()) {
      for (const run of riverRuns(river, index, pinned)) {
        const list = this.groups.get(run.width);
        if (list) list.push(run.points);
        else this.groups.set(run.width, [run.points]);
      }
    }
    this.clearGraphics();
    this.bucket = Number.NaN;
  }

  /** Пересобирает геометрию, только если зум ушёл в другую корзину. */
  update(zoom: number): void {
    const bucket = Math.round(Math.log2(zoom) * BUCKETS_PER_OCTAVE);
    if (bucket === this.bucket) return;
    this.bucket = bucket;
    this.rebuild(2 ** (bucket / BUCKETS_PER_OCTAVE));
  }

  private rebuild(zoom: number): void {
    this.clearGraphics();
    if (this.groups.size === 0) return;
    const g = new Graphics();
    const color = hexColor(MAP_COLORS.river);
    for (const [width, runs] of this.groups) {
      for (const pts of runs) {
        const first = pts[0] as Point;
        g.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i] as Point;
          g.lineTo(p.x, p.y);
        }
      }
      g.stroke({
        width: riverPixelWidth(width, zoom) / zoom,
        color,
        alpha: 0.9,
        cap: 'round',
        join: 'round',
      });
    }
    this.graphics = g;
    this.container.addChild(g);
  }

  private clearGraphics(): void {
    if (!this.graphics) return;
    this.graphics.destroy({ context: true });
    this.graphics = null;
  }

  destroy(): void {
    this.clearGraphics();
    this.groups.clear();
    this.container.destroy({ children: true });
  }
}
