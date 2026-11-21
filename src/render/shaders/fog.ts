// Fog of war and own-province GLSL, injected into MAP_FRAGMENT (mapShader.ts) after SOFT_GLSL and
// into the river fog filter (fogLayer.ts). Needs bspline (BSPLINE_GLSL),
// uProvince, uProvinceSea, uWorldSize and uProvDataW.
import { MAP_COLORS, glslVec3 } from '../palette';

export const FOG_GLSL = /* glsl */ `
uniform sampler2D uProvState; // RGBA8 per province id, same layout as uProvData: R fog visibility, G own
uniform float uFogOn;         // 1 = fog shown, 0 = the whole map visible (uProvState R not read)

const vec3 FOG_TINT = ${glslVec3(MAP_COLORS.fog)};
const float FOG_MID = 0.28;     // fog mid-tone luminance
const float FOG_CONTRAST = 0.28; // share of the original luminance contrast kept under fog
const float FOG_KNEE = 0.4;      // luminance above which highlights are compressed under fog
const vec3 PLAYER = ${glslVec3(MAP_COLORS.player)};

vec4 provState(float id) {
  int i = int(id);
  int w = int(uProvDataW);
  return texelFetch(uProvState, ivec2(i % w, i / w), 0);
}

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

// Lattice step of the visibility field in cells: a cubic B-spline over the province ids of every
// FOG_STEP-th cell of one side's display owner map. A step of 1 left the cell staircase of province
// outlines visible on the large seen-unseen contrast; at 2 the edge is smooth and ~6 cells wide.
const float FOG_STEP = 2.0;

// Seen share 0..1 at world point p. The field v is C2-smooth (fixed world lattice, B-spline
// weights), so nothing jumps; a low-frequency warp shifts the edge by up to ~1.5 cells, only inside
// the transition, so fully seen and fully unknown areas stay exact. Reads like faded ink.
// landSide picks the owner map: land pixels read the land map, water pixels the sea map, so the
// field never crosses the coastline (the coastline itself is the edge there, antialiased by the
// caller). One shared field leaked: shore water took land ids (a seen lake stayed fogged) or,
// with water ids, a seen sea lit a pale beach strip of unknown land.
// 32 texel fetches; the map shader and the river fog filter share it, so their edges match.
float fogSeen(vec2 p, bool landSide) {
  vec2 q = (p - 0.5) / FOG_STEP;
  vec2 qc = floor(q);
  vec4 wx = bspline(q.x - qc.x);
  vec4 wy = bspline(q.y - qc.y);
  float v = 0.0;
  for (int k = 0; k < 16; k++) {
    vec2 lat = (qc + vec2(float((k & 3) - 1), float((k >> 2) - 1))) * FOG_STEP;
    ivec2 cell = clamp(ivec2(lat), ivec2(0), ivec2(uWorldSize) - 1);
    vec4 t = landSide ? texelFetch(uProvince, cell, 0) : texelFetch(uProvinceSea, cell, 0);
    float id = round(t.r * 255.0) + round(t.g * 255.0) * 256.0;
    v += wx[k & 3] * wy[k >> 2] * provState(id).r;
  }
  float n = fogNoise(p * 0.11) + 0.5 * fogNoise(p * 0.29 + vec2(7.3, 2.1)) - 0.75;
  float t = clamp(v + 1.6 * n * v * (1.0 - v), 0.0, 1.0);
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

// Own-province line on one side: 1 on the equal-share line where exactly one of best/second is own.
float ownLine(float best, float second, float edgePx, float lo, float hi) {
  if (best < 0.0 || second < 0.0) return 0.0;
  bool ob = provState(best).g > 0.5;
  bool os = provState(second).g > 0.5;
  return ob != os ? 1.0 - smoothstep(lo, hi, edgePx) : 0.0;
}
`;
