/** Duration of the fog reveal, ms. */
export const FOG_FADE_MS = 1500;

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Render-only smooth fog: current level (0..255) per province eases toward the target visibility.
 * Nothing here is game state; `step` reports only the provinces that actually changed.
 */
export class FogFade {
  private readonly from: Uint8Array;
  private readonly to: Uint8Array;
  private readonly cur: Uint8Array;
  private active: number[] = [];
  private t = 1;

  constructor(
    readonly count: number,
    private readonly durationMs = FOG_FADE_MS,
  ) {
    this.from = new Uint8Array(count);
    this.to = new Uint8Array(count);
    this.cur = new Uint8Array(count);
  }

  /** Eases from the current levels to vis (0 → 0, otherwise 255); restarts the timer. */
  setTarget(vis: Uint8Array): void {
    if (vis.length !== this.count) throw new Error(`visibility length ${vis.length} != ${this.count} provinces`);
    this.active = [];
    for (let id = 0; id < this.count; id++) {
      const target = vis[id] ? 255 : 0;
      this.from[id] = this.cur[id]!;
      this.to[id] = target;
      if (this.cur[id] !== target) this.active.push(id);
    }
    this.t = 0;
  }

  /** Advances time; calls write(id, level) for changed provinces. Returns whether anything changed. */
  step(dtMs: number, write: (id: number, level: number) => void): boolean {
    if (this.active.length === 0) return false;
    this.t = Math.min(1, this.t + Math.max(0, dtMs) / this.durationMs);
    const k = ease(this.t);
    let changed = false;
    for (const id of this.active) {
      const from = this.from[id]!;
      const to = this.to[id]!;
      const level = this.t >= 1 ? to : Math.round(from + (to - from) * k);
      if (level === this.cur[id]) continue;
      this.cur[id] = level;
      write(id, level);
      changed = true;
    }
    if (this.t >= 1) this.active = [];
    return changed;
  }

  /** Whether an animation is in progress. */
  get busy(): boolean {
    return this.active.length > 0;
  }
}
