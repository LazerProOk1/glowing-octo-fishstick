import type { BiomeDef, Range } from '../../content/biomes/types';
import { isFallback } from '../../content/registry';
import { SEA_LEVEL } from '../../content/terrainLevels';

/** Измерения условий в порядке хранения: высота, температура, влажность, магичность. */
const DIMS = 4;

/**
 * Список биомов, скомпилированный для классификации 2 млн клеток: плоские границы диапазонов
 * в порядке проверки. Сначала водные биомы, потом сухопутные; внутри — по убыванию приоритета
 * (при равенстве — по коду); запасной биом каждого вида — последним.
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
