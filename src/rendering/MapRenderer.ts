import { clamp } from '@/lib/math';
import type { Viewport } from '@/types/viewport';
import type { World } from '@/types/world';
import { PIXELS_PER_TILE, bakeMap, type BakedMap } from './bakeMap';
import { buildProvinceBorderLoops } from './provinceBorders';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 12;
const MAX_FIT_ZOOM = 3;
const MIN_VISIBLE_PIXELS = 64;
const FIT_PADDING = 16;
const WHEEL_ZOOM_SPEED = 0.0015;
const BACKGROUND_COLOR = '#f4f4f5';
const TOP_BAR_INSET = 48;
const CLICK_TOLERANCE = 4;

const BORDER_COLOR = 'rgba(0, 0, 0, 0.4)';
const BORDER_WIDTH = 1;
const HIGHLIGHT_COLOR = 'rgba(255, 255, 255, 0.2)';

export interface MapRendererOptions {
  readonly onProvinceSelect?: (provinceId: number | null) => void;
}

export class MapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly options: MapRendererOptions;
  private readonly layer: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private world: World | null = null;
  private baked: BakedMap | null = null;
  private borderPath: Path2D | null = null;
  private highlightPath: Path2D | null = null;
  private viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
  private cssWidth = 0;
  private cssHeight = 0;
  private frameId: number | null = null;
  private dragging = false;
  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pressX = 0;
  private pressY = 0;
  private moved = false;
  private viewportReady = false;

  constructor(canvas: HTMLCanvasElement, options: MapRendererOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) {
      throw new Error('Canvas 2D context is not available');
    }
    this.context = context;
    this.layer = document.createElement('canvas');
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.handleResize();
  }

  /**
   * Rebuilds the cached terrain layer and province geometry once per world;
   * every frame after that is a drawImage plus two vector strokes.
   */
  setWorld(world: World): void {
    const baked = bakeMap(world);

    this.world = world;
    this.baked = baked;
    this.layer.width = baked.width;
    this.layer.height = baked.height;

    const layerContext = this.layer.getContext('2d');
    if (layerContext !== null) {
      const image = layerContext.createImageData(baked.width, baked.height);
      image.data.set(baked.pixels);
      layerContext.putImageData(image, 0, 0);
    }

    this.borderPath = this.buildBorderPath(world);
    this.highlightPath = null;

    if (this.viewportReady) {
      this.clampViewport();
    } else {
      this.fitToView();
    }
    this.requestRender();
  }

  setSelectedProvince(provinceId: number | null): void {
    this.highlightPath = provinceId === null ? null : this.buildHighlightPath(provinceId);
    this.requestRender();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private get mapWidth(): number {
    return this.world === null ? 0 : this.world.width * PIXELS_PER_TILE;
  }

  private get mapHeight(): number {
    return this.world === null ? 0 : this.world.height * PIXELS_PER_TILE;
  }

  /** Smoothed province boundaries, one stroked path for the whole world. */
  private buildBorderPath(world: World): Path2D {
    const path = new Path2D();
    const scale = PIXELS_PER_TILE;

    for (const loop of buildProvinceBorderLoops(world)) {
      const first = loop.points[0];
      if (first === undefined) {
        continue;
      }
      path.moveTo(first.x * scale, first.y * scale);
      for (let index = 1; index < loop.points.length; index += 1) {
        const point = loop.points[index];
        if (point === undefined) {
          continue;
        }
        path.lineTo(point.x * scale, point.y * scale);
      }
      if (loop.closed) {
        path.closePath();
      }
    }

    return path;
  }

  private buildHighlightPath(provinceId: number): Path2D {
    const path = new Path2D();
    const world = this.world;
    if (world === null) {
      return path;
    }
    const step = PIXELS_PER_TILE;

    for (let y = 0; y < world.height; y += 1) {
      const row = world.tiles[y];
      if (row === undefined) {
        continue;
      }
      for (let x = 0; x < world.width; x += 1) {
        if (row[x]?.provinceId === provinceId) {
          path.rect(x * step, y * step, step, step);
        }
      }
    }

    return path;
  }

  private handleResize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

    this.cssWidth = Math.max(1, Math.round(rect.width));
    this.cssHeight = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);

    if (this.viewportReady) {
      this.clampViewport();
    } else {
      this.fitToView();
    }
    this.requestRender();
  };

  private fitToView(): void {
    if (this.world === null) {
      return;
    }

    const availableHeight = Math.max(this.cssHeight - TOP_BAR_INSET, 1);
    const zoom = clamp(
      Math.min(
        (this.cssWidth - FIT_PADDING * 2) / this.mapWidth,
        (availableHeight - FIT_PADDING * 2) / this.mapHeight,
      ),
      MIN_ZOOM,
      MAX_FIT_ZOOM,
    );

    this.viewport = {
      zoom,
      offsetX: (this.cssWidth - this.mapWidth * zoom) / 2,
      offsetY: TOP_BAR_INSET + (availableHeight - this.mapHeight * zoom) / 2,
    };
    this.viewportReady = true;
  }

  private clampViewport(): void {
    if (this.world === null) {
      return;
    }

    const drawWidth = this.mapWidth * this.viewport.zoom;
    const drawHeight = this.mapHeight * this.viewport.zoom;

    const offsetX =
      drawWidth <= this.cssWidth
        ? (this.cssWidth - drawWidth) / 2
        : clamp(this.viewport.offsetX, this.cssWidth - drawWidth - MIN_VISIBLE_PIXELS, MIN_VISIBLE_PIXELS);
    const offsetY =
      drawHeight <= this.cssHeight
        ? (this.cssHeight - drawHeight) / 2
        : clamp(this.viewport.offsetY, this.cssHeight - drawHeight - MIN_VISIBLE_PIXELS, MIN_VISIBLE_PIXELS);

    this.viewport = { zoom: this.viewport.zoom, offsetX, offsetY };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    this.dragging = true;
    this.moved = false;
    this.activePointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.pressX = event.clientX;
    this.pressY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.remove('cursor-grab');
    this.canvas.classList.add('cursor-grabbing');
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.activePointerId) {
      return;
    }
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    if (Math.hypot(event.clientX - this.pressX, event.clientY - this.pressY) > CLICK_TOLERANCE) {
      this.moved = true;
    }
    if (!this.moved) {
      return;
    }

    this.viewport = {
      zoom: this.viewport.zoom,
      offsetX: this.viewport.offsetX + deltaX,
      offsetY: this.viewport.offsetY + deltaY,
    };
    this.clampViewport();
    this.requestRender();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    const wasClick = !this.moved;
    this.dragging = false;
    this.activePointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.classList.remove('cursor-grabbing');
    this.canvas.classList.add('cursor-grab');

    if (wasClick) {
      this.handleClick(event);
    }
  };

  private handleClick(event: PointerEvent): void {
    const world = this.world;
    if (world === null) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const mapX = (localX - this.viewport.offsetX) / this.viewport.zoom;
    const mapY = (localY - this.viewport.offsetY) / this.viewport.zoom;
    const tileX = Math.floor(mapX / PIXELS_PER_TILE);
    const tileY = Math.floor(mapY / PIXELS_PER_TILE);

    if (tileX < 0 || tileY < 0 || tileX >= world.width || tileY >= world.height) {
      return;
    }

    const provinceId = world.tiles[tileY]?.[tileX]?.provinceId ?? -1;
    this.options.onProvinceSelect?.(provinceId >= 0 ? provinceId : null);
  }

  private handleWheel = (event: WheelEvent): void => {
    if (this.world === null) {
      return;
    }
    event.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = clamp(
      this.viewport.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const scale = nextZoom / this.viewport.zoom;

    this.viewport = {
      zoom: nextZoom,
      offsetX: pointerX - (pointerX - this.viewport.offsetX) * scale,
      offsetY: pointerY - (pointerY - this.viewport.offsetY) * scale,
    };
    this.clampViewport();
    this.requestRender();
  };

  private requestRender = (): void => {
    if (this.frameId !== null) {
      return;
    }
    this.frameId = window.requestAnimationFrame(this.renderFrame);
  };

  private renderFrame = (): void => {
    this.frameId = null;
    const { context } = this;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.world === null || this.baked === null) {
      return;
    }

    const dpr = this.canvas.width / Math.max(this.cssWidth, 1);
    const { offsetX, offsetY, zoom } = this.viewport;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.layer, offsetX, offsetY, this.mapWidth * zoom, this.mapHeight * zoom);

    context.save();
    context.translate(offsetX, offsetY);
    context.scale(zoom, zoom);
    context.lineWidth = BORDER_WIDTH / zoom;

    if (this.highlightPath !== null) {
      context.fillStyle = HIGHLIGHT_COLOR;
      context.fill(this.highlightPath);
    }

    if (this.borderPath !== null) {
      context.strokeStyle = BORDER_COLOR;
      context.lineCap = 'round';
      context.stroke(this.borderPath);
    }

    context.restore();
  };
}
