import { WORLD_H, WORLD_W } from '../sim/world/types';

/** Центр камеры в клетках мира; zoom — пикселей на клетку. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MAX_ZOOM = 16;

/** Размер вьюпорта не меньше 1 пикселя (свёрнутое окно даёт 0 или NaN). */
function safeView(v: number): number {
  return Number.isFinite(v) ? Math.max(v, 1) : 1;
}

/** Минимальный зум: вся карта помещается в экран. */
export function minZoom(viewW: number, viewH: number): number {
  return Math.min(safeView(viewW) / WORLD_W, safeView(viewH) / WORLD_H);
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
 * Ограничивает центр так, чтобы на каждой оси не было больше четверти экрана пустоты:
 * центр в [span/4, size − span/4]. Интервал схлопывается в середину карты только при
 * span ≥ 2·size, поэтому переход непрерывен.
 */
function clampAxis(center: number, span: number, mapSize: number): number {
  if (span >= 2 * mapSize) return mapSize / 2;
  const margin = span / 4;
  return Math.min(Math.max(center, margin), mapSize - margin);
}

export function clampCamera(cam: Camera, viewW: number, viewH: number): Camera {
  const vw = safeView(viewW);
  const vh = safeView(viewH);
  const zoom = Math.min(Math.max(cam.zoom, minZoom(vw, vh)), MAX_ZOOM);
  return {
    x: clampAxis(cam.x, vw / zoom, WORLD_W),
    y: clampAxis(cam.y, vh / zoom, WORLD_H),
    zoom,
  };
}

/** Зум с сохранением мировой точки под курсором (если не мешает ограничение). */
export function zoomAt(
  cam: Camera,
  sx: number,
  sy: number,
  factor: number,
  viewW: number,
  viewH: number,
): Camera {
  const vw = safeView(viewW);
  const vh = safeView(viewH);
  // Точка под курсором берётся из уже ограниченной камеры, т.е. той, что видна на экране.
  const base = clampCamera(cam, vw, vh);
  const zoom = Math.min(Math.max(base.zoom * factor, minZoom(vw, vh)), MAX_ZOOM);
  const under = screenToWorld(base, sx, sy, vw, vh);
  const next: Camera = {
    x: under.x - (sx - vw / 2) / zoom,
    y: under.y - (sy - vh / 2) / zoom,
    zoom,
  };
  return clampCamera(next, vw, vh);
}
