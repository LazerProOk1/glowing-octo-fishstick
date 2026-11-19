// Глубина моря для шейдера карты: тон воды. Формула тона здесь и в GLSL (mapShader.ts) одна и та
// же; TS-копия нужна для тестов. Глубина берётся с настоящего дна (высота − SEA_LEVEL на воде),
// сглаженного только в крупном масштабе: видны котловины, хребты и шельфы материков, а мелкий шум
// рельефа дна (он давал «облака») — нет. Суша в сглаживании не участвует вовсе, поэтому вокруг
// островов нет ореолов: у берега только узкая полоса из шейдера.
import { SEA_LEVEL } from '../content/terrainLevels';
import { blur } from '../sim/geom/blur';

/**
 * Наибольшая глубина: высоты мира лежат в 0..1, поэтому дно не глубже SEA_LEVEL ниже уровня моря.
 * Замер на medium (сиды 1, 2, 3): минимум высоты воды 0.0, медиана глубины 0.12–0.16,
 * около 10% моря лежит на самом дне (глубина ≥ 0.44).
 */
export const SEA_DEPTH_MAX = SEA_LEVEL;

/** Шаг сетки глубины, клеток: текстура в SEA_DEPTH_STEP² раз меньше карты, GPU интерполирует. */
export const SEA_DEPTH_STEP = 4;
/**
 * Масштаб сглаживания дна, клеток (σ гаусса). Шум дна мельче ~30 клеток пропадает, котловины и
 * шельфы в сотни клеток остаются.
 */
export const SEA_DEPTH_SIGMA = 16;

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

/** Размер сетки глубины для карты w×h клеток. */
export function seaDepthSize(w: number, h: number): { w: number; h: number } {
  return { w: Math.ceil(w / SEA_DEPTH_STEP), h: Math.ceil(h / SEA_DEPTH_STEP) };
}

/**
 * Крупномасштабная глубина настоящего дна на сетке seaDepthSize (узел (bx, by) — центр блока
 * SEA_DEPTH_STEP² клеток). Средняя глубина воды по блокам, затем нормированное размытие
 * σ = SEA_DEPTH_SIGMA: размываются отдельно сумма глубин воды и доля воды, ответ — их отношение.
 * Так суша не тянет глубину ни к нулю, ни куда-либо ещё: в узле — средняя глубина окружающей воды.
 * Где воды поблизости нет совсем (глубь материка), значение 0; на экран оно не попадает.
 */
export function smoothSeaDepth(height: Float32Array, w: number, h: number): Float32Array {
  const s = SEA_DEPTH_STEP;
  const size = seaDepthSize(w, h);
  const sigma = SEA_DEPTH_SIGMA / s;
  // Поля с нулевой каймой в 3σ: размытие clamp иначе повторяет крайний блок и даёт ему у края
  // карты половину веса (полосы шума вдоль края). Ноль в обоих полях из отношения выпадает.
  const pad = Math.ceil(3 * sigma);
  const pw = size.w + 2 * pad;
  const ph = size.h + 2 * pad;
  const sum = new Float32Array(pw * ph);
  const wet = new Float32Array(pw * ph);
  for (let y = 0; y < h; y++) {
    const row = (((y / s) | 0) + pad) * pw + pad;
    for (let x = 0; x < w; x++) {
      const v = SEA_LEVEL - (height[y * w + x] as number);
      if (v <= 0) continue;
      const b = row + ((x / s) | 0);
      sum[b] = (sum[b] as number) + Math.min(v, SEA_DEPTH_MAX);
      wet[b] = (wet[b] as number) + 1;
    }
  }
  const bs = blur(sum, pw, ph, sigma);
  const bw = blur(wet, pw, ph, sigma);
  const out = new Float32Array(size.w * size.h);
  for (let y = 0; y < size.h; y++) {
    for (let x = 0; x < size.w; x++) {
      const i = (y + pad) * pw + x + pad;
      const wgt = bw[i] as number;
      out[y * size.w + x] = wgt > 1e-4 ? Math.min((bs[i] as number) / wgt, SEA_DEPTH_MAX) : 0;
    }
  }
  return out;
}
