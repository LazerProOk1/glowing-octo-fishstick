export interface Viewport {
  /** Canvas pixels */
  offsetX: number;
  offsetY: number;
  /** 1 = 4 px per tile, clamped per renderer */
  zoom: number;
}
