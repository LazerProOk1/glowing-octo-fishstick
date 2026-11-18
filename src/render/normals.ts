/**
 * Gradient field for hillshading, baked on the CPU.
 *
 * The heightmap is piecewise-bilinear and a one-texel difference in the shader is only C0,
 * which shows as low-poly facets. Here the height is Gaussian-blurred (σ ≈ 1.25 cells) and
 * differentiated with a 3×3 Sobel kernel; the shader samples the result bilinearly, so the
 * normal is smooth across texel lines.
 */

export const NORMAL_SIGMA = 1.25;
/** Light blur for the coastline: rounds the cell-scale zigzag of a near-binary shore. */
export const COAST_SIGMA = 0.7;

export function gaussianKernel(sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / sum;
  return k;
}

/**
 * Separable Gaussian blur with edge clamping.
 * Interior taps run without bounds checks; the vertical pass accumulates whole rows
 * (contiguous memory) in a Float64 row buffer, so precision matches a scalar double sum.
 */
export function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const taps = k.length;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const clampX = (x: number): number => (x < 0 ? 0 : x >= w ? w - 1 : x);
  const edge = (row: number, x: number): number => {
    let s = 0;
    for (let i = -r; i <= r; i++) s += (k[i + r] as number) * (src[row + clampX(x + i)] as number);
    return s;
  };
  const lo = Math.min(r, w);
  const hi = Math.max(lo, w - r);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < lo; x++) tmp[row + x] = edge(row, x);
    for (let x = lo; x < hi; x++) {
      const base = row + x - r;
      let s = 0;
      for (let i = 0; i < taps; i++) s += (k[i] as number) * (src[base + i] as number);
      tmp[row + x] = s;
    }
    for (let x = hi; x < w; x++) tmp[row + x] = edge(row, x);
  }
  const acc = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let i = -r; i <= r; i++) {
      const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
      const ki = k[i + r] as number;
      const srow = yy * w;
      for (let x = 0; x < w; x++) acc[x] = (acc[x] as number) + ki * (tmp[srow + x] as number);
    }
    out.set(acc, y * w);
  }
  return out;
}

/**
 * The same blur for `c` interleaved channels (src.length = w·h·c) in one sweep: per channel the
 * taps and their summation order are exactly those of `blur`, so each channel matches it bit for
 * bit; the loops over the map run once instead of c times.
 */
export function blurInterleaved(src: Float32Array, w: number, h: number, c: number, sigma: number): Float32Array {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const taps = k.length;
  const rowLen = w * c;
  const tmp = new Float32Array(rowLen * h);
  const out = new Float32Array(rowLen * h);
  const lo = Math.min(r, w);
  const hi = Math.max(lo, w - r);
  for (let y = 0; y < h; y++) {
    const row = y * rowLen;
    for (let x = 0; x < w; x++) {
      const interior = x >= lo && x < hi;
      for (let ch = 0; ch < c; ch++) {
        let s = 0;
        if (interior) {
          const base = row + (x - r) * c + ch;
          for (let i = 0; i < taps; i++) s += (k[i] as number) * (src[base + i * c] as number);
        } else {
          for (let i = -r; i <= r; i++) {
            const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
            s += (k[i + r] as number) * (src[row + xx * c + ch] as number);
          }
        }
        tmp[row + x * c + ch] = s;
      }
    }
  }
  const acc = new Float64Array(rowLen);
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let i = -r; i <= r; i++) {
      const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
      const ki = k[i + r] as number;
      const srow = yy * rowLen;
      for (let x = 0; x < rowLen; x++) acc[x] = (acc[x] as number) + ki * (tmp[srow + x] as number);
    }
    out.set(acc, y * rowLen);
  }
  return out;
}

/**
 * Height gradient (dh/dx, dh/dy per cell), interleaved RG, length w·h·2.
 * Sobel normalised by 8 so a plane h = a·x + b·y gives exactly (a, b).
 */
export function bakeGradient(height: Float32Array, w: number, h: number, sigma = NORMAL_SIGMA): Float32Array {
  const b = blur(height, w, h, sigma);
  const out = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const mid = y * w;
    const dn = (y + 1 < h ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x + 1 < w ? x + 1 : w - 1;
      const tl = b[up + xl] as number;
      const tc = b[up + x] as number;
      const tr = b[up + xr] as number;
      const ml = b[mid + xl] as number;
      const mr = b[mid + xr] as number;
      const bl = b[dn + xl] as number;
      const bc = b[dn + x] as number;
      const br = b[dn + xr] as number;
      const o = (y * w + x) * 2;
      out[o] = (tr + 2 * mr + br - tl - 2 * ml - bl) / 8;
      out[o + 1] = (bl + 2 * bc + br - tl - 2 * tc - tr) / 8;
    }
  }
  return out;
}

/** Blur of the land mask for the shallow-water band: lighter water fades out within ~3–6 cells. */
export const HALO_SIGMA = 3.5;

/** Smooth land fraction in [0, 1] (≈ 0.5 on a straight coast), from `height > seaLevel`. */
export function coastNearness(height: Float32Array, w: number, h: number, seaLevel: number, sigma = HALO_SIGMA): Float32Array {
  const land = new Float32Array(w * h);
  for (let i = 0; i < land.length; i++) land[i] = (height[i] as number) > seaLevel ? 1 : 0;
  return blur(land, w, h, sigma);
}
