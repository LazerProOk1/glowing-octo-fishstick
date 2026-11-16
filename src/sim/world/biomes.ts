import { BIOMES, HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL, type Biome } from './types';

/** Fixed top-down order: water, relief, then climate. */
export function classifyBiome(height: number, temperature: number, moisture: number): Biome {
  if (height <= SEA_LEVEL) return height < SEA_LEVEL - 0.05 ? 'ocean' : 'coast';
  if (height > MOUNTAIN_LEVEL) return 'mountains';
  if (height > HILL_LEVEL) return 'hills';
  if (temperature < -10) return 'glacier';
  if (temperature < -2) return 'tundra';
  if (temperature > 24 && moisture > 0.7) return 'jungle';
  if (temperature > 20 && moisture < 0.2) return 'desert';
  if (temperature < 5) return moisture > 0.3 ? 'taiga' : 'steppe';
  if (moisture < 0.35) return 'steppe';
  if (moisture > 0.72 && temperature > 8 && height < 0.6) return 'swamp';
  if (moisture > 0.5) return 'forest';
  return 'plains';
}

export function computeBiomes(
  height: Float32Array,
  temperature: Float32Array,
  moisture: Float32Array,
): Uint8Array {
  const codes = new Map<Biome, number>(BIOMES.map((b, i) => [b, i]));
  const out = new Uint8Array(height.length);
  for (let i = 0; i < out.length; i++) {
    const b = classifyBiome(height[i] ?? 0, temperature[i] ?? 0, moisture[i] ?? 0);
    out[i] = codes.get(b) ?? 0;
  }
  return out;
}
