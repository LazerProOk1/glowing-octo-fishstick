import {
  Container,
  GlProgram,
  Mesh,
  MeshGeometry,
  Shader,
  UniformGroup,
  type Application,
  type TextureSource,
} from 'pixi.js';
import { DEFAULT_SIZE, SIZE_PRESETS } from '../sim/world/params';
import type { World } from '../sim/world/types';
import { clampCamera, minZoom, screenToWorld, zoomAt, type Camera, type MapSize } from './camera';
import type { WorldBake } from './bakeWorld';
import { MAP_FRAGMENT, MAP_VERTEX } from './mapShader';
import { RiverLayer } from './riverLayer';
import {
  createAtlasPlaceholder,
  createWorldTextures,
  destroyWorldTextures,
  loadAtlas,
  type WorldTextures,
} from './textures';

/** Множитель зума на одну «ступеньку» колеса (deltaY = 100 px). */
const ZOOM_STEP = 1.12;

/**
 * Карта: полноэкранный quad с шейдером рельефа/биомов/границ и слой рек поверх.
 * Владеет камерой и вводом (перетаскивание, колесо, наведение).
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
  /** Размер карты в клетках; до первого setWorld — размер по умолчанию. */
  private map: MapSize = { ...SIZE_PRESETS[DEFAULT_SIZE] };
  private readonly worldU = new Float32Array([this.map.w, this.map.h]);
  /** Заглушка для текстур мира до первого setWorld. */
  private readonly blank: TextureSource;
  private atlas: TextureSource;
  private textures: WorldTextures | null = null;
  private world: World | null = null;
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
    });
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
        uProvince: this.blank,
        uBorder: this.blank,
        uPalette: this.blank,
        uAtlas: this.atlas,
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
      .catch((err: unknown) => console.error('не удалось загрузить атлас рельефа', err));
    this.sync();
  }

  /** Текущая камера (копия). */
  get camera(): Camera {
    return { ...this.cam };
  }

  /**
   * Показывает мир; текстуры предыдущего мира освобождаются.
   * bake — текстуры, запечённые в воркере; без него печём в главном потоке (несколько секунд).
   */
  setWorld(world: World, bake?: WorldBake): void {
    const next = createWorldTextures(world, bake);
    const res = this.shader.resources;
    res.uTerrain = next.terrain;
    res.uHeight = next.height;
    res.uSurface = next.surface;
    res.uBiomeColor = next.biomeColor;
    res.uProvince = next.province;
    res.uBorder = next.border;
    res.uPalette = next.palette;
    const resized = world.w !== this.map.w || world.h !== this.map.h;
    this.map = { w: world.w, h: world.h };
    if (this.textures) destroyWorldTextures(this.textures);
    if (!this.textures || resized) {
      // Первый мир или другой размер: вся карта на экране.
      const { width, height } = this.app.screen;
      this.cam = { x: world.w / 2, y: world.h / 2, zoom: minZoom(width, height, this.map) };
    }
    this.textures = next;
    this.world = world;
    this.worldU[0] = world.w;
    this.worldU[1] = world.h;
    this.rivers.setRivers(world.rivers);
    this.setHoveredProvince(null);
    this.mesh.visible = true;
    this.sync();
  }

  setHoveredProvince(id: number | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    this.uniforms.uniforms.uHovered = id ?? -1;
    this.uniforms.update();
    for (const cb of this.hoverListeners) cb(id);
  }

  /** Подписка на смену провинции под курсором; возвращает отписку. */
  onHover(cb: (id: number | null) => void): () => void {
    this.hoverListeners.add(cb);
    return () => this.hoverListeners.delete(cb);
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
    this.root.removeFromParent();
    this.rivers.destroy();
    this.mesh.destroy();
    this.geometry.destroy();
    this.shader.destroy(true);
    if (this.textures) destroyWorldTextures(this.textures);
    this.textures = null;
    this.world = null;
    this.blank.destroy();
    this.atlas.destroy();
    this.root.destroy();
  }

  /** Применяет ограничения камеры и обновляет uniform-ы, quad и слой рек. */
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

  /** Координаты указателя в CSS-пикселях экрана Pixi. */
  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const { width, height } = this.app.screen;
    return {
      x: ((e.clientX - rect.left) * width) / Math.max(rect.width, 1),
      y: ((e.clientY - rect.top) * height) / Math.max(rect.height, 1),
    };
  }

  /** Наведение по CPU-копии provinceOf, без чтения с GPU. */
  private hoverAt(sx: number, sy: number): void {
    const world = this.world;
    if (!world) return;
    const { width, height } = this.app.screen;
    const p = screenToWorld(this.cam, sx, sy, width, height);
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const inside = cx >= 0 && cy >= 0 && cx < world.w && cy < world.h;
    const id = inside ? world.provinceOf[cy * world.w + cx] : undefined;
    this.setHoveredProvince(id !== undefined && world.provinces[id] ? id : null);
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
    // deltaMode: 0 — пиксели, 1 — строки, 2 — страницы. Одна ступенька мыши ≈ 100 px.
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
