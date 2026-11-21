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
  it('the screen centre matches the camera centre', () => {
    const cam: Camera = { x: 300, y: 200, zoom: 4 };
    const p = screenToWorld(cam, VW / 2, VH / 2, VW, VH);
    expect(p.x).toBeCloseTo(300, 9);
    expect(p.y).toBeCloseTo(200, 9);
  });

  it('a screen offset converts to cells by dividing by zoom', () => {
    const cam: Camera = { x: 0, y: 0, zoom: 2 };
    const p = screenToWorld(cam, VW / 2 + 10, VH / 2 - 20, VW, VH);
    expect(p.x).toBeCloseTo(5, 9);
    expect(p.y).toBeCloseTo(-10, 9);
  });
});

describe('minZoom', () => {
  it('the whole map fits the screen', () => {
    const z = minZoom(VW, VH, MAP);
    expect(z).toBeCloseTo(Math.min(VW / WORLD_W, VH / WORLD_H), 12);
    expect(VW / z).toBeGreaterThanOrEqual(WORLD_W - 1e-9);
    expect(VH / z).toBeGreaterThanOrEqual(WORLD_H - 1e-9);
  });

  it('MAX_ZOOM is 16', () => {
    expect(MAX_ZOOM).toBe(16);
  });
});

describe('map size', () => {
  it('minZoom and the clamp take the map size from the argument', () => {
    const small = SIZE_PRESETS.small;
    expect(minZoom(VW, VH, small)).toBeCloseTo(Math.min(VW / small.w, VH / small.h), 12);
    // A screen 4·small.w wide: at minimum zoom the X span is ≥ small.w — the centre is pinned.
    const cam = clampCamera({ x: 0, y: 0, zoom: 1 }, 4 * small.w, VH, small);
    expect(cam.x).toBe(small.w / 2);
  });
});

describe('zoomAt', () => {
  it('×2 under the point (100,100): the world point under the cursor does not change', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 2 };
    const before = screenToWorld(cam, 100, 100, VW, VH);
    const next = zoomAt(cam, 100, 100, 2, VW, VH, MAP);
    expect(next.zoom).toBeCloseTo(4, 12);
    const after = screenToWorld(next, 100, 100, VW, VH);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it('cursor at the map edge: the result is clamped and finite', () => {
    // Cursor in the corner (0,0), zoom ×2: without clamping the centre would go past the map edge.
    const next = zoomAt({ x: 100, y: 100, zoom: 1 }, 0, 0, 2, VW, VH, MAP);
    expect(Number.isFinite(next.x)).toBe(true);
    expect(Number.isFinite(next.y)).toBe(true);
    expect(next.zoom).toBe(2);
    expect(next.x).toBe(320); // X span = 640, margin = 320
    expect(next.y).toBe(180); // Y span = 360, margin = 180
  });

  it('zooming out does not go below minZoom', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    const next = zoomAt(cam, 100, 100, 0.0001, VW, VH, MAP);
    expect(next.zoom).toBeCloseTo(minZoom(VW, VH, MAP), 12);
  });

  it('zooming in does not go above MAX_ZOOM', () => {
    const cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 10 };
    const next = zoomAt(cam, 100, 100, 100, VW, VH, MAP);
    expect(next.zoom).toBe(MAX_ZOOM);
  });
});

describe('clampCamera', () => {
  it('zoom is at least the minimum and at most 16', () => {
    const low = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.00001 }, VW, VH, MAP);
    const high = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1000 }, VW, VH, MAP);
    expect(low.zoom).toBeCloseTo(minZoom(VW, VH, MAP), 12);
    expect(high.zoom).toBe(MAX_ZOOM);
  });

  it('moving the centre to (−5000, −5000) keeps the whole screen on the map', () => {
    const cam = clampCamera({ x: -5000, y: -5000, zoom: 2 }, VW, VH, MAP);
    const spanX = VW / cam.zoom;
    const spanY = VH / cam.zoom;
    // Share of the visible screen area that lies over the map, per axis.
    const visX = Math.max(0, Math.min(cam.x + spanX / 2, WORLD_W) - Math.max(cam.x - spanX / 2, 0));
    const visY = Math.max(0, Math.min(cam.y + spanY / 2, WORLD_H) - Math.max(cam.y - spanY / 2, 0));
    expect(visX / spanX).toBeCloseTo(1, 9);
    expect(visY / spanY).toBeCloseTo(1, 9);
  });

  it('with span ≥ map size the centre on that axis is pinned to the map centre', () => {
    // A viewport WORLD_W cells wide along X at zoom 1: the X span is WORLD_W.
    const cam = clampCamera({ x: 0, y: 0, zoom: 1 }, WORLD_W, VH, MAP);
    expect(cam.x).toBe(WORLD_W / 2);
    // Along Y the span is VH/1 = 720 < WORLD_H, so Y is not pinned.
    expect(cam.y).toBe(VH / 2);
  });

  it('continuity with span near the map size: the centres differ by less than 1 cell', () => {
    const lo = clampCamera({ x: 0, y: 0, zoom: 1 }, WORLD_W - 0.001, VH, MAP);
    const hi = clampCamera({ x: 0, y: 0, zoom: 1 }, WORLD_W + 0.001, VH, MAP);
    expect(Math.abs(lo.x - hi.x)).toBeLessThan(1);
    expect(hi.x).toBe(WORLD_W / 2);
  });

  it('at minZoom the map is centred, at 2·minZoom it can be panned along Y', () => {
    const z = minZoom(VW, VH, MAP);
    expect(clampCamera({ x: 0, y: 0, zoom: z }, VW, VH, MAP).y).toBe(WORLD_H / 2);
    const panned = clampCamera({ x: 0, y: 0, zoom: 2 * z }, VW, VH, MAP);
    expect(panned.y).toBe(VH / (2 * z) / 2);
  });

  it('0×0 viewport (collapsed window): all fields are finite', () => {
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

  it('a camera inside the allowed area does not change', () => {
    const cam: Camera = { x: 1000, y: 500, zoom: 4 };
    expect(clampCamera(cam, VW, VH, MAP)).toEqual(cam);
  });
});
