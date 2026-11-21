import {
  BufferImageSource,
  Container,
  Filter,
  GlProgram,
  Mesh,
  MeshGeometry,
  RenderTexture,
  Shader,
  type Renderer,
  type TextureSource,
  type UniformGroup,
} from 'pixi.js';
import { FogFade } from './fogFade';
import { MAP_VERTEX } from './mapShader';
import { ProvinceState } from './provinceState';
import { FOG_FIELD_FRAGMENT, FOG_GLSL, fogFieldSize } from './shaders/fog';
import { BSPLINE_GLSL } from './shaders/softProvince';
import { rgba8 } from './textures';

const RIVER_FOG_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreen;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  vScreen = position;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

// The river layer is drawn over the map quad, so the map shader's fog cannot reach it: this filter
// applies the same fog to the rivers (the same fogSeen, so the edge matches the map's).
const RIVER_FOG_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uCam;
uniform vec2 uView;
uniform vec2 uWorldSize;
${BSPLINE_GLSL}
${FOG_GLSL}
void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  if (c.a <= 0.0) {
    finalColor = c;
    return;
  }
  vec2 p = uCam.xy + (vScreen - 0.5 * uView) / uCam.z;
  vec3 rgb = c.rgb / c.a;
  float seen = fogSeen(p).x; // rivers run on land
  // Under fog the river is also half transparent: guessed, not a dark line over the grey land.
  float a = c.a * mix(0.5, 1.0, seen);
  finalColor = vec4(mix(fogged(rgb), rgb, seen) * a, a);
}
`;

/**
 * Fog of war and own provinces: the province state texture for the map shader (fog in the map
 * itself), the fog field (visibility per lattice point, re-rendered only when visibility changes,
 * so the per-pixel fog is 4 bilinear fetches) and a filter giving the river layer the same fog.
 * MapView delegates to it.
 */
export class FogLayer {
  private state: ProvinceState | null = null;
  private fade: FogFade | null = null;
  private source: BufferImageSource | null = null;
  private enabled = true;
  /** Whether the game has given visibility for this world; until then no fog. */
  private hasVisibility = false;
  private readonly riverFilter: Filter;
  /** Fog field pass: a quad over the field texture, inside a parent so its scale applies. */
  private readonly fieldGeometry = new MeshGeometry({
    positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  private readonly fieldShader: Shader;
  private readonly fieldMesh: Mesh<MeshGeometry, Shader>;
  private readonly fieldRoot = new Container();
  private field: RenderTexture | null = null;
  /** The field no longer matches the province state or the owner maps. */
  private fieldDirty = false;

  constructor(
    private readonly shader: Shader,
    private readonly uniforms: UniformGroup,
    private readonly rivers: Container,
    private readonly maxTextureSize: number,
    private readonly renderer: Renderer,
  ) {
    this.fieldShader = new Shader({
      glProgram: GlProgram.from({ vertex: MAP_VERTEX, fragment: FOG_FIELD_FRAGMENT, name: 'fog-field' }),
      resources: {
        mapUniforms: uniforms,
        uProvince: shader.resources.uProvince as TextureSource,
        uProvinceSea: shader.resources.uProvinceSea as TextureSource,
        uProvState: shader.resources.uProvState as TextureSource,
      },
    });
    this.fieldMesh = new Mesh<MeshGeometry, Shader>({ geometry: this.fieldGeometry, shader: this.fieldShader });
    this.fieldRoot.addChild(this.fieldMesh);
    this.riverFilter = new Filter({
      glProgram: GlProgram.from({ vertex: RIVER_FOG_VERTEX, fragment: RIVER_FOG_FRAGMENT, name: 'river-fog' }),
      // Every resource must be present here: later assignments only replace existing ones.
      resources: {
        mapUniforms: uniforms,
        uFogField: shader.resources.uFogField as TextureSource,
      },
      resolution: 'inherit',
      antialias: 'inherit',
    });
  }

  /**
   * A new state texture and fog field for a world of w×h cells and count provinces (no visibility
   * yet: no fog); call after the map shader got its owner maps.
   */
  setWorld(count: number, w: number, h: number): void {
    const state = new ProvinceState(count, this.maxTextureSize);
    const source = rgba8(state.data, state.width, state.height, false);
    const res = this.shader.resources;
    res.uProvState = source;
    const fr = this.fieldShader.resources;
    fr.uProvState = source;
    fr.uProvince = res.uProvince as TextureSource;
    fr.uProvinceSea = res.uProvinceSea as TextureSource;
    const size = fogFieldSize(w, h);
    const field = RenderTexture.create({ width: size.w, height: size.h, scaleMode: 'linear', addressMode: 'clamp-to-edge' });
    res.uFogField = field.source;
    this.riverFilter.resources.uFogField = field.source;
    this.fieldMesh.scale.set(size.w, size.h);
    this.field?.destroy(true);
    this.field = field;
    this.fieldDirty = true;
    this.source?.destroy();
    this.source = source;
    this.state = state;
    this.fade = new FogFade(count);
    this.hasVisibility = false;
    this.apply();
  }

  setVisibility(vis: Uint8Array): void {
    const st = this.state;
    if (!st) return;
    if (vis.length !== st.count) throw new Error(`visibility length ${vis.length} != ${st.count} provinces`);
    this.fade?.setTarget(vis);
    this.hasVisibility = true;
    this.apply();
  }

  setOwnProvinces(ids: Iterable<number>): void {
    const st = this.state;
    if (!st) return;
    const own = new Set(ids);
    for (const id of own) if (!Number.isInteger(id) || id < 0 || id >= st.count) throw new Error(`bad province id ${id}`);
    for (let id = 0; id < st.count; id++) st.setOwn(id, own.has(id));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.apply();
  }

  /** Once per frame: advances the fog fade, uploads the changed texel range. */
  flush(dtMs = 0): void {
    const st = this.state;
    if (st) this.fade?.step(dtMs, (id, level) => st.setFog(id, level));
    const range = this.state?.takeDirty();
    if (range && this.source) {
      this.source.update(range.start, range.end);
      this.fieldDirty = true;
    }
    // Only while the fog shows: turning it on again finds the field still dirty.
    if (this.fieldDirty && this.field && this.uniforms.uniforms.uFogOn) {
      this.renderer.render({ container: this.fieldRoot, target: this.field, clear: true });
      this.fieldDirty = false;
    }
  }

  destroy(): void {
    this.rivers.filters = [];
    this.riverFilter.destroy();
    this.fieldRoot.destroy({ children: true });
    this.fieldShader.destroy();
    this.fieldGeometry.destroy();
    this.field?.destroy(true);
    this.field = null;
    this.source?.destroy();
    this.source = null;
    this.state = null;
    this.fade = null;
  }

  private apply(): void {
    const on = this.enabled && this.hasVisibility;
    this.uniforms.uniforms.uFogOn = on ? 1 : 0;
    this.uniforms.update();
    this.rivers.filters = on ? [this.riverFilter] : [];
  }
}
