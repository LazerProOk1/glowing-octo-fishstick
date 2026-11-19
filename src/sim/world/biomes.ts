import type { BiomeDef, Range } from '../../content/biomes/types';
import { hasTag, isFallback } from '../../content/registry';
import { SEA_LEVEL } from '../../content/terrainLevels';
import { createNoise2D, fbm } from '../noise';
import type { Rng } from '../rng';
import { sampleCoarse } from './climate';

/** Condition dimensions in storage order: height, temperature, moisture, arcana. */
const DIMS = 4;

/**
 * Biome list compiled for classifying 2M cells: flat range bounds in check order.
 * Water biomes first, then land; within each group by descending priority (ties by code);
 * the fallback biome of each kind comes last. The lake biome (tag lake) is not part of the scan:
 * findLakes/applyLakeBiome sets it by the shape of the water body.
 */
export interface CompiledBiomes {
  /** Biome code (index in the world list) per check position. */
  code: Uint8Array;
  /** Lower (inclusive) and upper (exclusive) bounds: position × DIMS + dimension. */
  lo: Float64Array;
  hi: Float64Array;
  /** Position of the first land biome; water biomes occupy [0, landStart). */
  landStart: number;
}

export function compileBiomes(biomes: readonly BiomeDef[]): CompiledBiomes {
  const order = biomes
    .map((def, code) => ({ def, code }))
    .filter(({ def }) => !hasTag(def, 'lake'))
    .sort((a, b) => {
      if (a.def.kind !== b.def.kind) return a.def.kind === 'water' ? -1 : 1;
      const fa = isFallback(a.def) ? 1 : 0;
      const fb = isFallback(b.def) ? 1 : 0;
      return fa - fb || b.def.priority - a.def.priority || a.code - b.code;
    });
  const n = order.length;
  const code = new Uint8Array(n);
  const lo = new Float64Array(n * DIMS).fill(-Infinity);
  const hi = new Float64Array(n * DIMS).fill(Infinity);
  let landStart = n;
  order.forEach(({ def, code: c }, k) => {
    code[k] = c;
    if (def.kind === 'land' && landStart === n) landStart = k;
    const dims: Array<Range | undefined> = [def.when.height, def.when.temperature, def.when.moisture, def.when.arcana];
    dims.forEach((r, d) => {
      if (!r) return;
      lo[k * DIMS + d] = r[0];
      hi[k * DIMS + d] = r[1];
    });
  });
  if (landStart === 0 || landStart === n) throw new Error('нужны и водные, и сухопутные биомы');
  return { code, lo, hi, landStart };
}

/** Position of the first matching biome in [from, to); if none matches, the last one (fallback). */
function pick(c: CompiledBiomes, from: number, to: number, h: number, t: number, m: number, a: number): number {
  const { lo, hi } = c;
  for (let k = from; k < to; k++) {
    const o = k * DIMS;
    if (
      h >= lo[o]! && h < hi[o]! &&
      t >= lo[o + 1]! && t < hi[o + 1]! &&
      m >= lo[o + 2]! && m < hi[o + 2]! &&
      a >= lo[o + 3]! && a < hi[o + 3]!
    ) {
      return k;
    }
  }
  return to - 1;
}

/**
 * Biome index in `biomes` for one cell. Water (height ≤ SEA_LEVEL) is chosen only among water
 * biomes, land only among land biomes; the first match is the highest-priority biome.
 */
export function classifyBiome(
  biomes: readonly BiomeDef[],
  height: number,
  temperature: number,
  moisture: number,
  arcana: number,
): number {
  const c = compileBiomes(biomes);
  const water = height <= SEA_LEVEL;
  return c.code[pick(c, water ? 0 : c.landStart, water ? c.landStart : c.code.length, height, temperature, moisture, arcana)]!;
}

/** Largest temperature offset (°C) when choosing a biome. */
export const BIOME_JITTER_AMPLITUDE = 1.5;
/**
 * Largest moisture offset when choosing a biome. The jungle edge is almost everywhere set by
 * moisture (threshold 0.7), and near the equator it changes by ~0.005–0.009 per row: ±0.15 shifts
 * the edge by ±15–30 rows, and jungle patches stop breaking off at a single latitude. Biome shares
 * stay within 1 pp.
 */
export const BIOME_MOISTURE_JITTER_AMPLITUDE = 0.15;
/**
 * Octave wavelengths of the offset, in cells: 120, ~69, 40 — at any map size. If they were scaled
 * by map height, on small the patches become twice as fine and split provinces: land provinces on
 * small "1" were 1020 against a limit of 999.
 */
const JITTER_WAVELENGTH = 120;
const JITTER_OCTAVES = 3;
const JITTER_LACUNARITY = Math.sqrt(3);
/**
 * fbm stretch before clamping to [-1, 1]: a normalized fbm has a standard deviation of ~0.3, and
 * without the stretch the offset would be three times smaller than the stated amplitude (the border
 * barely bent). After the stretch ~20% of cells hit ±amplitude. Checked on medium "1" and
 * "worldbox": stretch 1–2 and soft saturation s/√(1+s²) align the jungle edge by latitude more
 * strongly (11–17% of edge cells in one band of 4 rows versus 9–11% here).
 */
const JITTER_GAIN = 2.5;

/** Copy of `field` plus amp × fbm (scale 40–120 cells). */
function jitter(rng: Rng, field: Float32Array, amp: number, w: number, h: number): Float32Array {
  const noise = createNoise2D(rng);
  const cells = JITTER_WAVELENGTH;
  const out = new Float32Array(w * h);
  sampleCoarse(
    (u, v) => {
      const s = JITTER_GAIN * fbm(noise, (u * w) / cells, (v * h) / cells, JITTER_OCTAVES, JITTER_LACUNARITY);
      return amp * (s < -1 ? -1 : s > 1 ? 1 : s);
    },
    w,
    h,
    out,
  );
  for (let i = 0; i < out.length; i++) out[i] = field[i]! + out[i]!;
  return out;
}

/**
 * Temperature for biome selection only: the `temperature` field offset by fbm noise with amplitude
 * ±BIOME_JITTER_AMPLITUDE and scale 40–120 cells. Without the offset the latitudinal gradient at a
 * threshold (e.g. 24 °C at the jungles) is nearly the same along x, and the biome border runs as a
 * straight line. The `World.temperature` field itself is unchanged. `rng` is a separate stream
 * (`rng.fork('biomeJitter')`).
 */
export function classifyTemperatureJitter(rng: Rng, temperature: Float32Array, w: number, h: number): Float32Array {
  return jitter(rng, temperature, BIOME_JITTER_AMPLITUDE, w, h);
}

/**
 * Moisture for biome selection only — the same offset as for temperature, with its own noise
 * (±BIOME_MOISTURE_JITTER_AMPLITUDE). Zonal moisture also depends on latitude, and the jungle
 * moisture threshold (0.7) produced a straight border at the equator. `World.moisture` is unchanged.
 */
export function classifyMoistureJitter(rng: Rng, moisture: Float32Array, w: number, h: number): Float32Array {
  return jitter(rng, moisture, BIOME_MOISTURE_JITTER_AMPLITUDE, w, h);
}

export function computeBiomes(
  biomes: readonly BiomeDef[],
  height: Float32Array,
  temperature: Float32Array,
  moisture: Float32Array,
  arcana: Float32Array,
): Uint8Array {
  const c = compileBiomes(biomes);
  const { code, lo, hi, landStart } = c;
  const n = code.length;
  const out = new Uint8Array(height.length);
  // The same scan as in pick, unrolled into a loop without calls or allocations.
  for (let i = 0; i < out.length; i++) {
    const h = height[i]!;
    const t = temperature[i]!;
    const m = moisture[i]!;
    const a = arcana[i]!;
    const water = h <= SEA_LEVEL;
    const to = water ? landStart : n;
    let k = water ? 0 : landStart;
    for (; k < to; k++) {
      const o = k * DIMS;
      if (
        h >= lo[o]! && h < hi[o]! &&
        t >= lo[o + 1]! && t < hi[o + 1]! &&
        m >= lo[o + 2]! && m < hi[o + 2]! &&
        a >= lo[o + 3]! && a < hi[o + 3]!
      ) {
        break;
      }
    }
    out[i] = code[k < to ? k : to - 1]!;
  }
  return out;
}
