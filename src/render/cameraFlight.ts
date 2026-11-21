import type { Camera } from './camera';

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Camera between a and b at progress t (0..1): ease-in-out, zoom geometric; no overshoot. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  const e = ease(Math.min(1, Math.max(0, t)));
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, zoom: a.zoom * (b.zoom / a.zoom) ** e };
}

/** One camera flight; MapView steps it per frame and cancels it on user input. */
export class CameraFlight {
  private from: Camera | null = null;
  private to: Camera | null = null;
  private elapsed = 0;
  private ms = 1;

  start(from: Camera, to: Camera, ms: number): void {
    this.from = from;
    this.to = to;
    this.elapsed = 0;
    this.ms = Math.max(ms, 1);
  }

  cancel(): void {
    this.from = null;
    this.to = null;
  }

  /** Next camera, or null when idle. The last step returns exactly the target. */
  step(dtMs: number): Camera | null {
    if (!this.from || !this.to) return null;
    this.elapsed += Math.max(0, dtMs);
    const t = this.elapsed / this.ms;
    const cam = t >= 1 ? { ...this.to } : lerpCamera(this.from, this.to, t);
    if (t >= 1) this.cancel();
    return cam;
  }
}
