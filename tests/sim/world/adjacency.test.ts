import { beforeAll, describe, expect, it } from 'vitest';
import { computeAdjacency, STRAIT_MAX_WATER } from '../../../src/sim/world/adjacency';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';
import { MAJOR_RIVER } from './provinceMetrics';

const key = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`;

/** Число пограничных пар клеток по ключу пары провинций. */
function borderPairs(world: World): { length: Map<string, number> } {
  const { w, h, provinceOf } = world;
  const length = new Map<string, number>();
  const visit = (i: number, j: number): void => {
    const p = provinceOf[i]!;
    const q = provinceOf[j]!;
    if (p === q) return;
    const k = key(p, q);
    length.set(k, (length.get(k) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1) visit(i, i + 1);
      if (y < h - 1) visit(i, i + w);
    }
  }
  return { length };
}

/** Пары границы, где обе клетки — суша без крупной реки, по ключу пары провинций. */
function freePairs(world: World): Map<string, number> {
  const { w, h, height, riverMask, provinceOf } = world;
  const free = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! < MAJOR_RIVER;
  const out = new Map<string, number>();
  const visit = (i: number, j: number): void => {
    const a = provinceOf[i]!;
    const b = provinceOf[j]!;
    if (a !== b && free(i) && free(j)) out.set(key(a, b), (out.get(key(a, b)) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < w - 1) visit(y * w + x, y * w + x + 1);
      if (y < h - 1) visit(y * w + x, (y + 1) * w + x);
    }
  }
  return out;
}

/**
 * Переправы через крупные реки по ключу пары провинций: лучи вправо и вниз из свободной клетки
 * суши через 1..8 клеток крупной реки (суша, riverMask ≥ 2) до свободной клетки суши другой провинции.
 */
function crossings(world: Pick<World, 'w' | 'h' | 'height' | 'riverMask' | 'provinceOf'>): Map<string, number> {
  const { w, h, height, riverMask, provinceOf } = world;
  const major = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! >= MAJOR_RIVER;
  const free = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! < MAJOR_RIVER;
  const out = new Map<string, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!free(i)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        let cx = x + dx;
        let cy = y + dy;
        let n = 0;
        while (cx < w && cy < h && major(cy * w + cx) && n <= 8) {
          n++;
          cx += dx;
          cy += dy;
        }
        if (n === 0 || n > 8 || cx >= w || cy >= h || !free(cy * w + cx)) continue;
        const a = provinceOf[i]!;
        const b = provinceOf[cy * w + cx]!;
        if (a !== b) out.set(key(a, b), (out.get(key(a, b)) ?? 0) + 1);
      }
    }
  }
  return out;
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

  it('river ⇔ граница пересекает крупную реку (геометрическая проверка лучами)', () => {
    // Независимо от реализации: луч по оси из свободной клетки суши A через 1..8 клеток крупной
    // реки в свободную клетку суши B — переправа A→B. У рёбер-рек переправы есть; ребро, у
    // которого переправ не меньше половины длины границы, — река, если только провинции не
    // соприкасаются в основном по суше (больше половины пар границы — «суша без реки | суша без
    // реки»): тогда река разделяет их где-то в стороне, а граница идёт не по ней.
    const cross = crossings(world);
    const landPairs = freePairs(world);
    const landEdges = world.adjacency.filter(
      (e) => e.length > 0 && world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand,
    );
    // Исключение — угловой стык: граница из 2 пар, одна «река | берег», другая сухая. Диагональная
    // река проходит через угол стыка, и луч по оси её не пересекает, хотя по правилу
    // 2·riverLength ≥ length ребро — река. На сиде "1" таких 2 (после смещения климата биомов в
    // задаче 6 провинции сдвинулись); их не больше 3, чтобы исключение не прятало регрессию.
    const corner = (e: (typeof landEdges)[number]): boolean => e.length === 2 && e.riverLength === 1;
    const riverNoCrossing = landEdges.filter((e) => e.river && !cross.get(key(e.a, e.b)));
    expect(riverNoCrossing.filter((e) => !corner(e)).map((e) => [e.a, e.b, e.length])).toEqual([]);
    expect(riverNoCrossing.filter(corner).length).toBeLessThanOrEqual(3);
    const missed = landEdges.filter(
      (e) =>
        !e.river &&
        2 * (cross.get(key(e.a, e.b)) ?? 0) >= e.length &&
        2 * (landPairs.get(key(e.a, e.b)) ?? 0) <= e.length,
    );
    expect(missed.map((e) => [e.a, e.b, e.length, cross.get(key(e.a, e.b))])).toEqual([]);
    expect(landEdges.filter((e) => e.river).length).toBeGreaterThan(50);
  });

  it('riverLength — пары «река | не река» у рёбер суша–суша, 0 у остальных; river = 2·riverLength ≥ length', () => {
    for (const e of world.adjacency) {
      const land = world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand;
      if (!land || e.length === 0) expect(e.riverLength).toBe(0);
      expect(e.riverLength).toBeLessThanOrEqual(e.length);
      expect(e.river).toBe(e.riverLength > 0 && 2 * e.riverLength >= e.length);
    }
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
    expect(e).toEqual({ a: 1, b: 2, length: 0, riverLength: 0, river: false, strait: true });
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
    expect(list.find((x) => x.a === 0 && x.b === 1)).toEqual({ a: 0, b: 1, length: 16, riverLength: 0, river: false, strait: false });
  });
});

/**
 * Синтетическая карта 20×12, вся суша: вертикальная крупная река шириной 2 (x = 9, 10).
 * Левый берег — провинции 0 (y < 6) и 1 (y ≥ 6); клетки реки отданы левому берегу, как в
 * assignCorridor; правый берег (x ≥ 11) — провинция 2.
 */
describe('реки на синтетической карте', () => {
  const w = 20;
  const h = 12;
  const provinceOf = new Uint16Array(w * h);
  const height = new Float32Array(w * h).fill(0.6);
  const riverMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      provinceOf[i] = x >= 11 ? 2 : y < 6 ? 0 : 1;
      if (x === 9 || x === 10) riverMask[i] = 2;
    }
  }
  const provinces = [{ isLand: true }, { isLand: true }, { isLand: true }];
  const { adjacency } = computeAdjacency(provinceOf, provinces, height, riverMask, w, h);
  const edge = (a: number, b: number): (typeof adjacency)[number] | undefined =>
    adjacency.find((e) => e.a === a && e.b === b);

  it('провинции по разные берега реки ширины 2 — river, riverLength = длине границы', () => {
    expect(edge(0, 2)).toEqual({ a: 0, b: 2, length: 6, riverLength: 6, river: true, strait: false });
    expect(edge(1, 2)).toEqual({ a: 1, b: 2, length: 6, riverLength: 6, river: true, strait: false });
  });

  it('провинции одного берега у реки — не river, riverLength = 0', () => {
    expect(edge(0, 1)).toEqual({ a: 0, b: 1, length: 11, riverLength: 0, river: false, strait: false });
  });

  it('лучевая проверка видит переправы ровно у рёбер через реку', () => {
    const cross = crossings({ w, h, height, riverMask, provinceOf });
    expect([...cross.keys()].sort()).toEqual(['0:2', '1:2']);
  });

  it('узкий ручей (riverMask 1) рекой не считается', () => {
    const thin = riverMask.map((v) => (v > 0 ? 1 : 0));
    const e = computeAdjacency(provinceOf, provinces, height, thin, w, h).adjacency.find((x) => x.a === 0 && x.b === 2);
    expect(e).toEqual({ a: 0, b: 2, length: 6, riverLength: 0, river: false, strait: false });
  });
});
