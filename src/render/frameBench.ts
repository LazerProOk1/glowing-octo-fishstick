export interface FrameStats {
  avg: number;
  p95: number;
  fps: number;
}

/** Итоги по времени кадров (мс): среднее, 95-й процентиль, кадров в секунду по среднему. */
export function frameStats(samplesMs: readonly number[]): FrameStats {
  const n = samplesMs.length;
  if (n === 0) return { avg: 0, p95: 0, fps: 0 };
  let sum = 0;
  for (const v of samplesMs) sum += v;
  const avg = sum / n;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] ?? 0;
  return { avg, p95, fps: avg > 0 ? 1000 / avg : 0 };
}
