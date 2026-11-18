import { beforeAll, describe, expect, it } from 'vitest';
import { computeAdjacency, STRAIT_MAX_WATER } from '../../../src/sim/world/adjacency';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams } from '../../../src/sim/world/params';
import { SEA_LEVEL, type World } from '../../../src/sim/world/types';
import { components, ENCLAVE_CELLS, MAJOR_RIVER } from './provinceMetrics';

const key = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`;

/** Пограничные пары клеток и пары «через крупную реку» (одна из клеток — суша с рекой ≥ 2), по ключу пары провинций. */
function borderPairs(world: World): { length: Map<string, number>; river: Map<string, number> } {
  const { w, h, provinceOf, height, riverMask } = world;
  const length = new Map<string, number>();
  const river = new Map<string, number>();
  const major = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! >= MAJOR_RIVER;
  const visit = (i: number, j: number): void => {
    const p = provinceOf[i]!;
    const q = provinceOf[j]!;
    if (p === q) return;
    const k = key(p, q);
    length.set(k, (length.get(k) ?? 0) + 1);
    if (major(i) || major(j)) river.set(k, (river.get(k) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1) visit(i, i + 1);
      if (y < h - 1) visit(i, i + w);
    }
  }
  return { length, river };
}

describe('рёбра соседства (сид "1")', () => {
  let world: World;
  let pairs: ReturnType<typeof borderPairs>;
  beforeAll(() => {
    world = generateWorld(defaultParams('1'));
    pairs = borderPairs(world);
  }, 60000);

  it('a < b, без повторов; edgesOf — индексы рёбер провинции', () => {
    const seen = new Set<string>();
    world.adjacency.forEach((e, i) => {
      expect(e.a).toBeLessThan(e.b);
      expect(e.b).toBeLessThan(world.provinces.length);
      const k = key(e.a, e.b);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      expect(world.edgesOf[e.a]).toContain(i);
      expect(world.edgesOf[e.b]).toContain(i);
    });
    expect(world.edgesOf.length).toBe(world.provinces.length);
    const total = world.edgesOf.reduce((s, list) => s + list.length, 0);
    expect(total).toBe(world.adjacency.length * 2);
  });

  it('length = числу граничных пар клеток; соседи из neighbors — ровно рёбра с length > 0', () => {
    const touching = world.adjacency.filter((e) => e.length > 0);
    expect(touching.length).toBe(pairs.length.size);
    for (const e of touching) expect(e.length).toBe(pairs.length.get(key(e.a, e.b)));
    const byKey = new Set(world.adjacency.map((e) => key(e.a, e.b)));
    for (const p of world.provinces) for (const q of p.neighbors) expect(byKey.has(key(p.id, q))).toBe(true);
  });

  it('river — ровно у рёбер суша–суша, где не меньше половины границы идёт по крупной реке', () => {
    let wrong = 0;
    for (const e of world.adjacency) {
      const land = world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand;
      const r = pairs.river.get(key(e.a, e.b)) ?? 0;
      const expected = land && e.length > 0 && r > 0 && 2 * r >= e.length;
      if (e.river !== expected) wrong++;
    }
    expect(wrong).toBe(0);
    expect(world.adjacency.filter((e) => e.river).length).toBeGreaterThan(0);
  });

  it('провинции по разные стороны крупной реки (разные «речные области») соединены ребром river', () => {
    // Области: 4-компоненты суши без клеток крупных рек (обрезки < ENCLAVE_CELLS не считаются).
    const { height, riverMask, provinceOf } = world;
    const free = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! < MAJOR_RIVER;
    const { comp, sizes } = components(provinceOf.length, world.w, free);
    const region = new Int32Array(world.provinces.length).fill(-1);
    for (let i = 0; i < provinceOf.length; i++) {
      const k = comp[i]!;
      if (k >= 0 && sizes[k]! >= ENCLAVE_CELLS) region[provinceOf[i]!] = k;
    }
    const missed = world.adjacency.filter((e) => {
      const ra = region[e.a]!;
      const rb = region[e.b]!;
      return e.length > 0 && ra >= 0 && rb >= 0 && ra !== rb && !e.river;
    });
    expect(missed.map((e) => [e.a, e.b])).toEqual([]);
  });

  it('проливы — только между сухопутными провинциями без общей границы', () => {
    const straits = world.adjacency.filter((e) => e.strait);
    expect(straits.length).toBeGreaterThan(0);
    for (const e of straits) {
      expect(world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand).toBe(true);
      expect(e.length).toBe(0);
      expect(e.river).toBe(false);
    }
    // Рёбра без общей границы бывают только проливами.
    expect(world.adjacency.filter((e) => e.length === 0 && !e.strait)).toEqual([]);
  });
});

/**
 * Синтетическая карта: вода (провинция 0) и два острова-квадрата 4×4 (провинции 1 и 2) на одной
 * строке, между ними `gap` клеток воды по горизонтали.
 */
function islands(gap: number, dy = 0): { provinceOf: Uint16Array; height: Float32Array; w: number; h: number } {
  const w = 30;
  const h = 14;
  const provinceOf = new Uint16Array(w * h);
  const height = new Float32Array(w * h).fill(0.3);
  const put = (x0: number, y0: number, id: number): void => {
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = x0; x < x0 + 4; x++) {
        provinceOf[y * w + x] = id;
        height[y * w + x] = 0.6;
      }
    }
  };
  put(3, 4, 1);
  put(3 + 4 + gap, 4 + dy, 2);
  return { provinceOf, height, w, h };
}

function edgesFor(gap: number, dy = 0): ReturnType<typeof computeAdjacency>['adjacency'] {
  const m = islands(gap, dy);
  const provinces = [{ isLand: false }, { isLand: true }, { isLand: true }];
  return computeAdjacency(m.provinceOf, provinces, m.height, new Uint8Array(m.w * m.h), m.w, m.h).adjacency;
}

describe('проливы на синтетической карте', () => {
  it(`ширина пролива — до ${STRAIT_MAX_WATER} клеток воды`, () => {
    expect(STRAIT_MAX_WATER).toBe(3);
  });

  it('два острова через 2 клетки воды — пролив', () => {
    const e = edgesFor(2).find((x) => x.a === 1 && x.b === 2);
    expect(e).toEqual({ a: 1, b: 2, length: 0, river: false, strait: true });
  });

  it('через 3 клетки — пролив, через 4 и 5 — нет', () => {
    expect(edgesFor(3).some((x) => x.a === 1 && x.b === 2 && x.strait)).toBe(true);
    expect(edgesFor(4).some((x) => x.a === 1 && x.b === 2)).toBe(false);
    expect(edgesFor(5).some((x) => x.a === 1 && x.b === 2)).toBe(false);
  });

  it('острова, смещённые по диагонали (угол к углу через 2 клетки по диагонали) — пролив', () => {
    // Второй остров ниже на 4 + 2 строки: ближайшие клетки берега — углы, 2 клетки воды по диагонали.
    expect(edgesFor(2, 6).some((x) => x.a === 1 && x.b === 2 && x.strait)).toBe(true);
  });

  it('рёбра острова с морем: длина — периметр острова', () => {
    const list = edgesFor(5);
    expect(list.find((x) => x.a === 0 && x.b === 1)).toEqual({ a: 0, b: 1, length: 16, river: false, strait: false });
  });
});
