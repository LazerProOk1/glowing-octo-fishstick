import type { BiomeDef, Range } from '../../content/biomes/types';
import { hasTag, isFallback } from '../../content/registry';
import { SEA_LEVEL } from '../../content/terrainLevels';
import { createNoise2D, fbm } from '../noise';
import type { Rng } from '../rng';
import { sampleCoarse } from './climate';

/** Измерения условий в порядке хранения: высота, температура, влажность, магичность. */
const DIMS = 4;

/**
 * Список биомов, скомпилированный для классификации 2 млн клеток: плоские границы диапазонов
 * в порядке проверки. Сначала водные биомы, потом сухопутные; внутри — по убыванию приоритета
 * (при равенстве — по коду); запасной биом каждого вида — последним. Озёрный биом (тег lake)
 * в перебор не входит: его ставит findLakes/applyLakeBiome по форме водоёма.
 */
export interface CompiledBiomes {
  /** Код биома (индекс в списке мира) по позиции проверки. */
  code: Uint8Array;
  /** Нижние (включительно) и верхние (не включительно) границы: позиция × DIMS + измерение. */
  lo: Float64Array;
  hi: Float64Array;
  /** Позиция первого сухопутного биома; водные — [0, landStart). */
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

/** Позиция первого подходящего биома в [from, to); если ни один не подошёл — последняя (запасной). */
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
 * Индекс биома в `biomes` для одной клетки. Вода (высота ≤ SEA_LEVEL) выбирается только среди
 * водных биомов, суша — среди сухопутных; первым подходит биом с большим приоритетом.
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

/** Наибольшее смещение температуры (°C) при выборе биома. */
export const BIOME_JITTER_AMPLITUDE = 1.5;
/**
 * Наибольшее смещение влажности при выборе биома. Край джунглей почти везде задаёт влажность
 * (порог 0.7), а у экватора она меняется на ~0.005–0.009 за строку: ±0.15 сдвигает край на
 * ±15–30 строк, и пятна джунглей перестают обрываться на одной широте. Доли биомов — в пределах 1 п.п.
 */
export const BIOME_MOISTURE_JITTER_AMPLITUDE = 0.15;
/**
 * Длины волн октав смещения, клеток: 120, ~69, 40 — на любом размере карты. Если масштабировать их
 * по высоте карты, на small пятна становятся вдвое мельче и дробят провинции: суши-провинций на
 * small "1" было 1020 при пределе 999.
 */
const JITTER_WAVELENGTH = 120;
const JITTER_OCTAVES = 3;
const JITTER_LACUNARITY = Math.sqrt(3);
/**
 * Растяжка fbm перед обрезкой до [-1, 1]: у нормированного fbm стандартное отклонение ~0.3,
 * и без растяжки смещение было бы втрое меньше заявленной амплитуды (граница почти не изгибалась).
 * После растяжки ~20% клеток упираются в ±амплитуду. Проверено на medium "1" и "worldbox":
 * растяжка 1–2 и мягкое насыщение s/√(1+s²) выравнивают край джунглей по широте сильнее (11–17%
 * клеток края в одной полосе из 4 строк против 9–11% здесь).
 */
const JITTER_GAIN = 2.5;

/** Копия `field` плюс amp × fbm (масштаб 40–120 клеток). */
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
 * Температура только для выбора биома: поле `temperature`, смещённое fbm-шумом с амплитудой
 * ±BIOME_JITTER_AMPLITUDE и масштабом 40–120 клеток. Без смещения широтный градиент у порога
 * (например, 24 °C у джунглей) почти одинаков по x, и граница биомов тянется прямой линией.
 * Само поле `World.temperature` не меняется. `rng` — отдельный поток (`rng.fork('biomeJitter')`).
 */
export function classifyTemperatureJitter(rng: Rng, temperature: Float32Array, w: number, h: number): Float32Array {
  return jitter(rng, temperature, BIOME_JITTER_AMPLITUDE, w, h);
}

/**
 * Влажность только для выбора биома — то же смещение, что у температуры, со своим шумом
 * (±BIOME_MOISTURE_JITTER_AMPLITUDE). Зональная влажность тоже зависит от широты, и порог
 * влажности джунглей (0.7) давал прямую границу у экватора. `World.moisture` не меняется.
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
  // Тот же перебор, что в pick, развёрнутый в цикл без вызовов и выделений памяти.
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
