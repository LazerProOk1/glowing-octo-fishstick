/**
 * Размытия полей на сетке клеток: гауссово (отделимое, с обрезкой у краёв) и вертикальное
 * скользящее среднее. Одна реализация для генерации мира (sim) и запекания текстур (render).
 * Порядок операций с плавающей точкой здесь закреплён отпечатками tests/sim/world/fingerprint.test.ts:
 * менять его — значит менять мир и текстуры.
 */

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
 * In-place vertical box blur with radius r (clamped at the map edges), row-major running sums
 * in float32. Не гаусс: скользящее среднее по 2r+1 строкам (климат дважды размывает им полосы
 * дождевой тени).
 */
export function boxBlurRows(a: Float32Array, w: number, h: number, r: number): void {
  const src = a.slice();
  const sum = new Float32Array(w);
  const row = (y: number): number => Math.min(h - 1, Math.max(0, y)) * w;
  for (let y = -r; y <= r; y++) {
    const o = row(y);
    for (let x = 0; x < w; x++) sum[x] = (sum[x] ?? 0) + (src[o + x] ?? 0);
  }
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const add = row(y + r + 1);
    const sub = row(y - r);
    for (let x = 0; x < w; x++) {
      a[o + x] = (sum[x] ?? 0) * k;
      sum[x] = (sum[x] ?? 0) + (src[add + x] ?? 0) - (src[sub + x] ?? 0);
    }
  }
}
