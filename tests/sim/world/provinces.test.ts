import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '../../../src/sim/rng';
import { generateHeight } from '../../../src/sim/world/heightmap';
import type { BiomeDef, GenOptions } from '../../../src/content/biomes/types';
import { resolveBiomes } from '../../../src/content/registry';
import { computeArcana, computeClimate } from '../../../src/sim/world/climate';
import { computeBiomes } from '../../../src/sim/world/biomes';
import { computeRivers } from '../../../src/sim/world/rivers';
import { computeProvinces } from '../../../src/sim/world/provinces';
import { normalizeShoreline } from '../../../src/sim/world/shoreline';
import { findLakes } from '../../../src/sim/world/lakes';
import {
  bumpShare,
  longestStraightBorder,
  provinceBounds,
  purity,
  riverViolations,
  splittableIsland,
  strayMountainCells,
} from './provinceMetrics';
import { SIZE_PRESETS, type WorldSize } from '../../../src/sim/world/params';
import type { Province } from '../../../src/sim/world/types';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';

/**
 * Пороги качества провинций по размеру мира. Спец и настройка генератора — для medium. Материки и
 * климат заданы в долях карты, а провинции — в клетках (радиус Пуассона), поэтому на small пятна
 * биомов вдвое мельче относительно провинции: смешанных провинций и ступенек на границах
 * (растр биомов грубее) больше. Для small пороги ослаблены и записаны явно.
 */
/**
 * Доли bumps и straight считаются от числа пограничных клеток. С крупными морскими провинциями в
 * открытом море (Task 5 этапа 1.5) морских границ меньше: число бугорков почти то же, а знаменатель
 * меньше на ~9% (medium "Бета-7" fantasy: 1427 бугорков на 235 тыс. клеток против 1434 на 257 тыс.),
 * отсюда 0.0065 вместо 0.006. На small крупные морские провинции дают и пару прямых участков воды
 * длиннее 12 клеток (small "1": 328 клеток против 285), отсюда straight 0.006.
 */
const QUALITY: Record<WorldSize, { minPurity: number; pure90: number; bumps: number; straight: number }> = {
  small: { minPurity: 0.75, pure90: 0.8, bumps: 0.01, straight: 0.006 },
  medium: { minPurity: 0.8, pure90: 0.9, bumps: 0.0065, straight: 0.005 },
  large: { minPurity: 0.8, pure90: 0.9, bumps: 0.0065, straight: 0.005 },
};

// Размер карты текущего набора: блоки describe выполняются по очереди, beforeAll ставит размер.
let W = 0;
let H = 0;

interface Fixture {
  defs: BiomeDef[];
  height: Float32Array;
  biomes: Uint8Array;
  riverMask: Uint8Array;
  provinceOf: Uint16Array;
  provinces: Province[];
  /** 1 = land (height > SEA_LEVEL). */
  land: Uint8Array;
}

/** Land mask: the one predicate used everywhere, height > SEA_LEVEL (after normalizeShoreline). */
function landOf(height: Float32Array): Uint8Array {
  const land = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) land[i] = height[i]! > SEA_LEVEL ? 1 : 0;
  return land;
}

function build(seed: string, options: GenOptions, size: WorldSize): Fixture {
  ({ w: W, h: H } = SIZE_PRESETS[size]);
  const defs = resolveBiomes(options);
  const rng = createRng(seed);
  const height0 = generateHeight(rng.fork('height'), W, H);
  const { temperature, moisture } = computeClimate(rng.fork('climate'), height0, W, H);
  const arcana = computeArcana(seed, W, H);
  const raw = computeBiomes(defs, height0, temperature, moisture, arcana);
  const { height, biomes } = normalizeShoreline(height0, raw, W, H, defs);
  const { riverMask } = computeRivers(height, moisture, W, H);
  const { provinceOf, provinces } = computeProvinces(rng.fork('provinces'), height, biomes, riverMask, W, H, defs);
  return { defs, height, biomes, riverMask, provinceOf, provinces, land: landOf(height) };
}

/** Real 4-adjacency between provinces, as sorted id lists. */
function realNeighbors(f: Fixture): number[][] {
  const sets = f.provinces.map(() => new Set<number>());
  const { provinceOf } = f;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = provinceOf[i]!;
      if (x < W - 1) {
        const q = provinceOf[i + 1]!;
        if (q !== p) {
          sets[p]!.add(q);
          sets[q]!.add(p);
        }
      }
      if (y < H - 1) {
        const q = provinceOf[i + W]!;
        if (q !== p) {
          sets[p]!.add(q);
          sets[q]!.add(p);
        }
      }
    }
  }
  return sets.map((s) => [...s].sort((a, b) => a - b));
}

describe.each([
  ['1', {}, 'medium'],
  ['Бета-7', {}, 'medium'],
  ['tiny-islands', {}, 'medium'],
  ['lakes-check', {}, 'medium'],
  ['Бета-7', { fantasy: true }, 'medium'],
  ['1', {}, 'small'],
  ['Бета-7', { fantasy: true }, 'small'],
] as Array<[string, GenOptions, WorldSize]>)('provinces (seed %j, options %j, size %s)', (seed, options, size) => {
  let f: Fixture;
  beforeAll(() => {
    f = build(seed, options, size);
  }, 60000);

  it('has sane land and sea province counts (proportional to land/sea area), ids equal indices', () => {
    const land = f.provinces.filter((p) => p.isLand).length;
    const sea = f.provinces.length - land;
    // medium: 2000–4000 land, 150–560 sea; other sizes in proportion to their land and sea area.
    const b = provinceBounds(f.height, W, H);
    expect(land).toBeGreaterThanOrEqual(b.land[0]);
    expect(land).toBeLessThanOrEqual(b.land[1]);
    expect(sea).toBeGreaterThanOrEqual(b.sea[0]);
    expect(sea).toBeLessThanOrEqual(b.sea[1]);
    expect(f.provinces.length).toBeLessThanOrEqual(65535);
    f.provinces.forEach((p, i) => expect(p.id).toBe(i));
  });

  it('assigns every cell; cellCount matches; land and water never mix', () => {
    const counts = new Int32Array(f.provinces.length);
    let bad = 0;
    for (let i = 0; i < W * H; i++) {
      const p = f.provinceOf[i]!;
      if (p >= f.provinces.length) throw new Error(`cell ${i} has invalid province ${p}`);
      counts[p] = counts[p]! + 1;
      if ((f.land[i] === 1) !== f.provinces[p]!.isLand) bad++;
    }
    expect(bad).toBe(0);
    f.provinces.forEach((p, i) => expect(p.cellCount).toBe(counts[i]));
  });

  it('every province is 4-connected', () => {
    const { provinceOf } = f;
    const seen = new Uint8Array(W * H);
    const comps = new Int32Array(f.provinces.length);
    const stack: number[] = [];
    for (let s = 0; s < W * H; s++) {
      if (seen[s]) continue;
      const p = provinceOf[s]!;
      comps[p] = comps[p]! + 1;
      seen[s] = 1;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop()!;
        const x = c % W;
        const y = (c - x) / W;
        if (x > 0 && !seen[c - 1] && provinceOf[c - 1] === p) {
          seen[c - 1] = 1;
          stack.push(c - 1);
        }
        if (x < W - 1 && !seen[c + 1] && provinceOf[c + 1] === p) {
          seen[c + 1] = 1;
          stack.push(c + 1);
        }
        if (y > 0 && !seen[c - W] && provinceOf[c - W] === p) {
          seen[c - W] = 1;
          stack.push(c - W);
        }
        if (y < H - 1 && !seen[c + W] && provinceOf[c + W] === p) {
          seen[c + W] = 1;
          stack.push(c + W);
        }
      }
    }
    const broken = [...comps].filter((c) => c !== 1).length;
    expect(broken).toBe(0);
  });

  it('land provinces have >= 40 cells unless they are islands without land neighbours', () => {
    const small = f.provinces.filter(
      (p) => p.isLand && p.cellCount < 40 && p.neighbors.some((q) => f.provinces[q]!.isLand),
    );
    expect(small.map((p) => p.id)).toEqual([]);
  });

  it('neighbors are symmetric and match real cell adjacency', () => {
    const real = realNeighbors(f);
    let mismatched = 0;
    f.provinces.forEach((p, i) => {
      const got = [...p.neighbors].sort((a, b) => a - b);
      if (JSON.stringify(got) !== JSON.stringify(real[i])) mismatched++;
      for (const q of p.neighbors) expect(f.provinces[q]!.neighbors).toContain(i);
    });
    expect(mismatched).toBe(0);
  });

  it('coastal / lakeside: land provinces bordering a sea / a lake province', () => {
    for (const p of f.provinces) {
      expect(p.coastal).toBe(p.isLand && p.neighbors.some((q) => f.provinces[q]!.water === 'sea'));
      expect(p.lakeside).toBe(p.isLand && p.neighbors.some((q) => f.provinces[q]!.water === 'lake'));
    }
  });

  it('biome is the most frequent biome of the province cells', () => {
    const k = f.defs.length;
    const counts = new Int32Array(f.provinces.length * k);
    for (let i = 0; i < W * H; i++) {
      const j = f.provinceOf[i]! * k + f.biomes[i]!;
      counts[j] = counts[j]! + 1;
    }
    let wrong = 0;
    f.provinces.forEach((p, i) => {
      let max = 0;
      for (let b = 0; b < k; b++) max = Math.max(max, counts[i * k + b]!);
      if (counts[i * k + f.defs.findIndex((d) => d.id === p.biome)]! !== max) wrong++;
    });
    expect(wrong).toBe(0);
  });

  it('center lies inside the province', () => {
    for (const p of f.provinces) {
      expect(f.provinceOf[Math.floor(p.center.y) * W + Math.floor(p.center.x)]).toBe(p.id);
    }
  });

  it('major rivers separate provinces', () => {
    expect(riverViolations(f.height, f.riverMask, f.provinceOf, f.provinces, W)).toEqual([]);
  });

  it('land provinces are terrain-pure', () => {
    const pur = purity(f.biomes, f.provinceOf, f.provinces.length);
    const land = f.provinces.filter((p) => p.isLand);
    // Lone islands (no land neighbour) cannot merge anywhere: exempt unless they could be split
    // into two connected single-biome parts of at least 40 cells each (then they must be split).
    const lone = (p: Province): boolean =>
      !p.neighbors.some((q) => f.provinces[q]!.isLand) && !splittableIsland(f.biomes, f.provinceOf, p, W);
    const q = QUALITY[size];
    const impure = land
      .filter((p) => p.cellCount >= 40 && !lone(p) && pur[p.id]! < q.minPurity)
      .map((p) => [p.id, pur[p.id]]);
    expect(impure).toEqual([]);
    const pure90 = land.filter((p) => pur[p.id]! >= 0.9).length / land.length;
    expect(pure90).toBeGreaterThanOrEqual(q.pure90);
  });

  it('mountain massifs belong to mountain or hill provinces', () => {
    expect(strayMountainCells(f.biomes, f.provinceOf, f.provinces, W, f.defs)).toBe(0);
  });

  it('borders have few long straight runs', () => {
    const r = longestStraightBorder(f.height, f.riverMask, f.provinceOf, W, H);
    const b = bumpShare(f.height, f.riverMask, f.provinceOf, W, H);
    // Cells in axis or 45-degree runs longer than 12: at most 0.5% of border cells (small 0.6%);
    // none over 30.
    expect(r.longCells / b.border).toBeLessThanOrEqual(QUALITY[size].straight);
    expect(r.axis).toBeLessThanOrEqual(30);
    expect(r.diagonal).toBeLessThanOrEqual(30);
  });

  it('borders are smooth at the cell scale (few 1-cell bumps or notches)', () => {
    const r = bumpShare(f.height, f.riverMask, f.provinceOf, W, H);
    expect(r.share).toBeLessThanOrEqual(QUALITY[size].bumps);
  });

  it.runIf(seed === '1' && size === 'medium')('fewer sea provinces: 150–300 on medium seed "1"', () => {
    const sea = f.provinces.filter((p) => p.water === 'sea').length;
    expect(sea).toBeGreaterThanOrEqual(150);
    expect(sea).toBeLessThanOrEqual(300);
  });

  it.runIf(size === 'medium')('coastal sea stays fine: sea provinces at land are at most 0.6 of open-sea area', () => {
    const sea = f.provinces.filter((p) => p.water === 'sea');
    const mean = (ps: Province[]): number => ps.reduce((s, p) => s + p.cellCount, 0) / ps.length;
    const coast = sea.filter((p) => p.neighbors.some((q) => f.provinces[q]!.isLand));
    const open = sea.filter((p) => !p.neighbors.some((q) => f.provinces[q]!.isLand));
    expect(coast.length).toBeGreaterThan(0);
    expect(open.length).toBeGreaterThan(0);
    expect(mean(coast)).toBeLessThanOrEqual(0.6 * mean(open));
  });

  it.runIf(seed === '1' && size === 'medium')('is deterministic', { timeout: 30000 }, () => {
    const rng = createRng(seed);
    const again = computeProvinces(rng.fork('provinces'), f.height, f.biomes, f.riverMask, W, H, f.defs);
    expect(Buffer.from(again.provinceOf.buffer).equals(Buffer.from(f.provinceOf.buffer))).toBe(true);
    expect(again.provinces).toEqual(f.provinces);
  });
});

/**
 * Review Focus этапа 1: 20 сидов, включая пустой и "Бета-7" (почти вся вода / почти вся суша).
 * Размер small, чтобы прогон оставался быстрым: переменный радиус моря зависит от расстояния до
 * суши в клетках, и на small крошечные моря встречаются чаще.
 */
describe('sea provinces over 20 seeds (small)', () => {
  const SEEDS = [...Array.from({ length: 17 }, (_, i) => String(i + 1)), '', 'Бета-7', 'worldbox'];
  it.each(SEEDS)('seed %j: every sea gets a province, ids < 65535', { timeout: 60000 }, (seed) => {
    const f = build(seed, {}, 'small');
    const lake = findLakes(f.height, W, H);
    let seaCells = 0;
    for (let i = 0; i < W * H; i++) if (!f.land[i] && !lake[i]) seaCells++;
    const sea = f.provinces.filter((p) => p.water === 'sea').length;
    if (seaCells > 0) expect(sea).toBeGreaterThan(0);
    expect(f.provinces.length).toBeLessThan(65535);
    f.provinces.forEach((p, i) => expect(p.id).toBe(i));
    for (let i = 0; i < W * H; i++) {
      if (!f.land[i] && !lake[i] && f.provinces[f.provinceOf[i]!]!.water !== 'sea') throw new Error(`sea cell ${i}`);
    }
  });
});
