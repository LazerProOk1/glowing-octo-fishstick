import { beforeAll, describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../../src/content/registry';
import { createRng } from '../../../src/sim/rng';
import { generateHeight } from '../../../src/sim/world/heightmap';
import { computeArcana, computeClimate } from '../../../src/sim/world/climate';
import {
  BIOME_JITTER_AMPLITUDE,
  classifyBiome,
  classifyMoistureJitter,
  classifyTemperatureJitter,
  compileBiomes,
  computeBiomes,
} from '../../../src/sim/world/biomes';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams, SIZE_PRESETS } from '../../../src/sim/world/params';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';

const { w: WORLD_W, h: WORLD_H } = SIZE_PRESETS.medium;

/** Эталонная копия classifyBiome до задачи 12 (решающий список по именам). */
function oldClassify(height: number, temperature: number, moisture: number): string {
  if (height <= SEA_LEVEL) return height < SEA_LEVEL - 0.05 ? 'ocean' : 'coast';
  if (height > 0.85) return 'mountains';
  if (height > 0.72) return 'hills';
  if (temperature < -10) return 'glacier';
  if (temperature < -2) return 'tundra';
  if (temperature > 24 && moisture > 0.7) return 'jungle';
  if (temperature > 20 && moisture < 0.2) return 'desert';
  if (temperature < 5) return moisture > 0.3 ? 'taiga' : 'steppe';
  if (moisture < 0.35) return 'steppe';
  if (moisture > 0.72 && temperature > 8 && height < 0.6) return 'swamp';
  if (moisture > 0.5) return 'forest';
  return 'plains';
}
/** Старый порядок кодов. */
const OLD_BIOMES = [
  'ocean', 'coast', 'plains', 'forest', 'taiga', 'tundra', 'glacier',
  'desert', 'steppe', 'swamp', 'hills', 'mountains', 'jungle',
];

const defs = resolveBiomes({});
const id = (h: number, t: number, m: number, a = 0.5): string => defs[classifyBiome(defs, h, t, m, a)]!.id;

describe('classifyBiome', () => {
  it('water: ocean vs coast', () => {
    expect(id(SEA_LEVEL - 0.06, 10, 0.5)).toBe('ocean');
    expect(id(SEA_LEVEL - 0.01, 10, 0.5)).toBe('coast');
    expect(id(SEA_LEVEL, 10, 0.5)).toBe('coast');
  });
  it('relief', () => {
    expect(id(0.9, 10, 0.5)).toBe('mountains');
    expect(id(0.8, 10, 0.5)).toBe('hills');
  });
  it('climate', () => {
    expect(id(0.6, -15, 0.5)).toBe('glacier');
    expect(id(0.6, 26, 0.8)).toBe('jungle');
    expect(id(0.6, 25, 0.1)).toBe('desert');
  });
  it('границы строгих сравнений старого кода совпадают', () => {
    const cases: Array<[number, number, number]> = [
      [0.85, 10, 0.5], [0.72, 10, 0.5], [0.6, -10, 0.5], [0.6, -2, 0.5], [0.6, 24, 0.71], [0.6, 25, 0.7],
      [0.6, 20, 0.1], [0.6, 21, 0.2], [0.6, 4.9, 0.3], [0.6, 5, 0.34], [0.6, 5, 0.35], [0.59, 9, 0.72],
      [0.59, 8, 0.8], [0.6, 9, 0.8], [0.6, 10, 0.5], [0.6, 10, 0.51], [SEA_LEVEL - 0.05, 0, 1],
    ];
    for (const [h, t, m] of cases) expect(id(h, t, m), `${h} ${t} ${m}`).toBe(oldClassify(h, t, m));
  });
  it('выключенный биом: его ниша достаётся следующему по приоритету', () => {
    const noMountains = resolveBiomes({ disabledBiomes: ['mountains'] });
    expect(noMountains[classifyBiome(noMountains, 0.9, 10, 0.5, 0.5)]!.id).toBe('hills');
    const noSwamp = resolveBiomes({ disabledBiomes: ['swamp'] });
    expect(noSwamp[classifyBiome(noSwamp, 0.55, 10, 0.8, 0.5)]!.id).toBe('forest');
  });
  it('classifyBiome и computeBiomes согласованы на случайной выборке (и с фэнтези)', () => {
    const rng = createRng('sample');
    for (const list of [defs, resolveBiomes({ fantasy: true }), resolveBiomes({ disabledBiomes: ['swamp', 'mountains'] })]) {
      const n = 4000;
      const h = new Float32Array(n);
      const t = new Float32Array(n);
      const m = new Float32Array(n);
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        h[i] = rng.next();
        t[i] = -35 + 70 * rng.next();
        m[i] = rng.next();
        a[i] = rng.next();
      }
      const fast = computeBiomes(list, h, t, m, a);
      let diff = 0;
      for (let i = 0; i < n; i++) if (classifyBiome(list, h[i]!, t[i]!, m[i]!, a[i]!) !== fast[i]) diff++;
      expect(diff).toBe(0);
    }
  });
  it('компиляция: приоритеты по убыванию, вода и суша раздельно, запасной последним', () => {
    const c = compileBiomes(defs);
    const land = [...c.code.slice(c.landStart)].map((k) => defs[k]!.id);
    const water = [...c.code.slice(0, c.landStart)].map((k) => defs[k]!.id);
    expect(water).toEqual(['ocean', 'coast']);
    expect(land[0]).toBe('mountains');
    expect(land[land.length - 1]).toBe('plains');
  });
});

/**
 * Самая длинная прямая горизонтальная граница «джунгли / не джунгли»: для каждой строки y
 * самая длинная серия подряд идущих x, где граница лежит между строками y и y + 1.
 */
function longestStraightJungleEdge(biome: Uint8Array, list: readonly { id: string }[], w: number, h: number): number {
  const jungle = list.findIndex((d) => d.id === 'jungle');
  let best = 0;
  for (let y = 0; y + 1 < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      const a = biome[y * w + x] === jungle;
      const b = biome[(y + 1) * w + x] === jungle;
      run = a !== b ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
}

describe('смещение климата для выбора биома', () => {
  const w = WORLD_W;
  const h = 256; // градиенты на строку как у medium; масштаб смещения задан в клетках
  const n = w * h;
  const height = new Float32Array(n).fill(0.65);
  const arcana = new Float32Array(n).fill(0.5);
  /** Поле, зависящее только от строки: как широтный градиент без шума по x. */
  const rows = (f: (y: number) => number): Float32Array => {
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) out.fill(f(y), y * w, (y + 1) * w);
    return out;
  };
  // Градиенты как у реального мира у порогов джунглей: ~0.055 °C и ~0.005 влажности на строку.
  const temperature = rows((y) => 24 + 0.055 * (y - h / 2));
  const moisture = rows((y) => 0.7 + 0.005 * (y - h / 2));
  const wet = new Float32Array(n).fill(0.9);
  const hot = new Float32Array(n).fill(27);
  // На гладком поле без шума у гребня волны шириной 40–120 клеток край на 30–45 клеток идёт ровно,
  // и это не дефект: проверяется, что прямой отрезок стал во много раз короче ширины карты.
  // В настоящем мире климат сам шумит; там предел 25 клеток и проверка выравнивания по широте.
  const SMOOTH_MAX_RUN = 64;

  it('без смещения граница — прямая во всю ширину (воспроизводит дефект)', () => {
    expect(longestStraightJungleEdge(computeBiomes(defs, height, temperature, wet, arcana), defs, w, h)).toBe(w);
    expect(longestStraightJungleEdge(computeBiomes(defs, height, hot, moisture, arcana), defs, w, h)).toBe(w);
  });

  it('граница по температуре извилиста; поле температуры не меняется', () => {
    const before = temperature.slice();
    const t = classifyTemperatureJitter(createRng('j').fork('biomeJitter'), temperature, w, h);
    expect(temperature).toEqual(before);
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(t[i]! - temperature[i]!));
    expect(max).toBeLessThanOrEqual(BIOME_JITTER_AMPLITUDE + 1e-4);
    expect(max).toBeGreaterThan(BIOME_JITTER_AMPLITUDE * 0.9);
    expect(longestStraightJungleEdge(computeBiomes(defs, height, t, wet, arcana), defs, w, h)).toBeLessThanOrEqual(SMOOTH_MAX_RUN);
  });

  it('граница по влажности извилиста', () => {
    const m = classifyMoistureJitter(createRng('j').fork('biomeJitter').fork('moisture'), moisture, w, h);
    expect(longestStraightJungleEdge(computeBiomes(defs, height, hot, m, arcana), defs, w, h)).toBeLessThanOrEqual(SMOOTH_MAX_RUN);
  });

  it('детерминизм', () => {
    const a = classifyTemperatureJitter(createRng('j'), temperature, w, h);
    const b = classifyTemperatureJitter(createRng('j'), temperature, w, h);
    expect(a).toEqual(b);
  });
});

/** Полоса строк для проверки выравнивания края по широте: разброс в ней ≤ 3 строк. */
const ALIGN_BAND = 4;
/** Предел доли клеток края джунглей в одной полосе; без смещения климата на medium 13–16%. */
const ALIGN_MAX_SHARE = 0.11;

/**
 * Насколько край джунглей выстроен по одной широте. Отдельно для южного края (джунгли в строке y,
 * под ними в y + 1 суша без джунглей) и северного (наоборот): клетки края считаются по строкам,
 * и берётся наибольшая доля клеток, попавших в одну полосу из ALIGN_BAND соседних строк.
 * Возвращает больший из двух краёв. Ровная широтная граница у многих пятен даёт большую долю,
 * даже если сплошной длинной прямой нигде нет.
 */
function jungleEdgeAlignment(biome: Uint8Array, list: readonly { id: string; kind: string }[], w: number, h: number): number {
  const jungle = list.findIndex((d) => d.id === 'jungle');
  const land = (c: number): boolean => list[c]?.kind === 'land';
  let worst = 0;
  for (const south of [true, false]) {
    const rows = new Array<number>(h).fill(0);
    let total = 0;
    for (let y = 0; y + 1 < h; y++) {
      for (let x = 0; x < w; x++) {
        const top = biome[y * w + x]!;
        const bot = biome[(y + 1) * w + x]!;
        const edge = south ? top === jungle && bot !== jungle && land(bot) : bot === jungle && top !== jungle && land(top);
        if (edge) {
          rows[y]!++;
          total++;
        }
      }
    }
    let best = 0;
    for (let y = 0; y + ALIGN_BAND <= h; y++) {
      let s = 0;
      for (let k = 0; k < ALIGN_BAND; k++) s += rows[y + k]!;
      best = Math.max(best, s);
    }
    if (total > 0) worst = Math.max(worst, best / total);
  }
  return worst;
}

describe.each(['1', 'worldbox'])('no straight biome edges (medium, seed %j)', (seed) => {
  let world: ReturnType<typeof generateWorld>;
  beforeAll(() => {
    world = generateWorld(defaultParams(seed));
  }, 60000);

  it('граница джунглей не идёт прямой линией длиннее 25 клеток', () => {
    const len = longestStraightJungleEdge(world.biome, world.biomes, world.w, world.h);
    expect(len).toBeLessThanOrEqual(25);
  });

  it('без смещения край джунглей выстроен по широте (воспроизводит дефект)', () => {
    const { w, h } = world;
    const rng = createRng(seed);
    const height = generateHeight(rng.fork('height'), w, h);
    const { temperature, moisture } = computeClimate(rng.fork('climate'), height, w, h);
    const raw = computeBiomes(world.biomes, height, temperature, moisture, computeArcana(seed, w, h));
    expect(jungleEdgeAlignment(raw, world.biomes, w, h)).toBeGreaterThan(ALIGN_MAX_SHARE);
  }, 60000);

  it(`край джунглей не выстраивается по одной широте: ≤ ${ALIGN_MAX_SHARE * 100}% клеток края в полосе из ${ALIGN_BAND} строк`, () => {
    expect(jungleEdgeAlignment(world.biome, world.biomes, world.w, world.h)).toBeLessThanOrEqual(ALIGN_MAX_SHARE);
  });
});

describe.each(['1', 'Бета-7'])('world biomes (seed %j)', (seed) => {
  const w = WORLD_W;
  const h = WORLD_H;
  const height = generateHeight(createRng(seed).fork('height'), w, h);
  const { temperature, moisture } = computeClimate(createRng(seed).fork('climate'), height, w, h);
  const arcana = computeArcana(seed, w, h);
  const biomes = computeBiomes(defs, height, temperature, moisture, arcana);
  const name = (i: number): string => defs[biomes[i] ?? 0]?.id ?? '';

  it('совместимость: коды поэлементно равны старому classifyBiome', () => {
    let diff = 0;
    for (let i = 0; i < biomes.length; i++) {
      const old = OLD_BIOMES.indexOf(oldClassify(height[i]!, temperature[i]!, moisture[i]!));
      if (biomes[i] !== old) diff++;
    }
    expect(diff).toBe(0);
  });

  it('array sizes and ranges', () => {
    expect(temperature.length).toBe(w * h);
    expect(moisture.length).toBe(w * h);
    expect(biomes.length).toBe(w * h);
    expect(arcana.length).toBe(w * h);
    for (let i = 0; i < moisture.length; i += 97) {
      expect(moisture[i]).toBeGreaterThanOrEqual(0);
      expect(moisture[i]).toBeLessThanOrEqual(1);
      expect(arcana[i]).toBeGreaterThanOrEqual(0);
      expect(arcana[i]).toBeLessThanOrEqual(1);
    }
  });

  it('latitude sanity', () => {
    for (let y = 0; y < h; y++) {
      const polar = y < 20 || y > 1003;
      const equator = y >= 500 && y <= 524;
      if (!polar && !equator) continue;
      for (let x = 0; x < w; x++) {
        const b = name(y * w + x);
        if (polar) expect(b === 'jungle' || b === 'desert').toBe(false);
        if (equator) expect(b === 'tundra' || b === 'glacier').toBe(false);
      }
    }
  });

  it('has at least 10 land biomes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < biomes.length; i++) {
      const b = name(i);
      if (b !== 'ocean' && b !== 'coast') seen.add(b);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it('water biomes only on water, land biomes only on land', () => {
    let wrong = 0;
    for (let i = 0; i < biomes.length; i++) {
      const water = defs[biomes[i]!]!.kind === 'water';
      if (water !== (height[i] ?? 0) <= SEA_LEVEL) wrong++;
    }
    expect(wrong).toBe(0);
  });

  it('deserts sit in subtropical belts, taiga/tundra at high latitudes', () => {
    let desert = 0;
    let desertOk = 0;
    let cold = 0;
    let coldOk = 0;
    for (let i = 0; i < biomes.length; i++) {
      const b = name(i);
      const d = Math.abs(Math.floor(i / w) / h - 0.5);
      if (b === 'desert') {
        desert++;
        if (d >= 0.1 && d <= 0.3) desertOk++;
      } else if (b === 'taiga' || b === 'tundra') {
        cold++;
        if (d > 0.25) coldOk++;
      }
    }
    expect(desert).toBeGreaterThan(0);
    expect(cold).toBeGreaterThan(0);
    expect(desertOk / desert).toBeGreaterThanOrEqual(0.7);
    expect(coldOk / cold).toBeGreaterThanOrEqual(0.7);
  });
});
