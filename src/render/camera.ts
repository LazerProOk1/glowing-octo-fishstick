/** Camera centre in world cells; zoom — pixels per cell. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** Map size in cells (taken from World). */
export interface MapSize {
  w: number;
  h: number;
}

export const MAX_ZOOM = 16;

/** Viewport size of at least 1 pixel (a collapsed window gives 0 or NaN). */
function safeView(v: number): number {
  return Number.isFinite(v) ? Math.max(v, 1) : 1;
}

/** Minimum zoom: the whole map fits the screen. */
export function minZoom(viewW: number, viewH: number, map: MapSize): number {
  return Math.min(safeView(viewW) / map.w, safeView(viewH) / map.h);
}

/** Wheel notches (positive = zoom in, ±3 max). deltaMode: 0 pixels, 1 lines, 2 pages; one notch ≈ 100 px. */
export function wheelNotches(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 300 : deltaY;
  return Math.max(-3, Math.min(3, -px / 100));
}

export function screenToWorld(
  cam: Camera,
  sx: number,
  sy: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  return {
    x: cam.x + (sx - viewW / 2) / cam.zoom,
    y: cam.y + (sy - viewH / 2) / cam.zoom,
  };
}

/**
 * Clamps the centre so that on each axis no more than a quarter of the screen is empty:
 * the centre stays in [span/4, size − span/4]. The interval collapses to the map centre only when
 * span ≥ 2·size, so the transition is continuous.
 */
function clampAxis(center: number, span: number, mapSize: number): number {
  if (span >= 2 * mapSize) return mapSize / 2;
  const margin = span / 4;
  return Math.min(Math.max(center, margin), mapSize - margin);
}

export function clampCamera(cam: Camera, viewW: number, viewH: number, map: MapSize): Camera {
  const vw = safeView(viewW);
  const vh = safeView(viewH);
  const zoom = Math.min(Math.max(cam.zoom, minZoom(vw, vh, map)), MAX_ZOOM);
  return {
    x: clampAxis(cam.x, vw / zoom, map.w),
    y: clampAxis(cam.y, vh / zoom, map.h),
    zoom,
  };
}

/** Zoom keeping the world point under the cursor (unless clamping interferes). */
export function zoomAt(
  cam: Camera,
  sx: number,
  sy: number,
  factor: number,
  viewW: number,
  viewH: number,
  map: MapSize,
): Camera {
  const vw = safeView(viewW);
  const vh = safeView(viewH);
  // The point under the cursor comes from the already clamped camera, i.e. the one visible on screen.
  const base = clampCamera(cam, vw, vh, map);
  const zoom = Math.min(Math.max(base.zoom * factor, minZoom(vw, vh, map)), MAX_ZOOM);
  const under = screenToWorld(base, sx, sy, vw, vh);
  const next: Camera = {
    x: under.x - (sx - vw / 2) / zoom,
    y: under.y - (sy - vh / 2) / zoom,
    zoom,
  };
  return clampCamera(next, vw, vh, map);
}
