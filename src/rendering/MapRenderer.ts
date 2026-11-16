import type { Viewport } from '../types/viewport';
import type { World } from '../types/world';
import { BIOME_RGB } from './palette';

export const TILE_PIXELS = 4;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 12;
const MAX_FIT_ZOOM = 3;
const MIN_VISIBLE_PIXELS = 64;
const FIT_PADDING = 16;
const WHEEL_ZOOM_SPEED = 0.0015;
const BACKGROUND_COLOR = '#f9fafb';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class MapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly tileCanvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private world: World | null = null;
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
    this.tileCanvas = document.createElement('canvas');
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

  setWorld(world: World): void {
    this.world = world;
    this.buildTileLayer(world);
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

  private buildTileLayer(world: World): void {
    this.tileCanvas.width = world.width;
    this.tileCanvas.height = world.height;

    const context = this.tileCanvas.getContext('2d');
    if (context === null) {
      return;
    }

    const image = context.createImageData(world.width, world.height);
    const pixels = image.data;

    for (let y = 0; y < world.height; y += 1) {
      const row = world.tiles[y];
      if (row === undefined) {
        continue;
      }
      for (let x = 0; x < world.width; x += 1) {
        const tile = row[x];
        if (tile === undefined) {
          continue;
        }
        const color = BIOME_RGB[tile.biome];
        const offset = (y * world.width + x) * 4;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
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

    const mapWidth = this.world.width * TILE_PIXELS;
    const mapHeight = this.world.height * TILE_PIXELS;
    const zoom = clamp(
      Math.min(
        (this.cssWidth - FIT_PADDING * 2) / mapWidth,
        (this.cssHeight - FIT_PADDING * 2) / mapHeight,
      ),
      MIN_ZOOM,
      MAX_FIT_ZOOM,
    );

    this.viewport = {
      zoom,
      offsetX: (this.cssWidth - mapWidth * zoom) / 2,
      offsetY: (this.cssHeight - mapHeight * zoom) / 2,
    };
    this.viewportReady = true;
  }

  private clampViewport(): void {
    if (this.world === null) {
      return;
    }

    const drawWidth = this.world.width * TILE_PIXELS * this.viewport.zoom;
    const drawHeight = this.world.height * TILE_PIXELS * this.viewport.zoom;

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
    context.imageSmoothingEnabled = false;
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.world === null) {
      return;
    }

    const dpr = this.canvas.width / Math.max(this.cssWidth, 1);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.tileCanvas,
      this.viewport.offsetX,
      this.viewport.offsetY,
      this.world.width * TILE_PIXELS * this.viewport.zoom,
      this.world.height * TILE_PIXELS * this.viewport.zoom,
    );
  };
}
