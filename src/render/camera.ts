import { WORLD_H, WORLD_W } from '../sim/world/types';

/** Центр камеры в клетках мира; zoom — пикселей на клетку. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MAX_ZOOM = 16;

/** Минимальный зум: вся карта помещается в экран. */
export function minZoom(viewW: number, viewH: number): number {
  return Math.min(viewW / WORLD_W, viewH / WORLD_H);
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

/** Ограничивает центр так, чтобы на каждой оси не было больше четверти экрана пустоты. */
function clampAxis(center: number, span: number, mapSize: number): number {
  if (span >= mapSize) return mapSize / 2;
  const margin = span / 4;
  return Math.min(Math.max(center, margin), mapSize - margin);
}

export function clampCamera(cam: Camera, viewW: number, viewH: number): Camera {
  const zoom = Math.min(Math.max(cam.zoom, minZoom(viewW, viewH)), MAX_ZOOM);
  return {
    x: clampAxis(cam.x, viewW / zoom, WORLD_W),
    y: clampAxis(cam.y, viewH / zoom, WORLD_H),
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
  const zoom = Math.min(Math.max(cam.zoom * factor, minZoom(viewW, viewH)), MAX_ZOOM);
  const under = screenToWorld(cam, sx, sy, viewW, viewH);
  const next: Camera = {
    x: under.x - (sx - viewW / 2) / zoom,
    y: under.y - (sy - viewH / 2) / zoom,
    zoom,
  };
  return clampCamera(next, viewW, viewH);
}
