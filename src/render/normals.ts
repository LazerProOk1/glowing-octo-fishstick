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

function gaussianKernel(sigma: number): Float32Array {
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

/** Separable Gaussian blur with edge clamping. */
export function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        s += (k[i + r] as number) * (src[row + xx] as number);
      }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        s += (k[i + r] as number) * (tmp[yy * w + x] as number);
      }
      out[y * w + x] = s;
    }
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
  const at = (x: number, y: number): number =>
    b[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)] as number;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1);
      const tc = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const ml = at(x - 1, y);
      const mr = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bc = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const o = (y * w + x) * 2;
      out[o] = (tr + 2 * mr + br - tl - 2 * ml - bl) / 8;
      out[o + 1] = (bl + 2 * bc + br - tl - 2 * tc - tr) / 8;
    }
  }
  return out;
}
