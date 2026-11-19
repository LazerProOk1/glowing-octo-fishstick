// Terrain levels shared by the generator (src/sim) and pack data (src/content): biome conditions
// are written in terms of them, and sim imports content — so they live here, not in sim.

/** Sea level: land is any cell above it. */
export const SEA_LEVEL = 0.5;
/** Heights above this are mountains (top ~3% of land). */
export const MOUNTAIN_LEVEL = 0.85;
/** Heights above this (and up to MOUNTAIN_LEVEL) are hills (~12% of land). */
export const HILL_LEVEL = 0.72;
