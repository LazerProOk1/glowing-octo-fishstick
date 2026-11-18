import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clampCamera,
  minZoom,
  screenToWorld,
  zoomAt,
  type Camera,
} from '../../src/render/camera';
import { SIZE_PRESETS } from '../../src/sim/world/params';

const MAP = SIZE_PRESETS.medium;
const WORLD_W = MAP.w;
const WORLD_H = MAP.h;
const VW = 1280;
const VH = 720;

describe('screenToWorld', () => {
  it('центр экрана соответствует центру камеры', () => {
    const cam: Camera = { x: 300, y: 200, zoom: 4 };
    const p = screenToWorld(cam, VW / 2, VH / 2, VW, VH);
    expect(p.x).toBeCloseTo(300, 9);
    expect(p.y).toBeCloseTo(200, 9);
  });

  it('смещение на экран переводится в клетки делением на zoom', () => {
    const cam: Camera = { x: 0, y: 0, zoom: 2 };
    const p = screenToWorld(cam, VW / 2 + 10, VH / 2 - 20, VW, VH);
    expect(p.x).toBeCloseTo(5, 9);
    expect(p.y).toBeCloseTo(-10, 9);
  });
});

describe('minZoom', () => {
  it('вся карта влезает в экран', () => {
    const z = minZoom(VW, VH, MAP);
    expect(z).toBeCloseTo(Math.min(VW / WORLD_W, VH / WORLD_H), 12);
    expect(VW / z).toBeGreaterThanOrEqual(WORLD_W - 1e-9);
    expect(VH / z).toBeGreaterThanOrEqual(WORLD_H - 1e-9);
  });

  it('MAX_ZOOM равен 16', () => {
    expect(MAX_ZOOM).toBe(16);
  });
});

describe('размер карты', () => {
  it('minZoom и ограничение берут размер карты из аргумента', () => {
    const small = SIZE_PRESETS.small;
    expect(minZoom(VW, VH, small)).toBeCloseTo(Math.min(VW / small.w, VH / small.h), 12);
    // Экран шириной 4·small.w: при минимальном зуме span по X ≥ 2·small.w — центр фиксируется.
    const cam = clampCamera({ x: 0, y: 0, zoom: 1 }, 4 * small.w, VH, small);
    expect(cam.x).toBe(small.w / 2);
  });
});

describe('zoomAt', () => {
  it('×2 под точкой (100,100): мировая точка под курсором не меняется', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 2 };
    const before = screenToWorld(cam, 100, 100, VW, VH);
    const next = zoomAt(cam, 100, 100, 2, VW, VH, MAP);
    expect(next.zoom).toBeCloseTo(4, 12);
    const after = screenToWorld(next, 100, 100, VW, VH);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it('курсор у края карты: результат ограничен и конечен', () => {
    // Курсор в углу (0,0), зум ×2: без ограничения центр ушёл бы за край карты.
    const next = zoomAt({ x: 100, y: 100, zoom: 1 }, 0, 0, 2, VW, VH, MAP);
    expect(Number.isFinite(next.x)).toBe(true);
    expect(Number.isFinite(next.y)).toBe(true);
    expect(next.zoom).toBe(2);
    expect(next.x).toBe(160); // span по X = 640, отступ = 160
    expect(next.y).toBe(90); // span по Y = 360, отступ = 90
  });

  it('зум наружу не опускается ниже minZoom', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    const next = zoomAt(cam, 100, 100, 0.0001, VW, VH, MAP);
    expect(next.zoom).toBeCloseTo(minZoom(VW, VH, MAP), 12);
  });

  it('зум внутрь не поднимается выше MAX_ZOOM', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 10 };
    const next = zoomAt(cam, 100, 100, 100, VW, VH, MAP);
    expect(next.zoom).toBe(MAX_ZOOM);
  });
});

describe('clampCamera', () => {
  it('zoom не меньше минимального и не больше 16', () => {
    const low = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.00001 }, VW, VH, MAP);
    const high = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1000 }, VW, VH, MAP);
    expect(low.zoom).toBeCloseTo(minZoom(VW, VH, MAP), 12);
    expect(high.zoom).toBe(MAX_ZOOM);
  });

  it('увод центра на (−5000, −5000) оставляет половину экрана на карте', () => {
    const cam = clampCamera({ x: -5000, y: -5000, zoom: 2 }, VW, VH, MAP);
    const spanX = VW / cam.zoom;
    const spanY = VH / cam.zoom;
    // Доля видимой области экрана, которая лежит над картой, по каждой оси.
    const visX = Math.max(0, Math.min(cam.x + spanX / 2, WORLD_W) - Math.max(cam.x - spanX / 2, 0));
    const visY = Math.max(0, Math.min(cam.y + spanY / 2, WORLD_H) - Math.max(cam.y - spanY / 2, 0));
    expect(visX / spanX).toBeGreaterThanOrEqual(0.5);
    expect(visY / spanY).toBeGreaterThanOrEqual(0.5);
  });

  it('при span ≥ 2·размер карты центр по этой оси фиксируется на центре карты', () => {
    // Вьюпорт 4096 клеток по X при zoom 1: span по X = 2·WORLD_W.
    const cam = clampCamera({ x: 0, y: 0, zoom: 1 }, 2 * WORLD_W, VH, MAP);
    expect(cam.x).toBe(WORLD_W / 2);
    // По Y span = VH/1 = 720 < 2·WORLD_H, так что Y не фиксируется.
    expect(cam.y).toBe(VH / 4);
  });

  it('непрерывность при span около размера карты: центры отличаются меньше чем на 1 клетку', () => {
    const off = 100;
    const lo = clampCamera({ x: off, y: 0, zoom: 1 }, WORLD_W - 0.001, VH, MAP);
    const hi = clampCamera({ x: off, y: 0, zoom: 1 }, WORLD_W + 0.001, VH, MAP);
    expect(Math.abs(lo.x - hi.x)).toBeLessThan(1);
  });

  it('непрерывность при span около 2·размер карты: центры отличаются меньше чем на 1 клетку', () => {
    const off = 0;
    const lo = clampCamera({ x: off, y: 0, zoom: 1 }, 2 * WORLD_W - 0.001, VH, MAP);
    const hi = clampCamera({ x: off, y: 0, zoom: 1 }, 2 * WORLD_W + 0.001, VH, MAP);
    expect(Math.abs(lo.x - hi.x)).toBeLessThan(1);
    expect(hi.x).toBe(WORLD_W / 2);
  });

  it('при zoom около minZoom по Y можно панорамировать (не фиксируется на центре)', () => {
    const z = minZoom(VW, VH, MAP);
    const cam = clampCamera({ x: WORLD_W / 2, y: 0, zoom: z }, VW, VH, MAP);
    expect(cam.y).toBeLessThan(WORLD_H / 2);
    expect(cam.y).toBeGreaterThan(0);
  });

  it('вьюпорт 0×0 (свёрнутое окно): все поля конечны', () => {
    const z = minZoom(0, 0, MAP);
    expect(Number.isFinite(z)).toBe(true);
    const cam = clampCamera({ x: 5000, y: -5000, zoom: 3 }, 0, 0, MAP);
    expect(Number.isFinite(cam.x)).toBe(true);
    expect(Number.isFinite(cam.y)).toBe(true);
    expect(Number.isFinite(cam.zoom)).toBe(true);
    const zoomed = zoomAt({ x: 100, y: 100, zoom: 2 }, 0, 0, 2, 0, 0, MAP);
    expect(Number.isFinite(zoomed.x)).toBe(true);
    expect(Number.isFinite(zoomed.y)).toBe(true);
    expect(Number.isFinite(zoomed.zoom)).toBe(true);
  });

  it('камера внутри допустимой области не меняется', () => {
    const cam: Camera = { x: 1000, y: 500, zoom: 4 };
    expect(clampCamera(cam, VW, VH, MAP)).toEqual(cam);
  });
});
