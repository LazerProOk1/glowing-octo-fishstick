import {
  BufferImageSource,
  Container,
  GlProgram,
  Mesh,
  MeshGeometry,
  RendererType,
  Shader,
  UniformGroup,
  type Application,
  type TextureSource,
  type WebGLRenderer,
} from 'pixi.js';
import { DEFAULT_SIZE, SIZE_PRESETS } from '../sim/world/params';
import type { World } from '../sim/world/types';
import { frameStats, type FrameStats } from './frameBench';
import { clampCamera, minZoom, screenToWorld, zoomAt, type Camera, type MapSize } from './camera';
import { bakeWorld, type WorldBake } from './bakeWorld';
import type { Rect } from './derived';
import { DEFAULT_FILL, MAP_MODES, mapModeById, type MapMode, type ProvinceRGBA } from './mapModes';
import { MAP_FRAGMENT, MAP_VERTEX } from './mapShader';
import { PROVINCE_FLAGS, ProvinceData, WEBGL2_MIN_TEXTURE_SIZE } from './provinceData';
import { RiverLayer } from './riverLayer';
import { coastAt, pickProvince, type ProvinceMaps } from './softProvince';
import {
  createAtlasPlaceholder,
  createWorldTextures,
  destroyWorldTextures,
  loadAtlas,
  rgba8,
  type WorldTextures,
} from './textures';

/** Zoom multiplier per wheel notch (deltaY = 100 px). */
const ZOOM_STEP = 1.12;
/** Warm-up frames before the measurement, not counted in the results. */
const BENCH_WARMUP_FRAMES = 2;

/**
 * Map: a full-screen quad with the terrain/biomes/borders shader and the river layer on top.
 * Owns the camera and the input (drag, wheel, hover).
 */
export class MapView {
  private readonly app: Application;
  private readonly root = new Container();
  private readonly geometry: MeshGeometry;
  private readonly shader: Shader;
  private readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly rivers = new RiverLayer();
  private readonly uniforms: UniformGroup;
  private readonly camU = new Float32Array(4);
  private readonly viewU = new Float32Array(2);
  /** Map size in cells; before the first setWorld — the default size. */
  private map: MapSize = { ...SIZE_PRESETS[DEFAULT_SIZE] };
  private readonly worldU = new Float32Array([this.map.w, this.map.h]);
  /** Placeholder for the world textures before the first setWorld. */
  private readonly blank: TextureSource;
  private atlas: TextureSource;
  private textures: WorldTextures | null = null;
  private world: World | null = null;
  /** Display owner maps and the shore height (the same arrays as in the textures): used for hover. */
  private owners: ProvinceMaps | null = null;
  /** Province data (mode fill colour, flags) and its texture; present while a world is shown. */
  private provData: ProvinceData | null = null;
  private provSource: BufferImageSource | null = null;
  private mode: MapMode;
  private readonly maxTextureSize: number;
  private cam: Camera = { x: this.map.w / 2, y: this.map.h / 2, zoom: 1 };
  private hovered: number | null = null;
  private readonly hoverListeners = new Set<(id: number | null) => void>();
  private drag: { id: number; x: number; y: number } | null = null;
  private destroyed = false;

  constructor(app: Application) {
    this.app = app;
    this.uniforms = new UniformGroup({
      uCam: { value: this.camU, type: 'vec4<f32>' },
      uView: { value: this.viewU, type: 'vec2<f32>' },
      uWorldSize: { value: this.worldU, type: 'vec2<f32>' },
      uHovered: { value: -1, type: 'f32' },
      uFill: { value: 0, type: 'f32' },
      uProvDataW: { value: 1, type: 'f32' },
    });
    const first = MAP_MODES[0];
    if (!first) throw new Error('MAP_MODES is empty');
    this.mode = first;
    const gl = app.renderer.type === RendererType.WEBGL ? (app.renderer as WebGLRenderer).gl : null;
    this.maxTextureSize = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : WEBGL2_MIN_TEXTURE_SIZE;
    this.blank = createAtlasPlaceholder();
    this.atlas = createAtlasPlaceholder();
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex: MAP_VERTEX, fragment: MAP_FRAGMENT, name: 'map' }),
      resources: {
        mapUniforms: this.uniforms,
        uTerrain: this.blank,
        uHeight: this.blank,
        uSurface: this.blank,
        uBiomeColor: this.blank,
        uSeaDepth: this.blank,
        uProvince: this.blank,
        uProvinceSea: this.blank,
        uPalette: this.blank,
        uAtlas: this.atlas,
        uProvData: this.blank,
      },
    });
    const quad = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    this.geometry = new MeshGeometry({
      positions: quad,
      uvs: quad.slice(),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh<MeshGeometry, Shader>({ geometry: this.geometry, shader: this.shader });
    this.mesh.visible = false;
    this.root.addChild(this.mesh, this.rivers.container);
    app.stage.addChild(this.root);

    const canvas = app.canvas;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('lostpointercapture', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    app.renderer.on('resize', this.onResize);
    app.ticker.add(this.flushProvinceData);

    loadAtlas()
      .then((source) => {
        if (this.destroyed) {
          source.destroy();
          return;
        }
        const old = this.atlas;
        this.atlas = source;
        this.shader.resources.uAtlas = source;
        old.destroy();
      })
      .catch((err: unknown) => console.error('failed to load the terrain atlas', err));
    this.sync();
  }

  /** Current map mode. */
  get mapMode(): MapMode {
    return this.mode;
  }

  /** Current camera (a copy). */
  get camera(): Camera {
    return { ...this.cam };
  }

  /**
   * Shows the world; the textures of the previous world are released.
   * bake — textures baked in the worker; without it we bake on the main thread (several seconds).
   */
  setWorld(world: World, bake: WorldBake = bakeWorld(world)): void {
    const next = createWorldTextures(world, bake);
    const res = this.shader.resources;
    res.uTerrain = next.terrain;
    res.uHeight = next.height;
    res.uSurface = next.surface;
    res.uBiomeColor = next.biomeColor;
    res.uSeaDepth = next.seaDepth;
    res.uProvince = next.province;
    res.uProvinceSea = next.provinceSea;
    res.uPalette = next.palette;
    const resized = world.w !== this.map.w || world.h !== this.map.h;
    this.map = { w: world.w, h: world.h };
    if (this.textures) destroyWorldTextures(this.textures);
    if (!this.textures || resized) {
      // First world or a different size: the whole map on screen.
      const { width, height } = this.app.screen;
      this.cam = { x: world.w / 2, y: world.h / 2, zoom: minZoom(width, height, this.map) };
    }
    this.textures = next;
    this.world = world;
    this.owners = { w: world.w, h: world.h, land: bake.provinceRG, sea: bake.provinceSeaRG, surface: bake.surface };
    this.worldU[0] = world.w;
    this.worldU[1] = world.h;
    const owners = this.owners;
    this.rivers.setRivers(world.rivers, (x, y) => coastAt(owners, x, y));
    this.setProvinceTexture(world);
    this.setHoveredProvince(null);
    this.mesh.visible = true;
    this.sync();
  }

  /**
   * Switches the map mode: recomputes the colours of all provinces by mode.color and uploads
   * the data texture once. An unknown id is an error.
   */
  setMapMode(modeId: string): void {
    const mode = mapModeById(modeId);
    if (!mode) throw new Error(`unknown map mode ${modeId}`);
    this.mode = mode;
    const data = this.provData;
    const world = this.world;
    if (!data || !world || !this.provSource) return;
    this.applyFill(data.applyMode(mode, world));
    this.provSource.update();
  }

  /**
   * Changes the texel of one province (RGB — fill colour, A — flags, see PROVINCE_FLAGS).
   * If RGB is non-zero, the FILL bit is set automatically (the caller need not set it).
   * A channel outside the integers 0..255 is a RangeError. Only the changed range goes to the GPU, once
   * per frame. Switching the map mode recomputes the colours (the state flags — bits 0–2 — are kept).
   */
  setProvinceData(id: number, rgba: ProvinceRGBA): void {
    if (!this.provData) return;
    const filled = rgba[0] !== 0 || rgba[1] !== 0 || rgba[2] !== 0;
    this.provData.set(id, filled ? [rgba[0], rgba[1], rgba[2], rgba[3] | PROVINCE_FLAGS.FILL] : rgba);
    // A fill in a mode without fills: the shader starts reading the data texture.
    if (filled && this.uniforms.uniforms.uFill === 0) this.applyFill(true);
  }

  /**
   * Uploads to the GPU the rows of the terrain, biome colour, height and water owner map textures
   * (its alpha is the water kind by biome) that `rect` touches —
   * after updateDerivedRect over the same arrays that were passed to setWorld (bake).
   * The rectangle is clipped to the map edges; entirely off-map or empty — does nothing.
   */
  updateRegion(rect: Rect): void {
    const t = this.textures;
    if (!t || rect.w <= 0 || rect.h <= 0) return;
    const w = this.map.w;
    const y0 = Math.max(0, Math.floor(rect.y));
    const y1 = Math.min(this.map.h, Math.ceil(rect.y + rect.h));
    if (y1 <= y0) return;
    const start = y0 * w;
    const end = y1 * w;
    for (const src of [t.terrain, t.height, t.biomeColor, t.provinceSea]) {
      if (src instanceof BufferImageSource) src.update(start, end);
    }
  }

  setHoveredProvince(id: number | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    this.uniforms.uniforms.uHovered = id ?? -1;
    this.uniforms.update();
    for (const cb of this.hoverListeners) cb(id);
  }

  /** Subscribes to province changes under the cursor; returns an unsubscribe function. */
  onHover(cb: (id: number | null) => void): () => void {
    this.hoverListeners.add(cb);
    return () => this.hoverListeners.delete(cb);
  }

  /**
   * Honest frame benchmark: draws `frames` frames synchronously and waits for the GPU to finish
   * after each. gl.finish() does not work for this: Chrome (ANGLE) treats it as an ordinary flush and
   * returns immediately, so only the command submission time would be measured. Reading one pixel
   * (readPixels) forces a wait for the drawing result. renderer.render runs the whole shader again
   * each time. Independent of requestAnimationFrame, and correct in a hidden tab too.
   * The first two frames are not measured (warm-up: shader compilation, texture upload).
   * No WebGL, or a mean below 0.05 ms (the sync did not work) — null, "unavailable".
   */
  benchmark(frames = 120): FrameStats | null {
    const { renderer, stage } = this.app;
    if (renderer.type !== RendererType.WEBGL) return null;
    const gl = (renderer as WebGLRenderer).gl;
    const px = new Uint8Array(4);
    const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let i = 0; i < BENCH_WARMUP_FRAMES; i++) {
      renderer.render(stage);
      sync();
    }
    const samples: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      renderer.render(stage);
      sync();
      samples.push(performance.now() - t0);
    }
    const stats = frameStats(samples);
    return stats.avg < 0.05 ? null : stats;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hoverListeners.clear();
    const canvas = this.app.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('lostpointercapture', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
    this.app.renderer.off('resize', this.onResize);
    this.app.ticker.remove(this.flushProvinceData);
    this.root.removeFromParent();
    this.rivers.destroy();
    this.mesh.destroy();
    this.geometry.destroy();
    this.shader.destroy(true);
    if (this.textures) destroyWorldTextures(this.textures);
    this.textures = null;
    this.world = null;
    this.owners = null;
    this.provSource?.destroy();
    this.provSource = null;
    this.provData = null;
    this.blank.destroy();
    this.atlas.destroy();
    this.root.destroy();
  }

  /** A new province data texture for the world, with the current mode colours right away. */
  private setProvinceTexture(world: World): void {
    const data = new ProvinceData(world.provinces.length, this.maxTextureSize);
    const anyFill = data.applyMode(this.mode, world);
    const source = rgba8(data.data, data.width, data.height, false);
    this.shader.resources.uProvData = source;
    this.provSource?.destroy();
    this.provSource = source;
    this.provData = data;
    this.uniforms.uniforms.uProvDataW = data.width;
    this.applyFill(anyFill);
  }

  private applyFill(anyFill: boolean): void {
    // Mode without fills — the shader does not read the data texture at all: the map looks mode-less.
    this.uniforms.uniforms.uFill = anyFill ? (this.mode.fill ?? DEFAULT_FILL) : 0;
    this.uniforms.update();
  }

  /** Once per frame: upload of the texels changed by setProvinceData (one range). */
  private readonly flushProvinceData = (): void => {
    const range = this.provData?.takeDirty();
    if (range && this.provSource) this.provSource.update(range.start, range.end);
  };

  /** Applies the camera constraints and updates the uniforms, the quad and the river layer. */
  private sync(): void {
    const { width, height } = this.app.screen;
    this.cam = clampCamera(this.cam, width, height, this.map);
    const { x, y, zoom } = this.cam;
    this.mesh.scale.set(width, height);
    this.camU[0] = x;
    this.camU[1] = y;
    this.camU[2] = zoom;
    this.camU[3] = this.app.renderer.resolution;
    this.viewU[0] = width;
    this.viewU[1] = height;
    this.uniforms.update();
    this.rivers.container.scale.set(zoom);
    this.rivers.container.position.set(width / 2 - x * zoom, height / 2 - y * zoom);
    this.rivers.update(zoom);
  }

  /** Pointer coordinates in CSS pixels of the Pixi screen. */
  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const { width, height } = this.app.screen;
    return {
      x: ((e.clientX - rect.left) * width) / Math.max(rect.width, 1),
      y: ((e.clientY - rect.top) * height) / Math.max(rect.height, 1),
    };
  }

  /**
   * Hover over CPU copies of the same maps the shader uses, without reading from the GPU: land or water
   * at the point comes from the blurred height, then the province with the largest share nearby from the
   * map of that side (pickProvince mirrors the shader's softSide, so the picked province is the highlighted one).
   */
  private hoverAt(sx: number, sy: number): void {
    const world = this.world;
    const owners = this.owners;
    if (!world || !owners) return;
    const { width, height } = this.app.screen;
    const p = screenToWorld(this.cam, sx, sy, width, height);
    const id = pickProvince(owners, p.x, p.y);
    this.setHoveredProvince(id !== null && world.provinces[id] ? id : null);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.app.canvas.setPointerCapture(e.pointerId);
    this.app.canvas.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (drag && e.pointerId === drag.id) {
      const rect = this.app.canvas.getBoundingClientRect();
      const scale = this.app.screen.width / Math.max(rect.width, 1);
      const k = scale / this.cam.zoom;
      this.cam = { ...this.cam, x: this.cam.x - (e.clientX - drag.x) * k, y: this.cam.y - (e.clientY - drag.y) * k };
      drag.x = e.clientX;
      drag.y = e.clientY;
      this.sync();
    }
    const { x, y } = this.local(e);
    this.hoverAt(x, y);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    if (this.app.canvas.hasPointerCapture(e.pointerId)) this.app.canvas.releasePointerCapture(e.pointerId);
    this.app.canvas.style.cursor = '';
  };

  private readonly onPointerLeave = (): void => {
    if (!this.drag) this.setHoveredProvince(null);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // deltaMode: 0 — pixels, 1 — lines, 2 — pages. One mouse notch ≈ 100 px.
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
    const notches = Math.max(-3, Math.min(3, -px / 100));
    const { x, y } = this.local(e);
    const { width, height } = this.app.screen;
    this.cam = zoomAt(this.cam, x, y, ZOOM_STEP ** notches, width, height, this.map);
    this.sync();
    this.hoverAt(x, y);
  };

  private readonly onResize = (): void => {
    this.sync();
  };
}
