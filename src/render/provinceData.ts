// Province data for the shader: one RGBA8 texture, one texel per province (by id).
// No Pixi here — only the layout and the CPU copy; MapView uploads it to the GPU.
import type { World } from '../sim/world/types';
import type { MapMode, ProvinceRGBA } from './mapModes';

/**
 * Bits of channel A. 0–2 — game state (unchanged when the map mode changes; not used by the
 * shader yet, reserved), 3 — the province has a mode fill, 4–7 — reserved.
 */
export const PROVINCE_FLAGS = {
  /** Not explored. */
  UNEXPLORED: 1 << 0,
  /** Not visible right now (fog of war). */
  HIDDEN: 1 << 1,
  /** Target highlight. */
  TARGET: 1 << 2,
  /** Map mode fill (RGB — its colour). */
  FILL: 1 << 3,
} as const;

/** Game state bits kept when the mode changes. */
const STATE_BITS = PROVINCE_FLAGS.UNEXPLORED | PROVINCE_FLAGS.HIDDEN | PROVINCE_FLAGS.TARGET;

/** The minimum MAX_TEXTURE_SIZE guaranteed by WebGL 2. */
export const WEBGL2_MIN_TEXTURE_SIZE = 2048;

/**
 * "id → texel" layout: one row as wide as the province count, or, if there are more than maxSize,
 * rows of maxSize: id sits at (id % width, id / width).
 */
export function provinceDataLayout(count: number, maxSize: number): { width: number; height: number } {
  const n = Math.max(1, count);
  const width = Math.min(n, maxSize);
  const height = Math.ceil(n / width);
  if (height > maxSize) throw new Error(`too many provinces for a ${maxSize}px texture: ${count}`);
  return { width, height };
}

/** CPU copy of the province data texture and the dirty texel range for partial upload. */
export class ProvinceData {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  /** RGBA8 by id, length width·height·4 (the tail of the last row is unused). */
  readonly data: Uint8Array;
  private dirtyStart = Infinity;
  private dirtyEnd = -Infinity;

  constructor(count: number, maxSize: number) {
    const { width, height } = provinceDataLayout(count, maxSize);
    this.width = width;
    this.height = height;
    this.count = count;
    this.data = new Uint8Array(width * height * 4);
  }

  /** Writes a province texel as is and marks it for upload. A channel must be an integer 0..255, else RangeError. */
  set(id: number, rgba: ProvinceRGBA): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.count) throw new Error(`bad province id ${id}`);
    for (const ch of rgba) {
      if (!Number.isInteger(ch) || ch < 0 || ch > 255) throw new RangeError(`province channel out of 0..255: ${ch}`);
    }
    const o = id * 4;
    this.data[o] = rgba[0];
    this.data[o + 1] = rgba[1];
    this.data[o + 2] = rgba[2];
    this.data[o + 3] = rgba[3];
    if (id < this.dirtyStart) this.dirtyStart = id;
    if (id + 1 > this.dirtyEnd) this.dirtyEnd = id + 1;
  }

  /** Texel range [start, end) changed since the last call; null — nothing changed. */
  takeDirty(): { start: number; end: number } | null {
    if (this.dirtyEnd <= this.dirtyStart) return null;
    const range = { start: this.dirtyStart, end: this.dirtyEnd };
    this.dirtyStart = Infinity;
    this.dirtyEnd = -Infinity;
    return range;
  }

  /**
   * Recomputes the colours of all provinces for the mode. The state bits (0–2) are kept, the FILL
   * bit is set on provinces with a colour. The dirty range is reset — everything must be uploaded.
   * Returns whether there is at least one fill (if not, the shader may skip the texture).
   */
  applyMode(mode: MapMode, world: World): boolean {
    const d = this.data;
    let any = false;
    for (let id = 0; id < this.count; id++) {
      const p = world.provinces[id];
      const c = p ? mode.color(p, world) : null;
      const o = id * 4;
      const state = (d[o + 3] as number) & STATE_BITS;
      if (c) {
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = state | (c[3] & ~STATE_BITS) | PROVINCE_FLAGS.FILL;
        any = true;
      } else {
        d[o] = 0;
        d[o + 1] = 0;
        d[o + 2] = 0;
        d[o + 3] = state;
      }
    }
    this.takeDirty();
    return any;
  }
}
