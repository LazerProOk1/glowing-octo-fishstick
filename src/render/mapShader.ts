import { ATLAS_GRID, DetailSlot } from './assets';
import { MAP_COLORS, glslVec3 } from './palette';
import { HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL } from '../content/terrainLevels';
import { PROVINCE_FLAGS } from './provinceData';
import { LAKE_SLOT, PALETTE_SIZE } from './textures';
import { DEPTH_TONE_K, SEA_DEPTH_MAX, SEA_DEPTH_STEP, WATER_GRAIN } from './seaDepth';
import { WAVE_GLSL } from './seaWaves';

/** A number as a GLSL float literal. */
const f = (n: number): string => n.toFixed(4);

/** Atlas side in pixels and the span of one tile in world cells. */
export const ATLAS_PX = 2048;
export const DETAIL_SPAN_CELLS = 32;
export const PAPER_SPAN_CELLS = 48;

/**
 * Detail gain per slot: (luminance − 0.5) · gain gives ≈ ±10% at 2σ.
 * The slot σ values are measured from atlas.png: grass 0.086, forest 0.094, sand 0.062, stone 0.110,
 * snow 0.048, dirt 0.070, paper 0.039 (paper — ≈ ±3%).
 */
const SLOT_GAIN: Record<DetailSlot, number> = {
  [DetailSlot.GRASS]: 0.58,
  [DetailSlot.FOREST]: 0.53,
  [DetailSlot.SAND]: 0.81,
  [DetailSlot.ROCK]: 0.45,
  [DetailSlot.SNOW]: 1.04,
  [DetailSlot.MUD]: 0.71,
  [DetailSlot.PAPER]: 0.38,
};
const gains = Object.values(DetailSlot)
  .sort((a, b) => a - b)
  .map((s) => f(SLOT_GAIN[s]))
  .join(', ');

// '#version 300 es' must open both sources: Pixi only then compiles them as GLSL ES 3.00
// (texelFetch, textureLod, round, bit ops, const arrays); otherwise it adds WebGL1 defines.
export const MAP_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

export const MAP_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uTerrain;   // RGBA8 linear: G biome (texelFetch), B moisture
uniform sampler2D uHeight;    // R16F linear: height - SEA_LEVEL (coast, water depth)
uniform sampler2D uSurface;   // RGBA16F linear: RG blurred Sobel gradient per cell, B softly blurred height - SEA_LEVEL, A land nearness (sigma 3.5)
uniform sampler2D uBiomeColor; // RGBA8 linear: blurred land palette colour, A land coverage
uniform sampler2D uSeaDepth;  // R16F linear: smooth sea depth 0..DEPTH_MAX (shelf at coasts, even open sea)
uniform sampler2D uProvince;  // RGBA8: R,G id, B land. Owners where the screen shows land
uniform sampler2D uProvinceSea; // same, but A: the cell's own water class (1 land, 0.5 sea, 0 lake). Owners where the screen shows water
uniform sampler2D uPalette;   // ${PALETTE_SIZE}x1: rgb biome colour, a detail slot (255 = sea, 254 = lake)
uniform sampler2D uAtlas;     // 4x4 grayscale detail tiles, mipmapped
uniform sampler2D uProvData;  // RGBA8 per province id (row by row, uProvDataW wide): rgb fill, a flags

uniform vec4 uCam;        // centre x, y (cells), zoom (CSS px per cell), devicePixelRatio
uniform vec2 uView;       // viewport, CSS px
uniform vec2 uWorldSize;  // cells
uniform float uHovered;   // hovered province id, -1 = none
uniform float uFill;      // map mode fill strength over the relief, 0 = no fill (uProvData not read)
uniform float uProvDataW; // width of uProvData

const float HILL_REL = ${f(HILL_LEVEL - SEA_LEVEL)};
const float MOUNT_REL = ${f(MOUNTAIN_LEVEL - SEA_LEVEL)};
const float GRID = ${f(ATLAS_GRID)};
const float ATLAS_PX = ${f(ATLAS_PX)};
const float DETAIL_SPAN = ${f(DETAIL_SPAN_CELLS)};
const float PAPER_SPAN = ${f(PAPER_SPAN_CELLS)};
const float PAPER_SLOT = ${f(DetailSlot.PAPER)};
const float LAKE_SLOT = ${f(LAKE_SLOT)};
const float MAX_LOD = 5.0;
const float SLOT_GAIN[7] = float[7](${gains});
const int FLAG_FILL = ${PROVINCE_FLAGS.FILL};

const vec3 SEA_SHALLOW = ${glslVec3(MAP_COLORS.seaShallow)};
const vec3 SEA_DEEP = ${glslVec3(MAP_COLORS.seaDeep)};
const vec3 SEA_COAST = ${glslVec3(MAP_COLORS.seaCoast)};
const float DEPTH_MAX = ${f(SEA_DEPTH_MAX)};
const float TONE_K = ${f(DEPTH_TONE_K)};
const float DEPTH_STEP = ${f(SEA_DEPTH_STEP)};
const float WATER_GRAIN = ${f(WATER_GRAIN)}; // paper grain on water, share of the land grain
const vec3 LAKE_DEEP = ${glslVec3(MAP_COLORS.lakeDeep)};
const vec3 LAKE_SHALLOW = ${glslVec3(MAP_COLORS.lakeShallow)};
const vec3 COAST_LINE = ${glslVec3(MAP_COLORS.coastLine)};
const vec3 BORDER = ${glslVec3(MAP_COLORS.border)};
const vec3 VOID_COLOR = ${glslVec3(MAP_COLORS.void)};
const vec3 SNOW = ${glslVec3(MAP_COLORS.snow)};

// Light from the north-west (screen y points south), ~56 deg above the horizon.
const vec3 LIGHT = vec3(-0.4851, -0.4851, 0.7276);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
${WAVE_GLSL}
ivec2 cellAt(vec2 c) {
  return clamp(ivec2(floor(c)), ivec2(0), ivec2(uWorldSize) - 1);
}

float decodeId(vec4 t) {
  return round(t.r * 255.0) + round(t.g * 255.0) * 256.0;
}

// Mip level for a tile spanning 'span' cells: atlas texels per physical pixel.
float atlasLod(float span, float pxPerCell) {
  float texelsPerCell = ATLAS_PX / GRID / span;
  return log2(max(texelsPerCell / pxPerCell, 1e-4));
}

// Tile wrap via fract() with a half-texel inset at the chosen level: no bleeding into
// neighbouring tiles; explicit LOD keeps sampling valid after the fract() discontinuity.
float atlasSample(float slot, vec2 p, float span, float lod) {
  vec2 t = fract(p / span);
  float tile = 1.0 / GRID;
  float texel = exp2(lod) / ATLAS_PX;
  vec2 base = vec2(mod(slot, GRID), floor(slot / GRID)) * tile;
  return textureLod(uAtlas, base + 0.5 * texel + t * (tile - texel), lod).r;
}

// Map mode fill of a province, premultiplied: rgb colour * a, a = 1 if the mode fills it.
// Premultiplied, so blending a filled and an unfilled province across a border does not darken.
vec4 provFill(float id) {
  int i = int(id);
  int w = int(uProvDataW);
  vec4 d = texelFetch(uProvData, ivec2(i % w, i / w), 0);
  float on = (int(round(d.a * 255.0)) & FLAG_FILL) != 0 ? 1.0 : 0.0;
  return vec4(d.rgb * on, on);
}

// Palette slot of a cell (detail slot; sea and lake water are >= LAKE_SLOT, see textures.ts).
float slotAt(ivec2 c) {
  int code = int(round(texelFetch(uTerrain, c, 0).g * 255.0));
  return round(texelFetch(uPalette, ivec2(code, 0), 0).a * 255.0);
}

// Share of lake among the water cells around p (0 = sea, 1 = lake), from the cells' own biomes:
// bilinear over the 4 nearest cells; where those are all land (the smooth coastline can still show
// water there), over the 3x3 cells around p. Lakes and the sea never touch along a cell edge.
// cls: A of the sea owner map for the 4x4 cells of softSide (k = column + 4 * row, cell pc - 1 + k),
// already fetched there: 1 land biome, 0.5 sea, 0 lake (SEA_MAP_ALPHA in bake.ts). No fetches here.
float lakeShare(float cls[16], vec2 pc, vec2 pw, vec2 p) {
  float lakeW = 0.0;
  float waterW = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1), float(i >> 1));
    vec2 ow = mix(1.0 - pw, pw, o);
    float wgt = ow.x * ow.y + 1e-4;
    float a = cls[5 + (i & 1) + 4 * (i >> 1)];
    if (a < 0.75) {
      waterW += wgt;
      if (a < 0.25) lakeW += wgt;
    }
  }
  if (waterW == 0.0) {
    // The 3x3 cells around floor(p) lie inside the 4x4 block: floor(p) is pc or pc + 1 per axis.
    ivec2 base = ivec2(pc) - 1;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        ivec2 o = clamp(ivec2(floor(p + vec2(float(dx), float(dy)))) - base, ivec2(0), ivec2(3));
        float a = cls[o.x + 4 * o.y];
        if (a < 0.75) {
          waterW += 1.0;
          if (a < 0.25) lakeW += 1.0;
        }
      }
    }
  }
  return waterW > 0.0 ? lakeW / waterW : 0.0;
}

// Cubic B-spline weights of the 4 cells at offsets -1, 0, 1, 2 for the fraction t, and d/dt.
vec4 bspline(float t) {
  float s = 1.0 - t;
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(s * s * s, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
}

vec4 bsplineD(float t) {
  float s = 1.0 - t;
  return vec4(-0.5 * s * s, 1.5 * t * t - 2.0 * t, -1.5 * t * t + t + 0.5, 0.5 * t * t);
}

vec4 provAt(ivec2 c, bool landSide) {
  if (landSide) return texelFetch(uProvince, c, 0);
  return texelFetch(uProvinceSea, c, 0);
}

// Provinces on one side of the coastline, from that side's owner map.
struct Side {
  float best;   // province with the largest share around p, -1 = none
  float second; // runner-up, -1 = none
  float edgePx; // physical px to the equal-share line of best and second (>= 0)
  float hovPx;  // signed px to the edge of the hovered province (> 0 inside), -1e4 = not here
};

// Soft membership (mirrored on the CPU in softProvince.ts): the share of each province among the
// cells of this side in the 4x4 cells around p, cubic B-spline weights. The edge between two
// provinces is their equal-share line: smooth, not the cell staircase. Its distance in px comes
// from the analytic gradient of the shares, so no screen derivatives are needed. Candidates are
// the provinces of the 4 nearest cells. 16 texel fetches.
// Limits (same on the CPU): slivers a cell wide or thinner may vanish (their share never wins);
// at junctions of 4+ provinces a fifth one is not a candidate, a small seam is possible; the CPU
// coast side (exact half-float maths) may differ from the GPU one (filtering precision) by <= 1 px.
// cls receives the A channel of the 16 texels (on the sea side: water class for lakeShare).
Side softSide(bool landSide, vec2 pc, vec2 pw, float pxPerCell, out float cls[16]) {
  vec4 wx = bspline(pw.x);
  vec4 wy = bspline(pw.y);
  vec4 dx = bsplineD(pw.x);
  vec4 dy = bsplineD(pw.y);
  float ids[16];
  for (int k = 0; k < 16; k++) {
    vec4 t = provAt(cellAt(pc + vec2(float((k & 3) - 1), float((k >> 2) - 1))), landSide);
    ids[k] = (t.b > 0.5) == landSide ? decodeId(t) : -1.0;
    cls[k] = t.a;
  }
  vec4 cand = vec4(ids[5], ids[6], ids[9], ids[10]);
  float sum = 0.0;
  vec2 gSum = vec2(0.0);
  vec4 a = vec4(0.0);
  vec4 ax = vec4(0.0);
  vec4 ay = vec4(0.0);
  for (int k = 0; k < 16; k++) {
    if (ids[k] < 0.0) continue;
    float wgt = wx[k & 3] * wy[k >> 2];
    vec2 g = vec2(dx[k & 3] * wy[k >> 2], wx[k & 3] * dy[k >> 2]);
    sum += wgt;
    gSum += g;
    vec4 hit = vec4(equal(cand, vec4(ids[k])));
    a += hit * wgt;
    ax += hit * g.x;
    ay += hit * g.y;
  }
  Side r = Side(-1.0, -1.0, 1e4, -1e4);
  if (sum < 1e-4) return r;
  vec4 m = a / sum;
  vec4 mx = (ax * sum - a * gSum.x) / (sum * sum);
  vec4 my = (ay * sum - a * gSum.y) / (sum * sum);
  int b = -1;
  for (int c = 0; c < 4; c++) {
    if (cand[c] >= 0.0 && (b < 0 || m[c] > m[b])) b = c;
  }
  if (b < 0) return r;
  r.best = cand[b];
  int s = -1;
  for (int c = 0; c < 4; c++) {
    if (cand[c] >= 0.0 && cand[c] != r.best && (s < 0 || m[c] > m[s])) s = c;
  }
  if (s >= 0) {
    r.second = cand[s];
    r.edgePx = (m[b] - m[s]) / max(length(vec2(mx[b] - mx[s], my[b] - my[s])), 1e-3) * pxPerCell;
  }
  // Hovered province: inside where its share is the largest, edge at equal share with the leader
  // of the rest (the same line the fill and the border use).
  int hv = -1;
  for (int c = 0; c < 4; c++) {
    if (cand[c] == uHovered && cand[c] >= 0.0) hv = c;
  }
  if (hv >= 0) {
    if (hv == b || cand[hv] == r.best) {
      r.hovPx = r.edgePx;
    } else {
      r.hovPx = (m[hv] - m[b]) / max(length(vec2(mx[hv] - mx[b], my[hv] - my[b])), 1e-3) * pxPerCell;
    }
  }
  return r;
}

// Map mode fill on one side: best province, blended into the runner-up across 1 px at their edge.
vec4 sideFill(Side sd) {
  if (sd.best < 0.0) return vec4(0.0);
  vec4 own = provFill(sd.best);
  if (sd.second < 0.0) return own;
  return mix(provFill(sd.second), own, clamp(sd.edgePx + 0.5, 0.0, 1.0));
}

void main() {
  float zoom = uCam.z;
  float pxPerCell = zoom * uCam.w;
  vec2 p = uCam.xy + (vUV * uView - 0.5 * uView) / zoom;
  vec2 inv = 1.0 / uWorldSize;
  vec2 uv = p * inv;

  vec2 pc = floor(p - 0.5);
  vec2 pw = p - 0.5 - pc;

  // ---- raw height (relief, snow), CPU-baked smooth gradient (hillshade), soft coast height
  float h = texture(uHeight, uv).r;
  vec4 surf = texture(uSurface, uv);
  vec2 grad = surf.rg;
  // Coastline from the lightly blurred height: the raw shore is near-binary (+-SHORE_DELTA),
  // whose bilinear isoline zigzags cell by cell on diagonal coasts.
  float hc = surf.b;
  float coastPx = hc / max(length(vec2(dFdx(hc), dFdy(hc))), 1e-7);
  float landMask = clamp(coastPx + 0.5, 0.0, 1.0);

  // ---- provinces: land shows the land owner map, water the sea owner map, so each side reaches
  // the smooth coastline with a province of its own medium. Both sides only in the ~1 px
  // anti-aliasing band of the coastline; elsewhere one side (16 fetches).
  bool showLand = landMask > 0.0;
  bool showSea = landMask < 1.0;
  Side sl = Side(-1.0, -1.0, 1e4, -1e4);
  Side ss = sl;
  float landCls[16];
  float seaCls[16];
  if (showLand) sl = softSide(true, pc, pw, pxPerCell, landCls);
  if (showSea) ss = softSide(false, pc, pw, pxPerCell, seaCls);

  // ---- map mode fill: switches between provinces on their smooth equal-share line.
  vec4 landFill = vec4(0.0);
  vec4 seaFill = vec4(0.0);
  if (uFill > 0.0) {
    if (showLand) landFill = sideFill(sl);
    if (showSea) seaFill = sideFill(ss);
  }

  // ---- land: only where land shows. At landMask 0 the land colour is multiplied by 0 below
  // (mix(water, land, 0.0) is exactly water), so skipping it there leaves the picture identical.
  // No screen derivatives inside the branch: the coastline's dFdx/dFdy are taken above, and the
  // textures read here have no mipmaps, so textureLod(..., 0.0) equals the former texture().
  vec3 land = vec3(0.0);
  if (landMask > 0.0) {
    // Colour: CPU-blurred biome colours (sigma 1.2 cells) looked up at a noise-warped position
    // (up to ~1.2 cells), so transitions are soft and never align to the cell grid.
    vec2 warp = vec2(vnoise(p * 0.23), vnoise(p * 0.23 + vec2(17.3, 5.9))) - 0.5;
    warp += 0.45 * (vec2(vnoise(p * 0.9 + 3.1), vnoise(p * 0.9 + vec2(9.7, 1.3))) - 0.5);
    warp *= 1.6;
    land = textureLod(uBiomeColor, (p + warp) * inv, 0.0).rgb;
    // Fill replaces part of the biome tint; detail, moisture and hillshade still apply on top.
    land = land * (1.0 - uFill * landFill.a) + uFill * landFill.rgb;

    // Detail luminance: slots of the 4 cells around the same warped point, bilinear weights.
    vec2 bq = p - 0.5 + warp;
    vec2 bc = floor(bq);
    vec2 bw = bq - bc;
    float lodRaw = atlasLod(DETAIL_SPAN, pxPerCell);
    float lod = clamp(lodRaw, 0.0, MAX_LOD);
    float wSum = 0.0;
    float detail = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i & 1), float(i >> 1));
      vec2 ow = mix(1.0 - bw, bw, o);
      float wgt = ow.x * ow.y;
      float slot = slotAt(cellAt(bc + o));
      if (slot < LAKE_SLOT - 0.5) {
        wSum += wgt;
        detail += wgt * (atlasSample(slot, p, DETAIL_SPAN, lod) - 0.5) * SLOT_GAIN[int(slot)];
      }
    }
    detail = detail / max(wSum, 1e-4) * (1.0 - smoothstep(3.5, 5.0, lodRaw));
    float moisture = textureLod(uTerrain, uv, 0.0).b;
    land *= mix(vec3(1.03, 1.01, 0.95), vec3(0.98, 1.0, 1.01), moisture);
    land *= 1.0 + detail;
  }
  // Snow and hillshade stay outside the branch: plain arithmetic, no fetches, and moving them in
  // let the compiler reorder the maths so a few pixels per million changed by 1/255.
  land = mix(land, SNOW, 0.3 * smoothstep(0.40, 0.48, h));

  // ---- hillshade: gentle on plains, exaggerated on hills and mountains
  float relief = smoothstep(HILL_REL - 0.06, MOUNT_REL, h);
  float k = mix(22.0, 34.0, relief);
  vec3 n = normalize(vec3(-grad * k, 1.0));
  // Soft compressor instead of a hard clamp: no flat-toned facets at the extremes.
  float s = dot(n, LIGHT) / LIGHT.z;
  float shade = 1.0 + 0.35 * tanh((s - 1.0) / 0.35);
  land *= mix(1.0, shade, 0.8);
  land *= 1.0 + (shade - 1.0) * vec3(0.06, 0.0, -0.06);

  // ---- sea: tone by the real seafloor depth, smoothed at large scale only (sigma 20 cells on a
  // 4x coarser grid, land left out; smoothSeaDepth): wide light water only over really shallow
  // floor (continental shelves), dark even mid-ocean, no halo around islands. Half of the tone
  // change within the first 25% of the depth (depthTone). Near land only a narrow lighter band
  // (~2-4 cells: near is ~0.5 on a straight coastline, ~0.28 two cells out, ~0.15 four out).
  // Lakes: own lighter, greener tint, no depth tone, the shore band within ~2 cells.
  float near = surf.a;
  float depth = texture(uSeaDepth, p / (vec2(textureSize(uSeaDepth, 0)) * DEPTH_STEP)).r;
  float t = clamp(depth / DEPTH_MAX, 0.0, 1.0);
  vec3 water = mix(SEA_SHALLOW, SEA_DEEP, t * (1.0 + TONE_K) / (t + TONE_K));
  water = mix(water, SEA_COAST, smoothstep(0.12, 0.5, near));
  // Lake share only where water shows at all (seaCls is filled there): at landMask 1 the water
  // colour is multiplied by 0 below, so skipping it there leaves the picture identical.
  float lake = showSea ? lakeShare(seaCls, pc, pw, p) : 0.0;
  if (lake > 0.0) water = mix(water, mix(LAKE_DEEP, LAKE_SHALLOW, smoothstep(0.28, 0.5, near)), lake);
  // Static ripple (seaWaves.ts), only where water shows; lakes calmer, at half amplitude.
  if (landMask < 1.0) water *= 1.0 + waveShade(p, zoom, pxPerCell) * (1.0 - 0.5 * lake);
  water = water * (1.0 - uFill * seaFill.a) + uFill * seaFill.rgb;

  vec3 col = mix(water, land, landMask);

  // ---- coastline: thin dark line on the SEA_LEVEL isoline, anti-aliased in screen space
  float coastW = uCam.w * clamp(0.6 + 0.07 * zoom, 0.8, 1.5);
  float coastLine = 1.0 - smoothstep(max(0.5 * coastW - 0.5, 0.0), 0.5 * coastW + 0.5, abs(coastPx));
  col = mix(col, COAST_LINE, 0.6 * coastLine);

  // ---- province borders: thin line on the equal-share line of each side (land-sea borders are
  // left to the coastline: each side only sees provinces of its own medium).
  float borderW = uCam.w;
  float lo = max(0.5 * borderW - 0.5, 0.0);
  float hi = 0.5 * borderW + 0.5;
  float lineLand = 1.0 - smoothstep(lo, hi, sl.edgePx);
  float lineSea = 1.0 - smoothstep(lo, hi, ss.edgePx);
  float zoomFade = mix(0.08, 1.0, smoothstep(0.9, 3.5, zoom));
  float borderA = zoomFade * (0.35 * landMask * lineLand + 0.15 * (1.0 - landMask) * lineSea);
  col = mix(col, BORDER, borderA);

  // ---- hover: soft edge (~6 px) on the same line; at the coast the coastline cuts it.
  float hovered = 0.0;
  if (uHovered >= 0.0) {
    float hovL = clamp(sl.hovPx / 3.0 + 0.5, 0.0, 1.0);
    float hovS = clamp(ss.hovPx / 3.0 + 0.5, 0.0, 1.0);
    hovered = mix(hovS, hovL, landMask);
  }
  col = mix(col, vec3(1.0), 0.13 * hovered);

  // ---- paper grain over land and, at 35% strength, over water (calm, even sea)
  float paperLod = clamp(atlasLod(PAPER_SPAN, pxPerCell), 0.0, MAX_LOD);
  float paper = atlasSample(PAPER_SLOT, p, PAPER_SPAN, paperLod) - 0.5;
  float mottle = vnoise(p / 70.0) + 0.5 * vnoise(p / 23.0) - 0.75;
  col *= 1.0 + mix(WATER_GRAIN, 1.0, landMask) * (paper * SLOT_GAIN[int(PAPER_SLOT)] + 0.035 * mottle);

  // ---- outside the map
  vec2 edge = min(p, uWorldSize - p);
  float inside = clamp(min(edge.x, edge.y) * pxPerCell + 0.5, 0.0, 1.0);
  finalColor = vec4(mix(VOID_COLOR, col, inside), 1.0);
}
`;
