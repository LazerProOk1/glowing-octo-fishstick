/** Цветовые хелперы для цветов sRGB 0..255: одна реализация для проверки паков, палитр и режимов карты. */

/** HSL цвета sRGB 0..255: тон h в градусах [0, 360), насыщенность s и светлота l в [0, 1]. */
export function hsl([r, g, b]: readonly [number, number, number]): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const s = (max - min) / (1 - Math.abs(2 * l - 1));
  const d = Math.max(r, g, b) - Math.min(r, g, b);
  let h: number;
  if (r >= g && r >= b) h = (((g - b) / d) % 6 + 6) % 6;
  else if (g >= b) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** Насыщенность HSL цвета 0..255 (0 — серый, 1 — чистый тон). */
export function saturation(r: number, g: number, b: number): number {
  return hsl([r, g, b]).s;
}
