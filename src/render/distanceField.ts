const INF = 1e12;

/** Felzenszwalb-Huttenlocher 1D squared distance transform, in place on `f` (stride-aware). */
function dt1d(
  f: Float32Array,
  offset: number,
  stride: number,
  n: number,
  v: Int32Array,
  z: Float32Array,
  d: Float32Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    const fq = f[offset + q * stride] as number;
    let p = v[k] as number;
    let s = (fq + q * q - ((f[offset + p * stride] as number) + p * p)) / (2 * q - 2 * p);
    while (s <= (z[k] as number)) {
      k--;
      p = v[k] as number;
      s = (fq + q * q - ((f[offset + p * stride] as number) + p * p)) / (2 * q - 2 * p);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] as number) < q) k++;
    const p = v[k] as number;
    d[q] = (q - p) * (q - p) + (f[offset + p * stride] as number);
  }
  for (let q = 0; q < n; q++) f[offset + q * stride] = d[q] as number;
}

/**
 * Distance (in cell units) from each cell center to the nearest border point.
 * Border points lie midway between 4-adjacent cells of different provinces.
 * Computed as an exact EDT on a 2x grid (cell centers at even coordinates).
 */
export function borderDistance(provinceOf: Uint16Array, w: number, h: number): Float32Array {
  const gw = 2 * w;
  // Column pass. The input is binary (0 on border points, INF elsewhere), so the 1D transform
  // along a column is just the squared distance to the nearest zero in that column: two linear
  // scans instead of the parabola envelope. Only even grid rows (cell centres) are kept, as the
  // row pass needs nothing else. The scans run row by row, so memory access stays sequential.
  // Grid column 2x (cell centres) has zeros on odd rows 2y+1 where cells (x,y) and (x,y+1) differ;
  // grid column 2x+1 has zeros on even rows 2y where cells (x,y) and (x+1,y) differ.
  const g = new Float32Array(gw * h);
  const NONE = -1e9;
  const last = new Float64Array(gw).fill(NONE);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const gy = 2 * y;
    const o = y * gw;
    for (let x = 0; x < w; x++) {
      const p = provinceOf[row + x] as number;
      if (x + 1 < w && p !== provinceOf[row + x + 1]) last[2 * x + 1] = gy;
    }
    for (let gx = 0; gx < gw; gx++) g[o + gx] = gy - (last[gx] as number);
    if (y + 1 < h) {
      const below = row + w;
      for (let x = 0; x < w; x++) {
        if (provinceOf[row + x] !== provinceOf[below + x]) last[2 * x] = gy + 1;
      }
    }
  }
  last.fill(-NONE);
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    const gy = 2 * y;
    const o = y * gw;
    if (y + 1 < h) {
      const below = row + w;
      for (let x = 0; x < w; x++) {
        if (provinceOf[row + x] !== provinceOf[below + x]) last[2 * x] = gy + 1;
      }
    }
    for (let x = 0; x + 1 < w; x++) {
      if (provinceOf[row + x] !== provinceOf[row + x + 1]) last[2 * x + 1] = gy;
    }
    for (let gx = 0; gx < gw; gx++) {
      const up = g[o + gx] as number;
      const down = (last[gx] as number) - gy;
      const dd = up < down ? up : down;
      g[o + gx] = dd >= -NONE / 2 ? INF : dd * dd;
    }
  }
  const v = new Int32Array(gw);
  const z = new Float32Array(gw + 1);
  const d = new Float32Array(gw);
  const out = new Float32Array(w * h);
  const cap = w + h;
  for (let y = 0; y < h; y++) {
    dt1d(g, y * gw, 1, gw, v, z, d);
    for (let x = 0; x < w; x++) {
      const sq = g[y * gw + 2 * x] as number;
      out[y * w + x] = sq >= INF / 2 ? cap : Math.sqrt(sq) / 2;
    }
  }
  return out;
}
