// Данные провинций для шейдера: одна RGBA8-текстура, тексель на провинцию (по id).
// Без Pixi — только раскладка и CPU-копия; загрузку на GPU делает MapView.
import type { World } from '../sim/world/types';
import type { MapMode, ProvinceRGBA } from './mapModes';

/**
 * Биты канала A. 0–2 — состояние игры (не меняются при смене режима карты; пока не
 * используются шейдером, зарезервированы), 3 — у провинции есть заливка режима, 4–7 — резерв.
 */
export const PROVINCE_FLAGS = {
  /** Не разведано. */
  UNEXPLORED: 1 << 0,
  /** Не видно сейчас (туман войны). */
  HIDDEN: 1 << 1,
  /** Подсветка цели. */
  TARGET: 1 << 2,
  /** Заливка режима карты (RGB — её цвет). */
  FILL: 1 << 3,
} as const;

/** Биты состояния игры, которые сохраняются при смене режима. */
const STATE_BITS = PROVINCE_FLAGS.UNEXPLORED | PROVINCE_FLAGS.HIDDEN | PROVINCE_FLAGS.TARGET;

/** Минимальный MAX_TEXTURE_SIZE, гарантированный WebGL 2. */
export const WEBGL2_MIN_TEXTURE_SIZE = 2048;

/**
 * Раскладка «id → тексель»: одна строка шириной в число провинций, а если их больше maxSize —
 * строки по maxSize: id лежит в (id % width, id / width).
 */
export function provinceDataLayout(count: number, maxSize: number): { width: number; height: number } {
  const n = Math.max(1, count);
  const width = Math.min(n, maxSize);
  const height = Math.ceil(n / width);
  if (height > maxSize) throw new Error(`too many provinces for a ${maxSize}px texture: ${count}`);
  return { width, height };
}

/** CPU-копия текстуры данных провинций и грязный диапазон текселей для частичной загрузки. */
export class ProvinceData {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  /** RGBA8 по id, длина width·height·4 (хвост последней строки не используется). */
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

  /** Записывает тексель провинции как есть и помечает его для загрузки. */
  set(id: number, rgba: ProvinceRGBA): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.count) throw new Error(`bad province id ${id}`);
    const o = id * 4;
    this.data[o] = rgba[0];
    this.data[o + 1] = rgba[1];
    this.data[o + 2] = rgba[2];
    this.data[o + 3] = rgba[3];
    if (id < this.dirtyStart) this.dirtyStart = id;
    if (id + 1 > this.dirtyEnd) this.dirtyEnd = id + 1;
  }

  /** Диапазон текселей [start, end), изменённых с прошлого вызова; null — ничего не менялось. */
  takeDirty(): { start: number; end: number } | null {
    if (this.dirtyEnd <= this.dirtyStart) return null;
    const range = { start: this.dirtyStart, end: this.dirtyEnd };
    this.dirtyStart = Infinity;
    this.dirtyEnd = -Infinity;
    return range;
  }

  /**
   * Пересчитывает цвета всех провинций по режиму. Биты состояния (0–2) сохраняются, бит FILL
   * ставится у провинций с цветом. Грязный диапазон сбрасывается — загружать нужно всё целиком.
   * Возвращает, есть ли хоть одна заливка (нет — шейдер может не читать текстуру).
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
