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
/** Экранная толщина не тоньше 0.6 px; сверху не ограничена (на большом зуме река в клетках мира). */
const MIN_PX = 0.6;
/** Шаг пересборки геометрии: четверть октавы зума (толщина отличается не более чем на ~9%). */
const BUCKETS_PER_OCTAVE = 4;
/** Подложка (тёмная кромка) шире воды на 40%. */
const BANK_SCALE = 1.4;
/** Подложка рисуется, только если вода не тоньше 1 px (иначе кромка меньше 0.2 px с каждой стороны). */
const BANK_MIN_PX = 1;

/**
 * Толщина реки в клетках мира. `width` — класс ширины из симуляции (1..4), `t` — доля пути от
 * истока (0..1). От 0.35·w у истока до w у устья, w = 0.3 + 0.22·width.
 */
export function riverWidthCells(width: number, t: number): number {
  const w = 0.3 + 0.22 * width;
  return w * (0.35 + 0.65 * Math.min(1, Math.max(0, t)));
}

/** Толщина в экранных пикселях для толщины в клетках при зуме (пикселей на клетку). */
export function riverPixelWidth(cells: number, zoom: number): number {
  return Math.max(MIN_PX, cells * zoom);
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

/**
 * Уровни толщины: геометрическая шкала с шагом 15%. Участок реки — отрезок, где уровень один,
 * поэтому соседние участки отличаются по толщине не больше чем на 15%, а одинаковые уровни всех
 * рек рисуются одной обводкой.
 */
const LEVEL_RATIO = 1.15;
const levelOf = (cells: number): number => Math.round(Math.log(cells) / Math.log(LEVEL_RATIO));
const levelCells = (level: number): number => LEVEL_RATIO ** level;

/** Устье: последний отрезок продлевается в сторону воды на 1.5 клетки (и дальше, пока не вода). */
const MOUTH_EXTEND = 1.5;
const MOUTH_MAX = 4;
const MOUTH_STEP = 0.25;
/** Конец устья — не ближе этого (клетки) к береговой линии, проверка по 8 точкам вокруг. */
const MOUTH_CLEARANCE = 0.5;
/** Доля поворота к воде на каждом шаге продления (по спуску береговой высоты). */
const MOUTH_TURN = 0.5;
/** Вода реки за береговой линией тает к морю: ступени прозрачности и длина каждой (клетки). */
const FADE_ALPHA = [1, 0.7, 0.45, 0.2] as const;
const FADE_STEP = 0.5;

/** Береговая высота в точке мира (клетки): > 0 — суша на экране, < 0 — вода. */
export type CoastSampler = (x: number, y: number) => number;

/** Кусок обводки: подложка или вода одного уровня толщины (и ступени таяния у устья). */
export interface RiverPiece {
  river: number;
  kind: 'bank' | 'water';
  level: number;
  /** Индекс в FADE_ALPHA: 0 — обычная вода, больше — тающая за береговой линией. */
  fade: number;
  /**
   * Концы встык, без круглых шапок: у кусков на береговой линии и за ней. Круглая шапка там
   * легла бы на воду тёмным полукругом кромки, а при прозрачности дала бы пятна на стыках.
   */
  butt: boolean;
  points: Point[];
}

/** Реки, которые кончаются в воде (а не впадают в другую реку): их последняя точка не лежит на другой реке. */
function mouthFlags(rivers: RiverPath[]): boolean[] {
  const inner = new Set<string>();
  for (const r of rivers) for (let i = 0; i < r.points.length - 1; i++) inner.add(pointKey(r.points[i] as Point));
  return rivers.map((r) => {
    const last = r.points[r.points.length - 1];
    return last !== undefined && !inner.has(pointKey(last));
  });
}

/** Точка и всё вокруг неё в радиусе MOUTH_CLEARANCE — вода на экране. */
function deepInWater(coast: CoastSampler, p: Point): boolean {
  if (coast(p.x, p.y) >= 0) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (coast(p.x + Math.cos(a) * MOUTH_CLEARANCE, p.y + Math.sin(a) * MOUTH_CLEARANCE) >= 0) return false;
  }
  return true;
}

/**
 * Точки продления устья за последнюю точку `end`, начиная по направлению `dir` (единичный вектор).
 * Без поля берега — прямой отрезок 1.5 клетки. С полем путь на каждом шаге поворачивает к воде
 * (вниз по береговой высоте) и идёт не меньше 1.5 клетки и дальше, пока конец не окажется в воде
 * не ближе 0.5 клетки к берегу (но не дальше 4 клеток).
 */
function mouthExtension(end: Point, dir: Point, coast: CoastSampler | undefined): Point[] {
  const out: Point[] = [];
  let p = end;
  let d = dir;
  for (let len = MOUTH_STEP; len <= MOUTH_MAX + 1e-9; len += MOUTH_STEP) {
    if (coast) {
      const e = 0.5;
      const gx = coast(p.x - e, p.y) - coast(p.x + e, p.y);
      const gy = coast(p.x, p.y - e) - coast(p.x, p.y + e);
      const g = Math.hypot(gx, gy);
      if (g > 1e-9) {
        const nx = d.x * (1 - MOUTH_TURN) + (gx / g) * MOUTH_TURN;
        const ny = d.y * (1 - MOUTH_TURN) + (gy / g) * MOUTH_TURN;
        const nl = Math.hypot(nx, ny);
        if (nl > 1e-9) d = { x: nx / nl, y: ny / nl };
      }
    }
    p = { x: p.x + d.x * MOUTH_STEP, y: p.y + d.y * MOUTH_STEP };
    out.push(p);
    if (len >= MOUTH_EXTEND - 1e-9 && (!coast || deepInWater(coast, p))) break;
  }
  return out;
}

/**
 * Геометрия одной реки: сглаженный путь режется на участки одного уровня толщины (толщина растёт
 * от истока к устью); у реки, впадающей в воду, путь продлевается в воду, подложка обрывается на
 * береговой линии, а вода за ней тает ступенями прозрачности.
 */
function riverPieces(
  river: RiverPath,
  index: number,
  pinned: Set<string>,
  mouth: boolean,
  coast: CoastSampler | undefined,
): RiverPiece[] {
  const n = river.points.length;
  if (n < 2) return [];
  const smooth = chaikin(meander(river.points, index, pinned), SMOOTH_ITERATIONS);
  const m = smooth.length;
  const arc = new Float64Array(m);
  for (let k = 1; k < m; k++) {
    const a = smooth[k - 1] as Point;
    const b = smooth[k] as Point;
    arc[k] = (arc[k - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = (arc[m - 1] as number) || 1;
  const levels: number[] = [];
  for (let k = 0; k < m; k++) {
    const src = Math.round((k / (m - 1)) * (n - 1));
    const width = river.width[src] ?? river.width[n - 1] ?? 1;
    levels.push(levelOf(riverWidthCells(width, (arc[k] as number) / total)));
  }
  const path = smooth.slice();
  // Индекс первой точки, после которой путь за береговой линией (m — подложка до конца пути).
  let shore = m - 1;
  if (mouth) {
    const end = smooth[m - 1] as Point;
    const prev = smooth[m - 2] as Point;
    const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
    const ext = mouthExtension(end, { x: (end.x - prev.x) / len, y: (end.y - prev.y) / len }, coast);
    const last = levels[m - 1] as number;
    for (const p of ext) {
      path.push(p);
      levels.push(last);
    }
    if (coast) {
      shore = path.length - 1;
      while (shore > 0 && coast((path[shore] as Point).x, (path[shore] as Point).y) < 0) shore--;
    }
  }
  const pieces: RiverPiece[] = [];
  const outlet = shore < path.length - 1;
  const emit = (kind: RiverPiece['kind'], level: number, fade: number, from: number, to: number): void => {
    const butt = fade > 0 || (outlet && to === shore);
    if (to > from) pieces.push({ river: index, kind, level, fade, butt, points: path.slice(from, to + 1) });
  };
  // Подложка и непрозрачная вода: участки одного уровня до береговой линии.
  let start = 0;
  for (let k = 1; k <= shore; k++) {
    if (levels[k] !== levels[start] || k === shore) {
      // Граничная точка входит в оба участка, чтобы линия не рвалась.
      emit('bank', levels[start] as number, 0, start, k);
      emit('water', levels[start] as number, 0, start, k);
      start = k;
    }
  }
  // За береговой линией: вода тает ступенями по длине пути от береговой точки.
  if (outlet) {
    const level = levels[path.length - 1] as number;
    const base = path[shore] as Point;
    let from = shore;
    let fade = 1;
    for (let k = shore + 1; k < path.length; k++) {
      const p = path[k] as Point;
      const step = Math.min(FADE_ALPHA.length - 1, 1 + Math.floor(Math.hypot(p.x - base.x, p.y - base.y) / FADE_STEP));
      if (step !== fade || k === path.length - 1) {
        emit('water', level, fade, from, k);
        from = k;
        fade = step;
      }
    }
  }
  return pieces;
}

/** Геометрия всех рек (в клетках мира); `coast` — поле береговой линии для устьев. */
export function buildRiverPieces(rivers: RiverPath[], coast?: CoastSampler): RiverPiece[] {
  const pinned = pinnedPoints(rivers);
  const mouths = mouthFlags(rivers);
  return rivers.flatMap((river, index) => riverPieces(river, index, pinned, mouths[index] === true, coast));
}

/** Слой рек: Graphics в координатах мира, контейнер выравнивает MapView. */
export class RiverLayer {
  readonly container = new Container();
  private graphics: Graphics | null = null;
  /** Куски, сгруппированные по (вид, уровень, ступень таяния, концы): одна обводка на группу. */
  private groups = new Map<string, { piece: RiverPiece; paths: Point[][] }>();
  private bucket = Number.NaN;

  setRivers(rivers: RiverPath[], coast?: CoastSampler): void {
    this.groups.clear();
    for (const piece of buildRiverPieces(rivers, coast)) {
      const key = `${piece.kind}:${piece.level}:${piece.fade}:${piece.butt ? 1 : 0}`;
      const group = this.groups.get(key);
      if (group) group.paths.push(piece.points);
      else this.groups.set(key, { piece, paths: [piece.points] });
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
    const water = hexColor(MAP_COLORS.river);
    const bank = hexColor(MAP_COLORS.riverBank);
    // Сначала вся подложка, поверх вся вода: кромка притока не режет воду главной реки.
    for (const kind of ['bank', 'water'] as const) {
      for (const { piece, paths } of this.groups.values()) {
        if (piece.kind !== kind) continue;
        const waterPx = riverPixelWidth(levelCells(piece.level), zoom);
        // Кромка уже 0.2 px с каждой стороны не видна: такую подложку не строим (вдвое меньше геометрии).
        if (kind === 'bank' && waterPx < BANK_MIN_PX) continue;
        for (const pts of paths) {
          const first = pts[0] as Point;
          g.moveTo(first.x, first.y);
          for (let i = 1; i < pts.length; i++) {
            const p = pts[i] as Point;
            g.lineTo(p.x, p.y);
          }
        }
        const px = waterPx * (kind === 'bank' ? BANK_SCALE : 1);
        g.stroke({
          width: px / zoom,
          color: kind === 'bank' ? bank : water,
          alpha: FADE_ALPHA[piece.fade] ?? 1,
          cap: piece.butt ? 'butt' : 'round',
          join: 'round',
        });
      }
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
