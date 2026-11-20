// Province game state for the shader: a second RGBA8 texture, one texel per province (by id), in the
// same layout as ProvinceData. R — fog visibility 0..255 (0 unknown, 255 seen), G — 255 on own
// provinces, B/A free. No Pixi here — only the CPU copy; MapView uploads it to the GPU.
import { provinceDataLayout } from './provinceData';

/** Channel offsets inside a texel. */
const FOG = 0;
const OWN = 1;

/** CPU copy of the province state texture and the dirty texel range for partial upload. */
export class ProvinceState {
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

  /** Fog visibility of a province, an integer 0..255 (255 — fully seen); else RangeError. */
  setFog(id: number, level: number): void {
    if (!Number.isInteger(level) || level < 0 || level > 255) throw new RangeError(`fog level out of 0..255: ${level}`);
    this.write(id, FOG, level);
  }

  /** Marks a province as the player's own (or not). */
  setOwn(id: number, own: boolean): void {
    this.write(id, OWN, own ? 255 : 0);
  }

  /** Texel range [start, end) changed since the last call; null — nothing changed. */
  takeDirty(): { start: number; end: number } | null {
    if (this.dirtyEnd <= this.dirtyStart) return null;
    const range = { start: this.dirtyStart, end: this.dirtyEnd };
    this.dirtyStart = Infinity;
    this.dirtyEnd = -Infinity;
    return range;
  }

  private write(id: number, channel: number, value: number): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.count) throw new Error(`bad province id ${id}`);
    const o = id * 4 + channel;
    if (this.data[o] === value) return;
    this.data[o] = value;
    if (id < this.dirtyStart) this.dirtyStart = id;
    if (id + 1 > this.dirtyEnd) this.dirtyEnd = id + 1;
  }
}
