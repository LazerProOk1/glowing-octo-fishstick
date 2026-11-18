// Мягкая принадлежность провинциям — CPU-зеркало шейдера карты (mapShader.ts, softSide).
// Без pixi.js: чистые функции над запечёнными массивами, их же проверяют тесты.
import { fromHalf } from './halfFloat';

/** Запечённые карты, по которым выбирается провинция (раскладки — см. WorldBake). */
export interface ProvinceMaps {
  w: number;
  h: number;
  /** RGBA8 provinceRG: id там, где на экране суша. */
  land: Uint8Array;
  /** RGBA8 provinceSeaRG: id там, где на экране вода. */
  sea: Uint8Array;
  /** RGBA16F surface: канал B — слегка размытая высота − SEA_LEVEL (береговая линия). */
  surface: Uint16Array;
}

export interface SoftProvince {
  /** Сторона берега в точке: суша, если размытая высота больше нуля. */
  landSide: boolean;
  /** Провинция с наибольшей долей в окрестности (−1 — ни одной клетки своей стороны рядом). */
  best: number;
  /** Вторая по доле провинция (−1 — нет). */
  second: number;
  /** Расстояние до границы best и second в клетках (≥ 0; Infinity, если second нет). */
  edge: number;
}

/** Веса кубического B-сплайна для 4 клеток (смещения −1, 0, 1, 2) при дробной части t. */
export function bspline(t: number): [number, number, number, number] {
  const s = 1 - t;
  const t2 = t * t;
  const t3 = t2 * t;
  return [(s * s * s) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

/** Производные весов bspline по t. */
export function bsplineD(t: number): [number, number, number, number] {
  const s = 1 - t;
  return [-0.5 * s * s, 1.5 * t * t - 2 * t, -1.5 * t * t + t + 0.5, 0.5 * t * t];
}

function clampI(v: number, n: number): number {
  return v < 0 ? 0 : v >= n ? n - 1 : v;
}

/** Билинейная береговая высота в точке (x, y) в клетках, как texture() с clamp-to-edge в шейдере. */
export function coastAt(maps: ProvinceMaps, x: number, y: number): number {
  const { w, h, surface } = maps;
  const cx = Math.floor(x - 0.5);
  const cy = Math.floor(y - 0.5);
  const tx = x - 0.5 - cx;
  const ty = y - 0.5 - cy;
  const at = (ix: number, iy: number): number => fromHalf(surface[(clampI(iy, h) * w + clampI(ix, w)) * 4 + 2] as number);
  const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
  const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Доли провинций в окрестности 4×4 клеток точки (x, y) с весами кубического B-сплайна, только по
 * клеткам своей стороны берега (по карте этой стороны). Кандидаты — провинции 4 ближайших клеток.
 * Граница двух провинций — линия равных долей: она гладкая, а не лесенка по клеткам.
 */
export function softProvince(maps: ProvinceMaps, x: number, y: number): SoftProvince {
  const landSide = coastAt(maps, x, y) > 0;
  const map = landSide ? maps.land : maps.sea;
  const { w, h } = maps;
  const cx = Math.floor(x - 0.5);
  const cy = Math.floor(y - 0.5);
  const wx = bspline(x - 0.5 - cx);
  const wy = bspline(y - 0.5 - cy);
  const dx = bsplineD(x - 0.5 - cx);
  const dy = bsplineD(y - 0.5 - cy);
  const ids: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const o = (clampI(cy + j - 1, h) * w + clampI(cx + i - 1, w)) * 4;
      const land = (map[o + 2] as number) > 127;
      ids.push(land === landSide ? (map[o] as number) | ((map[o + 1] as number) << 8) : -1);
    }
  }
  const cand = [ids[5] as number, ids[6] as number, ids[9] as number, ids[10] as number];
  let sum = 0;
  let sumX = 0;
  let sumY = 0;
  const a = [0, 0, 0, 0];
  const ax = [0, 0, 0, 0];
  const ay = [0, 0, 0, 0];
  for (let k = 0; k < 16; k++) {
    const id = ids[k] as number;
    if (id < 0) continue;
    const i = k & 3;
    const j = k >> 2;
    const wgt = (wx[i] as number) * (wy[j] as number);
    const gx = (dx[i] as number) * (wy[j] as number);
    const gy = (wx[i] as number) * (dy[j] as number);
    sum += wgt;
    sumX += gx;
    sumY += gy;
    for (let c = 0; c < 4; c++) {
      if (cand[c] !== id) continue;
      a[c] = (a[c] as number) + wgt;
      ax[c] = (ax[c] as number) + gx;
      ay[c] = (ay[c] as number) + gy;
    }
  }
  if (sum < 1e-4) return { landSide, best: -1, second: -1, edge: Infinity };
  // Доля m = a / sum и её градиент (правило частного).
  const m = a.map((v, c) => ((cand[c] as number) < 0 ? -1 : v / sum));
  const mx = a.map((v, c) => ((ax[c] as number) * sum - v * sumX) / (sum * sum));
  const my = a.map((v, c) => ((ay[c] as number) * sum - v * sumY) / (sum * sum));
  let b = -1;
  for (let c = 0; c < 4; c++) if ((cand[c] as number) >= 0 && (b < 0 || (m[c] as number) > (m[b] as number))) b = c;
  if (b < 0) return { landSide, best: -1, second: -1, edge: Infinity };
  const best = cand[b] as number;
  let s = -1;
  for (let c = 0; c < 4; c++) {
    const id = cand[c] as number;
    if (id >= 0 && id !== best && (s < 0 || (m[c] as number) > (m[s] as number))) s = c;
  }
  if (s < 0) return { landSide, best, second: -1, edge: Infinity };
  const diff = (m[b] as number) - (m[s] as number);
  const g = Math.hypot((mx[b] as number) - (mx[s] as number), (my[b] as number) - (my[s] as number));
  return { landSide, best, second: cand[s] as number, edge: diff / Math.max(g, 1e-3) };
}

/** Провинция под точкой (x, y) в клетках — та же, что подсвечивает шейдер; null — вне карты. */
export function pickProvince(maps: ProvinceMaps, x: number, y: number): number | null {
  if (!(x >= 0 && y >= 0 && x < maps.w && y < maps.h)) return null;
  const r = softProvince(maps, x, y);
  return r.best >= 0 ? r.best : null;
}
