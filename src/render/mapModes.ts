// Режимы карты (спец §7.3): режим — это функция «провинция → цвет заливки». Цвета пишутся в
// текстуру данных провинций (provinceData.ts), шейдер смешивает их с рельефом. Новый режим —
// новая запись в MAP_MODES, шейдер не меняется. Будущие режимы (владелец, ресурсы, религия)
// устроены так же.
import type { Province, World } from '../sim/world/types';

/** RGBA8: RGB — цвет заливки, A — флаги режима (биты 3–7, см. PROVINCE_FLAGS); обычно 0. */
export type ProvinceRGBA = readonly [number, number, number, number];

export interface MapMode {
  id: string;
  /** Ключ перевода названия (i18n). */
  nameKey: string;
  /** Цвет заливки провинции; null — без заливки (виден чистый рельеф). */
  color(p: Province, world: World): ProvinceRGBA | null;
  /** Сила заливки поверх рельефа, 0..1; по умолчанию DEFAULT_FILL. */
  fill?: number;
}

/** Сила заливки по умолчанию: цвет режима заметен, а отмывка рельефа и детали остаются видны. */
export const DEFAULT_FILL = 0.55;

/** Насыщенность HSL цвета 0..255 (0 — серый, 1 — чистый тон). */
export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  if (d === 0) return 0;
  const l = (max + min) / 2;
  return d / (1 - Math.abs(2 * l - 1));
}

function hslToRgb(h: number, s: number, l: number): ProvinceRGBA {
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [ch(0), ch(8), ch(4), 0];
}

/**
 * Палитра раскраски провинций: приглушённые тона (насыщенность 0.34, ниже предела 0.45 для
 * цветов карты) с чередованием светлоты, чтобы соседние по кругу тона тоже различались.
 * Индексы за пределами базовых тонов — дополнительные тона по золотому углу (нужны редко).
 */
const BASE_HUES = [8, 38, 62, 98, 150, 188, 222, 268, 318];
const PROVINCE_SAT = 0.34;

function provincePaletteColor(i: number): ProvinceRGBA {
  const hue = i < BASE_HUES.length ? (BASE_HUES[i] as number) : (i * 137.508) % 360;
  const light = i % 2 === 0 ? 0.62 : 0.53;
  return hslToRgb(hue, PROVINCE_SAT, light);
}

const NO_COLOR = 0xffff;
const coloringCache = new WeakMap<World, Uint16Array>();

/**
 * Жадная раскраска сухопутных провинций по графу соседства (общая граница и проливы): каждая
 * получает цвет, которого нет у уже раскрашенных соседей; из свободных — самый редкий
 * на текущий момент, чтобы тона распределялись ровно. Детерминирована (порядок — по id).
 * Морские провинции не раскрашиваются (NO_COLOR).
 */
export function colorProvinces(world: World): Uint16Array {
  const cached = coloringCache.get(world);
  if (cached) return cached;
  const n = world.provinces.length;
  const out = new Uint16Array(n).fill(NO_COLOR);
  const uses: number[] = [];
  const taken = new Set<number>();
  for (const p of world.provinces) {
    if (!p.isLand) continue;
    taken.clear();
    for (const ei of world.edgesOf[p.id] ?? []) {
      const e = world.adjacency[ei];
      if (!e) continue;
      const other = e.a === p.id ? e.b : e.a;
      const c = out[other] as number;
      if (c !== NO_COLOR) taken.add(c);
    }
    let best = -1;
    for (let c = 0; c < Math.max(BASE_HUES.length, uses.length); c++) {
      if (taken.has(c)) continue;
      if (best < 0 || (uses[c] ?? 0) < (uses[best] ?? 0)) best = c;
    }
    if (best < 0) best = Math.max(BASE_HUES.length, uses.length);
    out[p.id] = best;
    uses[best] = (uses[best] ?? 0) + 1;
  }
  coloringCache.set(world, out);
  return out;
}

export const MAP_MODES: readonly MapMode[] = [
  {
    id: 'terrain',
    nameKey: 'mapMode.terrain',
    color: () => null,
  },
  {
    id: 'provinces',
    nameKey: 'mapMode.provinces',
    color(p, world) {
      const c = colorProvinces(world)[p.id];
      return c === undefined || c === NO_COLOR ? null : provincePaletteColor(c);
    },
  },
];

export function mapModeById(id: string): MapMode | undefined {
  return MAP_MODES.find((m) => m.id === id);
}

/** Следующий режим по кругу; неизвестный id — первый режим. */
export function nextMapMode(id: string): MapMode {
  const i = MAP_MODES.findIndex((m) => m.id === id);
  const next = MAP_MODES[(i + 1) % MAP_MODES.length];
  if (!next) throw new Error('MAP_MODES is empty');
  return next;
}
