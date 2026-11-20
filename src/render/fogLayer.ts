import { BufferImageSource, Filter, GlProgram, type Container, type Shader, type TextureSource, type UniformGroup } from 'pixi.js';
import { ProvinceState } from './provinceState';
import { FOG_GLSL } from './shaders/fog';
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
uniform sampler2D uProvince;
uniform vec4 uCam;
uniform vec2 uView;
uniform vec2 uWorldSize;
uniform float uProvDataW;
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
  float seen = fogSeen(p);
  // Under fog the river is also half transparent: guessed, not a dark line over the grey land.
  float a = c.a * mix(0.5, 1.0, seen);
  finalColor = vec4(mix(fogged(rgb), rgb, seen) * a, a);
}
`;

/**
 * Fog of war and own provinces: the province state texture for the map shader (fog in the map
 * itself) and a filter giving the river layer the same fog. MapView delegates to it.
 */
export class FogLayer {
  private state: ProvinceState | null = null;
  private source: BufferImageSource | null = null;
  private enabled = true;
  /** Whether the game has given visibility for this world; until then no fog. */
  private hasVisibility = false;
  private readonly riverFilter: Filter;

  constructor(
    private readonly shader: Shader,
    private readonly uniforms: UniformGroup,
    private readonly rivers: Container,
    private readonly maxTextureSize: number,
  ) {
    this.riverFilter = new Filter({
      glProgram: GlProgram.from({ vertex: RIVER_FOG_VERTEX, fragment: RIVER_FOG_FRAGMENT, name: 'river-fog' }),
      // Every resource must be present here: later assignments only replace existing ones.
      resources: {
        mapUniforms: uniforms,
        uProvince: shader.resources.uProvince as TextureSource,
        uProvState: shader.resources.uProvState as TextureSource,
      },
      resolution: 'inherit',
      antialias: 'inherit',
    });
  }

  /** A new state texture for the world (no visibility yet: no fog). province — the land owner map. */
  setWorld(count: number, province: TextureSource): void {
    const state = new ProvinceState(count, this.maxTextureSize);
    const source = rgba8(state.data, state.width, state.height, false);
    this.shader.resources.uProvState = source;
    this.riverFilter.resources.uProvState = source;
    this.riverFilter.resources.uProvince = province;
    this.source?.destroy();
    this.source = source;
    this.state = state;
    this.hasVisibility = false;
    this.apply();
  }

  setVisibility(vis: Uint8Array): void {
    const st = this.state;
    if (!st) return;
    if (vis.length !== st.count) throw new Error(`visibility length ${vis.length} != ${st.count} provinces`);
    for (let id = 0; id < st.count; id++) st.setFog(id, vis[id] ? 255 : 0);
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

  /** Once per frame: uploads the changed texel range. */
  flush(): void {
    const range = this.state?.takeDirty();
    if (range && this.source) this.source.update(range.start, range.end);
  }

  destroy(): void {
    this.rivers.filters = [];
    this.riverFilter.destroy();
    this.source?.destroy();
    this.source = null;
    this.state = null;
  }

  private apply(): void {
    const on = this.enabled && this.hasVisibility;
    this.uniforms.uniforms.uFogOn = on ? 1 : 0;
    this.uniforms.update();
    this.rivers.filters = on ? [this.riverFilter] : [];
  }
}
