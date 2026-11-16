import { clamp } from '@/lib/math';
import type { Viewport } from '@/types/viewport';
import type { World } from '@/types/world';
import { PIXELS_PER_TILE, bakeMap, type BakedMap } from './bakeMap';
import { RIVER_HEX } from './palette';
import { buildRiverPolylines, type RiverPolyline } from './riverLayer';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 12;
const MAX_FIT_ZOOM = 3;
const MIN_VISIBLE_PIXELS = 64;
const FIT_PADDING = 16;
const WHEEL_ZOOM_SPEED = 0.0015;
const BACKGROUND_COLOR = '#f4f4f5';
const TOP_BAR_INSET = 48;
const MIN_RIVER_SCREEN_WIDTH = 1.1;
const MAX_RIVER_SCREEN_WIDTH = 3.5;

export class MapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly layer: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private world: World | null = null;
  private baked: BakedMap | null = null;
  private rivers: readonly RiverPolyline[] = [];
  private viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
  private cssWidth = 0;
  private cssHeight = 0;
  private frameId: number | null = null;
  private dragging = false;
  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private viewportReady = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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
   * Rebuilds the cached RGBA layer once per world; every frame after that is a
   * single drawImage, so pan and zoom never touch the noise or hillshade code.
   */
  setWorld(world: World): void {
    const baked = bakeMap(world);

    this.world = world;
    this.baked = baked;
    this.rivers = buildRiverPolylines(world);
    this.layer.width = baked.width;
    this.layer.height = baked.height;

    const layerContext = this.layer.getContext('2d');
    if (layerContext !== null) {
      const image = layerContext.createImageData(baked.width, baked.height);
      image.data.set(baked.pixels);
      layerContext.putImageData(image, 0, 0);
    }

    if (this.viewportReady) {
      this.clampViewport();
    } else {
      this.fitToView();
    }
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
    this.activePointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
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
    this.dragging = false;
    this.activePointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.classList.remove('cursor-grabbing');
    this.canvas.classList.add('cursor-grab');
  };

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

    this.drawRivers(context, offsetX, offsetY, zoom);
  };

  /** Rivers are stroked as vector polylines, so they never look like pixel steps. */
  private drawRivers(
    context: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    zoom: number,
  ): void {
    if (this.rivers.length === 0) {
      return;
    }

    context.save();
    context.translate(offsetX, offsetY);
    context.scale(zoom, zoom);
    context.strokeStyle = RIVER_HEX;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const river of this.rivers) {
      const screenWidth = clamp(river.width * zoom, MIN_RIVER_SCREEN_WIDTH, MAX_RIVER_SCREEN_WIDTH);
      context.lineWidth = screenWidth / zoom;
      context.beginPath();

      const first = river.points[0];
      if (first === undefined) {
        continue;
      }
      context.moveTo(first.x, first.y);

      for (let index = 1; index < river.points.length - 1; index += 1) {
        const point = river.points[index];
        const next = river.points[index + 1];
        if (point === undefined || next === undefined) {
          continue;
        }
        context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      }

      const last = river.points[river.points.length - 1];
      if (last !== undefined) {
        context.lineTo(last.x, last.y);
      }

      context.stroke();
    }

    context.restore();
  }
}
