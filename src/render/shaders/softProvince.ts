// Soft province membership GLSL, injected into MAP_FRAGMENT (mapShader.ts). Needs cellAt, decodeId,
// uProvince, uProvinceSea and uHovered from the map shader. CPU mirror: ../softProvince.ts.
/** Cubic B-spline weights, shared with the fog (shaders/fog.ts). */
export const BSPLINE_GLSL = /* glsl */ `
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
`;

export const SOFT_GLSL = /* glsl */ `
${BSPLINE_GLSL}
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
`;
