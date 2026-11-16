const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** float32 → IEEE 754 binary16 (округление к ближайшему, переполнение → ±∞, NaN не ожидается). */
export function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0] as number;
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  const mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    const m = (mant | 0x800000) >>> (1 - exp);
    return sign | ((m + 0x1000) >>> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  // Перенос при округлении корректно переходит в экспоненту (и в ∞ на краю диапазона).
  return (sign | (exp << 10) | (mant >>> 13)) + ((mant >>> 12) & 1);
}

/** Массив float32 → Uint16Array половинной точности со сдвигом `offset`. */
export function toHalfArray(src: Float32Array, offset = 0): Uint16Array {
  const out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = toHalf((src[i] as number) - offset);
  return out;
}
