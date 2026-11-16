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
  const gh = 2 * h;
  const g = new Float32Array(gw * gh).fill(INF);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = provinceOf[y * w + x] as number;
      if (x + 1 < w && p !== provinceOf[y * w + x + 1]) g[2 * y * gw + 2 * x + 1] = 0;
      if (y + 1 < h && p !== provinceOf[(y + 1) * w + x]) g[(2 * y + 1) * gw + 2 * x] = 0;
    }
  }
  const m = Math.max(gw, gh);
  const v = new Int32Array(m);
  const z = new Float32Array(m + 1);
  const d = new Float32Array(m);
  // Columns pass over all grid columns; rows pass only for even rows (the outputs).
  for (let x = 0; x < gw; x++) dt1d(g, x, gw, gh, v, z, d);
  const out = new Float32Array(w * h);
  const cap = w + h;
  for (let y = 0; y < h; y++) {
    dt1d(g, 2 * y * gw, 1, gw, v, z, d);
    for (let x = 0; x < w; x++) {
      const sq = g[2 * y * gw + 2 * x] as number;
      out[y * w + x] = sq >= INF / 2 ? cap : Math.sqrt(sq) / 2;
    }
  }
  return out;
}
