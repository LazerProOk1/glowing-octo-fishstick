import { ATLAS_GRID, DetailSlot } from './assets';
import { MAP_COLORS, PALETTE, glslVec3 } from './palette';
import { HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL } from '../sim/world/types';
import { WATER_SLOT } from './textures';

/** Число как литерал GLSL float. */
const f = (n: number): string => n.toFixed(4);

/** Сторона атласа в пикселях и размах одного тайла в клетках мира. */
export const ATLAS_PX = 2048;
export const DETAIL_SPAN_CELLS = 32;
export const PAPER_SPAN_CELLS = 48;

/**
 * Усиление детали по слоту: (яркость − 0.5) · gain даёт ≈ ±10% на 2σ.
 * σ слотов измерены по atlas.png: трава 0.086, лес 0.094, песок 0.062, камень 0.110,
 * снег 0.048, грязь 0.070, бумага 0.039 (бумага — ≈ ±3%).
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
uniform sampler2D uSurface;   // RGBA16F linear: RG blurred Sobel gradient per cell, B softly blurred height - SEA_LEVEL
uniform sampler2D uProvince;  // RGBA8: R,G id, B land
uniform sampler2D uBorder;    // RGBA8: R distance * 32
uniform sampler2D uPalette;   // 16x1: rgb biome colour, a detail slot (255 = water)
uniform sampler2D uAtlas;     // 4x4 grayscale detail tiles, mipmapped

uniform vec4 uCam;        // centre x, y (cells), zoom (CSS px per cell), devicePixelRatio
uniform vec2 uView;       // viewport, CSS px
uniform vec2 uWorldSize;  // cells
uniform float uHovered;   // hovered province id, -1 = none

const float HILL_REL = ${f(HILL_LEVEL - SEA_LEVEL)};
const float MOUNT_REL = ${f(MOUNTAIN_LEVEL - SEA_LEVEL)};
const float GRID = ${f(ATLAS_GRID)};
const float ATLAS_PX = ${f(ATLAS_PX)};
const float DETAIL_SPAN = ${f(DETAIL_SPAN_CELLS)};
const float PAPER_SPAN = ${f(PAPER_SPAN_CELLS)};
const float PAPER_SLOT = ${f(DetailSlot.PAPER)};
const float WATER_SLOT = ${f(WATER_SLOT)};
const float MAX_LOD = 5.0;
const float SLOT_GAIN[7] = float[7](${gains});

const vec3 DEEP = ${glslVec3(MAP_COLORS.waterDeep)};
const vec3 SHALLOW = ${glslVec3(MAP_COLORS.waterShallow)};
const vec3 BEACH = ${glslVec3(MAP_COLORS.beach)};
const vec3 COAST_LINE = ${glslVec3(MAP_COLORS.coastLine)};
const vec3 BORDER = ${glslVec3(MAP_COLORS.border)};
const vec3 VOID_COLOR = ${glslVec3(MAP_COLORS.void)};
const vec3 SNOW = ${glslVec3(PALETTE.glacier)};

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

float bilin(vec4 v, vec2 w) {
  return mix(mix(v.x, v.y, w.x), mix(v.z, v.w, w.x), w.y);
}

// Signed distance in physical px to the zero crossing of a bilinear field (corners 00,10,01,11).
float zeroDistPx(vec4 v, vec2 w, float pxPerCell) {
  vec2 g = vec2(mix(v.y - v.x, v.w - v.z, w.y), mix(v.z - v.x, v.w - v.y, w.x));
  return bilin(v, w) / max(length(g), 0.05) * pxPerCell;
}

void main() {
  float zoom = uCam.z;
  float pxPerCell = zoom * uCam.w;
  vec2 p = uCam.xy + (vUV * uView - 0.5 * uView) / zoom;
  vec2 inv = 1.0 / uWorldSize;
  vec2 uv = p * inv;

  // ---- raw height (relief, snow), CPU-baked smooth gradient (hillshade), soft coast height
  float h = texture(uHeight, uv).r;
  vec3 surf = texture(uSurface, uv).rgb;
  vec2 grad = surf.rg;
  // Coastline from the lightly blurred height: the raw shore is near-binary (+-SHORE_DELTA),
  // whose bilinear isoline zigzags cell by cell on diagonal coasts.
  float hc = surf.b;
  float coastPx = hc / max(length(vec2(dFdx(hc), dFdy(hc))), 1e-7);
  float landMask = clamp(coastPx + 0.5, 0.0, 1.0);

  // ---- land colour: palette + detail of the 4 nearest cells, bilinear with noise-warped weights
  vec2 warp = vec2(vnoise(p * 0.31), vnoise(p * 0.31 + vec2(17.3, 5.9))) - 0.5;
  warp += 0.5 * (vec2(vnoise(p * 1.13 + 3.1), vnoise(p * 1.13 + vec2(9.7, 1.3))) - 0.5);
  vec2 bq = p - 0.5 + 0.9 * warp;
  vec2 bc = floor(bq);
  vec2 bw = smoothstep(0.1, 0.9, bq - bc);
  float lodRaw = atlasLod(DETAIL_SPAN, pxPerCell);
  float lod = clamp(lodRaw, 0.0, MAX_LOD);
  vec3 landSum = vec3(0.0);
  float wSum = 0.0;
  float detail = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1), float(i >> 1));
    vec2 ow = mix(1.0 - bw, bw, o);
    float wgt = ow.x * ow.y;
    int code = int(round(texelFetch(uTerrain, cellAt(bc + o), 0).g * 255.0));
    vec4 pal = texelFetch(uPalette, ivec2(code, 0), 0);
    float slot = round(pal.a * 255.0);
    if (slot < WATER_SLOT - 0.5) {
      landSum += wgt * pal.rgb;
      wSum += wgt;
      detail += wgt * (atlasSample(slot, p, DETAIL_SPAN, lod) - 0.5) * SLOT_GAIN[int(slot)];
    }
  }
  // Thin land past the coast isoline may have only water among its 4 cells: borrow the
  // average land colour of the surrounding 4x4 ring instead of a flat fallback.
  vec3 fallback = BEACH;
  if (wSum < 0.15) {
    vec3 ringSum = vec3(0.0);
    float ringN = 0.0;
    for (int j = 0; j < 16; j++) {
      vec2 o = vec2(float(j & 3) - 1.0, float(j >> 2) - 1.0);
      int code = int(round(texelFetch(uTerrain, cellAt(bc + o), 0).g * 255.0));
      vec4 pal = texelFetch(uPalette, ivec2(code, 0), 0);
      if (pal.a * 255.0 < WATER_SLOT - 0.5) {
        ringSum += pal.rgb;
        ringN += 1.0;
      }
    }
    if (ringN > 0.0) fallback = ringSum / ringN;
  }
  vec3 land = mix(fallback, landSum / max(wSum, 1e-4), smoothstep(0.0, 0.15, wSum));
  detail = detail / max(wSum, 1e-4) * (1.0 - smoothstep(3.5, 5.0, lodRaw));
  float moisture = texture(uTerrain, uv).b;
  land *= mix(vec3(1.03, 1.01, 0.95), vec3(0.98, 1.0, 1.01), moisture);
  land *= 1.0 + detail;
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

  // ---- water: depth tint, lighter shallow halo, faint large-scale variation
  float depth = max(-hc, 0.0);
  vec3 water = mix(SHALLOW, DEEP, smoothstep(0.0, 0.05, depth));
  water *= 1.0 - 0.08 * smoothstep(0.05, 0.35, depth);
  float halo = 1.0 - smoothstep(0.0, 0.012, depth);
  water = mix(water, mix(SHALLOW, vec3(1.0), 0.1), 0.35 * halo);
  water *= 1.0 + (vnoise(p / 90.0) - 0.5) * 0.04;

  vec3 col = mix(water, land, landMask);

  // ---- coastline: thin dark line on the SEA_LEVEL isoline, anti-aliased in screen space
  float coastW = uCam.w * clamp(0.6 + 0.07 * zoom, 0.8, 1.5);
  float coastLine = 1.0 - smoothstep(max(0.5 * coastW - 0.5, 0.0), 0.5 * coastW + 0.5, abs(coastPx));
  col = mix(col, COAST_LINE, 0.6 * coastLine);

  // ---- provinces: signed bilinear distance relative to the own province (no staircase)
  vec2 pc = floor(p - 0.5);
  vec2 pw = p - 0.5 - pc;
  vec4 ownT = texelFetch(uProvince, cellAt(p), 0);
  float ownId = decodeId(ownT);
  bool ownLand = ownT.b > 0.5;
  vec4 vb;
  vec4 vh;
  for (int i = 0; i < 4; i++) {
    ivec2 c = cellAt(pc + vec2(float(i & 1), float(i >> 1)));
    vec4 t = texelFetch(uProvince, c, 0);
    float id = decodeId(t);
    float d = texelFetch(uBorder, c, 0).r * 255.0 / 32.0;
    // Land-sea borders are left to the coastline.
    bool same = id == ownId || ((t.b > 0.5) != ownLand);
    vb[i] = same ? d : -d;
    vh[i] = id == uHovered ? d : -d;
  }
  float borderW = uCam.w;
  float borderPx = abs(zeroDistPx(vb, pw, pxPerCell));
  float line = 1.0 - smoothstep(max(0.5 * borderW - 0.5, 0.0), 0.5 * borderW + 0.5, borderPx);
  float zoomFade = mix(0.08, 1.0, smoothstep(0.9, 3.5, zoom));
  float borderA = line * zoomFade * (ownLand ? 0.35 * landMask : 0.15 * (1.0 - landMask));
  col = mix(col, BORDER, borderA);

  float hovered = clamp(zeroDistPx(vh, pw, pxPerCell) + 0.5, 0.0, 1.0);
  col = mix(col, vec3(1.0), 0.13 * hovered);

  // ---- paper grain over land and water
  float paperLod = clamp(atlasLod(PAPER_SPAN, pxPerCell), 0.0, MAX_LOD);
  float paper = atlasSample(PAPER_SLOT, p, PAPER_SPAN, paperLod) - 0.5;
  float mottle = vnoise(p / 70.0) + 0.5 * vnoise(p / 23.0) - 0.75;
  col *= 1.0 + paper * SLOT_GAIN[int(PAPER_SLOT)] + 0.035 * mottle;

  // ---- outside the map
  vec2 edge = min(p, uWorldSize - p);
  float inside = clamp(min(edge.x, edge.y) * pxPerCell + 0.5, 0.0, 1.0);
  finalColor = vec4(mix(VOID_COLOR, col, inside), 1.0);
}
`;
