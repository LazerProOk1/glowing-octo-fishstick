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

/** Участок реки одной ширины (сглаженные точки в клетках мира). */
interface Run {
  points: Point[];
  width: number;
}

/** Сглаживает реку целиком и режет её на участки одной ширины (ширина монотонна вдоль реки). */
function riverRuns(river: RiverPath): Run[] {
  const n = river.points.length;
  if (n < 2) return [];
  const smooth = chaikin(river.points, SMOOTH_ITERATIONS);
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
    for (const river of rivers) {
      for (const run of riverRuns(river)) {
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
