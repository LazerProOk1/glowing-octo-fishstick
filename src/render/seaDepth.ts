// Глубина моря для шейдера карты: тон воды и изобаты. Формула тона здесь и в GLSL (mapShader.ts)
// одна и та же; TS-копия нужна для тестов. Глубина для цвета — гладкая (smoothSeaDepth), а не
// сырая высота: шум рельефа дна иначе виден в открытом море пятнами, как облака.
import { SEA_LEVEL } from '../content/terrainLevels';
import { blur } from '../sim/geom/blur';
import { borderDistance } from '../sim/geom/edt';

/**
 * Размытие глубины, клеток. Суша входит в размытие с глубиной 0, поэтому у любого берега
 * получается светлая отмель шириной ~σ, повторяющая береговую линию; шум дна сглаживается.
 */
export const SHELF_SIGMA = 8;
/**
 * Расстояние от суши (клетки), с которого глубина плавно уходит к наибольшей и где она
 * становится ровной: открытый океан спокойный и однотонный, без пятен вдали от берега.
 */
export const OPEN_SEA_DIST = [16, 48] as const;

/**
 * Наибольшая глубина: высоты мира лежат в 0..1, поэтому дно не глубже SEA_LEVEL ниже уровня моря.
 * Замер на medium (сиды 1, 2, 3): минимум высоты воды 0.0, медиана глубины 0.12–0.16,
 * около 10% моря лежит на самом дне (глубина ≥ 0.44).
 */
export const SEA_DEPTH_MAX = SEA_LEVEL;

/**
 * Изобаты: глубины ниже уровня моря, на которых рисуются бледные линии.
 * 0.06 — край шельфа (около четверти моря мельче), 0.18 — склон к открытому океану
 * (около 60% моря мельче).
 */
export const ISOBATH_DEPTHS = [0.06, 0.18] as const;
/** Непрозрачность изобат. */
export const ISOBATH_ALPHA = 0.1;
/**
 * Изобаты проявляются при зуме в 1.5 раза крупнее общего вида (вся карта на экране) и видны
 * полностью с 3 раз. Отсчёт от общего вида, а не от числа пикселей на клетку: зум общего вида
 * зависит от размера окна (0.3 на узком, ~0.9 на 1920 px).
 */
export const ISOBATH_FADE_RATIO = [1.5, 3] as const;

/**
 * Тон воды по глубине: 0 — мелководье, 1 — глубина. Кривая t·(1 + K)/(t + K), t = глубина / SEA_DEPTH_MAX,
 * K = 0.5: половина перехода приходится на первые 25% глубины, наклон у берега конечный (3),
 * без излома.
 */
export const DEPTH_TONE_K = 0.5;

export function depthTone(depth: number): number {
  const t = Math.min(Math.max(depth / SEA_DEPTH_MAX, 0), 1);
  return (t * (1 + DEPTH_TONE_K)) / (t + DEPTH_TONE_K);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Гладкая глубина для цвета моря и изобат, 0..SEA_DEPTH_MAX на клетку: размытая (SHELF_SIGMA)
 * глубина воды (суша — 0), а дальше OPEN_SEA_DIST от суши — плавно к наибольшей.
 * На суше значение тоже есть (малое у берега): нужно для билинейного перехода на береговой линии.
 */
export function smoothSeaDepth(height: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const raw = new Float32Array(n);
  const land = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = SEA_LEVEL - (height[i] as number);
    raw[i] = v > 0 ? Math.min(v, SEA_DEPTH_MAX) : 0;
    land[i] = v > 0 ? 0 : 1;
  }
  const out = blur(raw, w, h, SHELF_SIGMA);
  const dist = borderDistance(land, w, h);
  const [d0, d1] = OPEN_SEA_DIST;
  for (let i = 0; i < n; i++) {
    if (land[i] === 1) continue;
    const k = smoothstep(d0, d1, dist[i] as number);
    out[i] = (out[i] as number) * (1 - k) + SEA_DEPTH_MAX * k;
  }
  return out;
}
