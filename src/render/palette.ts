/** sRGB, 0..255. */
export type RGB = readonly [number, number, number];

// Biome colours live in the biome data (src/content/packs/*): the color field, saturation ≤ 0.45.
// Here are the muted "paper" map colours besides the biomes (in the spirit of HoI4).

/** Map colours besides the biomes. */
export const MAP_COLORS = {
  /** Sea over shallow bottom: continental shelves (tint by bottom depth, see seaDepth.ts). */
  seaShallow: [92, 117, 124],
  /** Sea over the deepest bottom (mid-ocean). */
  seaDeep: [50, 69, 82],
  /** Narrow bright sea band right at the shore (2–4 cells). */
  seaCoast: [116, 141, 145],
  /** Lake: lighter and greener than the sea. */
  lakeDeep: [84, 110, 106],
  /** Lake at the shore (a band no wider than ~2 cells). */
  lakeShallow: [122, 150, 138],
  /** Land with not a single land cell among its neighbours (narrow spits). */
  beach: [196, 184, 148],
  /** Thin coastline. */
  coastLine: [62, 70, 70],
  /** Province borders. */
  border: [78, 66, 56],
  /** Rivers: shallow water, slightly darker for contrast with the land. */
  river: [96, 124, 134],
  /** Dark river underlay (bank edge): an outline 40% wider than the water. */
  riverBank: [70, 82, 82],
  /** Void beyond the map edge. */
  void: [56, 62, 64],
  /** Snow caps on high peaks (drawn by height, not by biome). */
  snow: [232, 231, 224],
} as const satisfies Record<string, RGB>;

/** Colour as a GLSL `vec3(...)` literal in the linear 0..1 scale (no gamma correction). */
export function glslVec3(c: RGB): string {
  return `vec3(${c.map((v) => (v / 255).toFixed(4)).join(', ')})`;
}

/** Colour as a 0xRRGGBB number for Pixi. */
export function hexColor(c: RGB): number {
  return (c[0] << 16) | (c[1] << 8) | c[2];
}
