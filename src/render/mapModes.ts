// Map modes (spec §7.3): a mode is a function "province → fill colour". The colours go into the
// province data texture (provinceData.ts), the shader blends them with the terrain. A new mode is
// a new entry in MAP_MODES, the shader does not change. Future modes (owner, resources, religion)
// work the same way.
import type { Province, World } from '../sim/world/types';

/** RGBA8: RGB — fill colour, A — mode flags (bits 3–7, see PROVINCE_FLAGS); usually 0. */
export type ProvinceRGBA = readonly [number, number, number, number];

export interface MapMode {
  id: string;
  /** Translation key of the name (i18n). */
  nameKey: string;
  /** Fill colour of a province; null — no fill (bare terrain is visible). */
  color(p: Province, world: World): ProvinceRGBA | null;
  /** Fill strength over the terrain, 0..1; DEFAULT_FILL by default. */
  fill?: number;
}

/** Default fill strength: the mode colour is noticeable while terrain shading and details stay visible. */
export const DEFAULT_FILL = 0.55;

function hslToRgb(h: number, s: number, l: number): ProvinceRGBA {
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [ch(0), ch(8), ch(4), 0];
}

/**
 * Province colouring palette: muted hues (saturation 0.34, below the 0.45 limit for map colours)
 * with alternating lightness, so neighbouring hues on the wheel differ too.
 * Indices beyond the base hues are extra hues at the golden angle (rarely needed).
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
 * Greedy colouring of land provinces over the adjacency graph (shared border and straits): each one
 * gets a colour not used by already coloured neighbours; among the free ones, the rarest at the
 * moment, so hues are spread evenly. Deterministic (order by id).
 * Sea provinces are not coloured (NO_COLOR).
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

/** Next mode in a cycle; an unknown id gives the first mode. */
export function nextMapMode(id: string): MapMode {
  const i = MAP_MODES.findIndex((m) => m.id === id);
  const next = MAP_MODES[(i + 1) % MAP_MODES.length];
  if (!next) throw new Error('MAP_MODES is empty');
  return next;
}
