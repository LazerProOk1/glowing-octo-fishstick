/** Colour helpers for sRGB 0..255 colours: one implementation for pack checks, palettes and map modes. */

/** HSL of an sRGB 0..255 colour: hue h in degrees [0, 360), saturation s and lightness l in [0, 1]. */
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

/** HSL saturation of a 0..255 colour (0 — grey, 1 — pure hue). */
export function saturation(r: number, g: number, b: number): number {
  return hsl([r, g, b]).s;
}
