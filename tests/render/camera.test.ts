import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clampCamera,
  minZoom,
  screenToWorld,
  zoomAt,
  type Camera,
} from '../../src/render/camera';
import { WORLD_H, WORLD_W } from '../../src/sim/world/types';

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
    const z = minZoom(VW, VH);
    expect(z).toBeCloseTo(Math.min(VW / WORLD_W, VH / WORLD_H), 12);
    expect(VW / z).toBeGreaterThanOrEqual(WORLD_W - 1e-9);
    expect(VH / z).toBeGreaterThanOrEqual(WORLD_H - 1e-9);
  });

  it('MAX_ZOOM равен 16', () => {
    expect(MAX_ZOOM).toBe(16);
  });
});

describe('zoomAt', () => {
  it('×2 под точкой (100,100): мировая точка под курсором не меняется', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 2 };
    const before = screenToWorld(cam, 100, 100, VW, VH);
    const next = zoomAt(cam, 100, 100, 2, VW, VH);
    expect(next.zoom).toBeCloseTo(4, 12);
    const after = screenToWorld(next, 100, 100, VW, VH);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it('зум наружу не опускается ниже minZoom', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    const next = zoomAt(cam, 100, 100, 0.0001, VW, VH);
    expect(next.zoom).toBeCloseTo(minZoom(VW, VH), 12);
  });

  it('зум внутрь не поднимается выше MAX_ZOOM', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 10 };
    const next = zoomAt(cam, 100, 100, 100, VW, VH);
    expect(next.zoom).toBe(MAX_ZOOM);
  });
});

describe('clampCamera', () => {
  it('zoom не меньше минимального и не больше 16', () => {
    const low = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.00001 }, VW, VH);
    const high = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1000 }, VW, VH);
    expect(low.zoom).toBeCloseTo(minZoom(VW, VH), 12);
    expect(high.zoom).toBe(MAX_ZOOM);
  });

  it('увод центра на (−5000, −5000) оставляет половину экрана на карте', () => {
    const cam = clampCamera({ x: -5000, y: -5000, zoom: 2 }, VW, VH);
    const spanX = VW / cam.zoom;
    const spanY = VH / cam.zoom;
    // Доля видимой области экрана, которая лежит над картой, по каждой оси.
    const visX = Math.max(0, Math.min(cam.x + spanX / 2, WORLD_W) - Math.max(cam.x - spanX / 2, 0));
    const visY = Math.max(0, Math.min(cam.y + spanY / 2, WORLD_H) - Math.max(cam.y - spanY / 2, 0));
    expect(visX / spanX).toBeGreaterThanOrEqual(0.5);
    expect(visY / spanY).toBeGreaterThanOrEqual(0.5);
  });

  it('если экран шире карты по оси, центр по этой оси фиксируется на центре карты', () => {
    const z = minZoom(VW, VH);
    const cam = clampCamera({ x: 0, y: 0, zoom: z }, VW, VH);
    expect(cam.x).toBeCloseTo(WORLD_W / 2, 9);
    expect(cam.y).toBeCloseTo(WORLD_H / 2, 9);
  });

  it('камера внутри допустимой области не меняется', () => {
    const cam: Camera = { x: 1000, y: 500, zoom: 4 };
    expect(clampCamera(cam, VW, VH)).toEqual(cam);
  });
});
