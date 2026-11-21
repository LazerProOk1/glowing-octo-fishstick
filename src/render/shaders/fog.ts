// Fog of war and own-province GLSL. FOG_STATE_GLSL (province state lookup, own line) goes into
// MAP_FRAGMENT (mapShader.ts) and the fog field pass (fogLayer.ts); needs uProvDataW.
// FOG_GLSL (the seen field, fogged colour) goes into MAP_FRAGMENT and the river fog filter;
// needs bspline (BSPLINE_GLSL) and uWorldSize.
import { MAP_COLORS, glslVec3 } from '../palette';

export const FOG_STATE_GLSL = /* glsl */ `
uniform sampler2D uProvState; // RGBA8 per province id, same layout as uProvData: R fog visibility, G own

const vec3 PLAYER = ${glslVec3(MAP_COLORS.player)};

vec4 provState(float id) {
  int i = int(id);
  int w = int(uProvDataW);
  return texelFetch(uProvState, ivec2(i % w, i / w), 0);
}

// Own-province line on one side: 1 on the equal-share line where exactly one of best/second is own.
float ownLine(float best, float second, float edgePx, float lo, float hi) {
  if (best < 0.0 || second < 0.0) return 0.0;
  bool ob = provState(best).g > 0.5;
  bool os = provState(second).g > 0.5;
  return ob != os ? 1.0 - smoothstep(lo, hi, edgePx) : 0.0;
}
`;

/**
 * Lattice step of the visibility field in cells: a cubic B-spline over the visibility of every
 * FOG_STEP-th cell of one side's display owner map. A step of 1 left the cell staircase of province
 * outlines visible on the large seen-unseen contrast; at 2 the edge is smooth and ~6 cells wide.
 */
export const FOG_STEP = 2;

/**
 * Size of the fog field texture for a map of w×h cells: texel j holds the lattice point at cell
 * min(FOG_STEP·j, w − 1); one texel past the last lattice point inside the map, so clamp-to-edge
 * sampling clamps exactly like the cell clamp of the per-pixel field it replaced.
 */
export function fogFieldSize(w: number, h: number): { w: number; h: number } {
  const n = (s: number): number => Math.floor((s - 1) / FOG_STEP) + 2;
  return { w: n(w), h: n(h) };
}

// The fog field pass: one fragment per lattice point, R land visibility, G sea visibility.
// Rendered into a small texture only when the visibility changes (fogLayer.ts).
export const FOG_FIELD_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

out vec4 finalColor;

uniform sampler2D uProvince;
uniform sampler2D uProvinceSea;
uniform vec2 uWorldSize;
uniform float uProvDataW;
${FOG_STATE_GLSL}
float visAt(vec4 t) {
  return provState(round(t.r * 255.0) + round(t.g * 255.0) * 256.0).r;
}

void main() {
  ivec2 cell = min(ivec2(gl_FragCoord.xy) * ${FOG_STEP}, ivec2(uWorldSize) - 1);
  finalColor = vec4(visAt(texelFetch(uProvince, cell, 0)), visAt(texelFetch(uProvinceSea, cell, 0)), 0.0, 1.0);
}
`;

export const FOG_GLSL = /* glsl */ `
uniform sampler2D uFogField; // RGBA8 linear, fogFieldSize: R land, G sea visibility per lattice point
uniform float uFogOn;        // 1 = fog shown, 0 = the whole map visible (uFogField not read)

const vec3 FOG_TINT = ${glslVec3(MAP_COLORS.fog)};
const float FOG_MID = 0.28;     // fog mid-tone luminance
const float FOG_CONTRAST = 0.28; // share of the original luminance contrast kept under fog
const float FOG_KNEE = 0.4;      // luminance above which highlights are compressed under fog
const float FOG_STEP = ${FOG_STEP.toFixed(1)};

// Value noise on an integer hash. The float hash12/vnoise of the map shader is chaotic in its
// input: the GPU rounds the same lattice point differently from neighbouring cells, so at the
// strength the fog warp needs it showed hard straight seams along the noise grid.
float fogHash(ivec2 c) {
  uvec2 q = uvec2(c) * uvec2(1597334673u, 3812015801u);
  return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967295.0);
}

float fogNoise(vec2 p) {
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  ivec2 c = ivec2(floor(p));
  float a = fogHash(c);
  float b = fogHash(c + ivec2(1, 0));
  float d = fogHash(c + ivec2(0, 1));
  float e = fogHash(c + ivec2(1, 1));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

// Seen share 0..1 at world point p, x on the land side, y on the sea side. The field v is a cubic
// B-spline over the lattice of uFogField (C2-smooth, nothing jumps), taken as 4 bilinear fetches:
// each pair of B-spline weights on an axis is one linear tap at the weighted position. A
// low-frequency warp shifts the edge by up to ~1.5 cells, only inside the transition, so fully
// seen and fully unknown areas stay exact. Reads like faded ink.
// The caller picks the side: land pixels the land field, water pixels the sea field, so the field
// never crosses the coastline (the coastline itself is the edge there, antialiased by the caller).
// One shared field leaked: shore water took land ids (a seen lake stayed fogged) or, with water
// ids, a seen sea lit a pale beach strip of unknown land.
// 4 texture fetches; the map shader and the river fog filter share it, so their edges match.
vec2 fogSeen(vec2 p) {
  vec2 q = (p - 0.5) / FOG_STEP;
  vec2 qc = floor(q);
  vec2 f = q - qc;
  vec4 wx = bspline(f.x);
  vec4 wy = bspline(f.y);
  vec2 g0 = vec2(wx.x + wx.y, wy.x + wy.y);
  vec2 g1 = 1.0 - g0;
  vec2 inv = 1.0 / vec2(textureSize(uFogField, 0));
  vec2 t0 = (qc - 0.5 + vec2(wx.y, wy.y) / g0) * inv;
  vec2 t1 = (qc + 1.5 + vec2(wx.w, wy.w) / g1) * inv;
  vec2 v = g0.y * (g0.x * texture(uFogField, t0).rg + g1.x * texture(uFogField, vec2(t1.x, t0.y)).rg)
    + g1.y * (g0.x * texture(uFogField, vec2(t0.x, t1.y)).rg + g1.x * texture(uFogField, t1).rg);
  float n = fogNoise(p * 0.11) + 0.5 * fogNoise(p * 0.29 + vec2(7.3, 2.1)) - 0.75;
  vec2 t = clamp(v + 1.6 * n * v * (1.0 - v), 0.0, 1.0);
  return smoothstep(0.1, 0.9, t);
}

// Unknown land and sea: strongly desaturated and darkened (Europa Universalis style); luminance is
// kept, so hillshade, coastline and paper grain still read.
vec3 fogged(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Luminance compressed toward one dim mid-tone: shallow rims, coasts and land read as one paper
  // (kept luminance left a bright rim around every island and lake), relief stays guessable.
  // Highlights above FOG_KNEE are halved first: shallow lake and sea rims are the brightest thing
  // on the map and still read as a pale ring under fog; darker relief keeps its full contrast.
  float f = mix(FOG_MID, l - 0.5 * max(l - FOG_KNEE, 0.0), FOG_CONTRAST);
  return mix(mix(vec3(f), c * (f / max(l, 1e-3)), 0.06), FOG_TINT, 0.16);
}
`;
