import { RendererType, type Application, type WebGLRenderer } from 'pixi.js';
import { frameStats, type FrameStats } from './frameBench';

/** Warm-up frames before the measurement, not counted in the results. */
const BENCH_WARMUP_FRAMES = 2;

/**
 * Honest frame benchmark: draws `frames` frames synchronously and waits for the GPU to finish
 * after each. gl.finish() does not work for this: Chrome (ANGLE) treats it as an ordinary flush and
 * returns immediately, so only the command submission time would be measured. Reading one pixel
 * (readPixels) forces a wait for the drawing result. renderer.render runs the whole shader again
 * each time. Independent of requestAnimationFrame, and correct in a hidden tab too.
 * The first two frames are not measured (warm-up: shader compilation, texture upload).
 * No WebGL, or a mean below 0.05 ms (the sync did not work) — null, "unavailable".
 */
export function benchmarkFrames(app: Application, frames: number): FrameStats | null {
  const { renderer, stage } = app;
  if (renderer.type !== RendererType.WEBGL) return null;
  const gl = (renderer as WebGLRenderer).gl;
  const px = new Uint8Array(4);
  const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < BENCH_WARMUP_FRAMES; i++) {
    renderer.render(stage);
    sync();
  }
  const samples: number[] = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    renderer.render(stage);
    sync();
    samples.push(performance.now() - t0);
  }
  const stats = frameStats(samples);
  return stats.avg < 0.05 ? null : stats;
}
