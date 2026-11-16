export type Biome =
  | 'ocean'
  | 'coast'
  | 'plains'
  | 'forest'
  | 'mountains'
  | 'desert'
  | 'tundra'
  | 'swamp'
  | 'volcanic';

/**
 * Visual terrain class. Derives from biome, elevation and temperature and drives
 * the palette, so one biome can be drawn as hills, mountains or snow.
 */
export type Surface =
  | 'deepOcean'
  | 'shallowWater'
  | 'beach'
  | 'plains'
  | 'tundra'
  | 'forest'
  | 'taiga'
  | 'hills'
  | 'mountains'
  | 'snow'
  | 'desert'
  | 'swamp'
  | 'volcanic';

export type ResourceType = 'none' | 'wood' | 'stone' | 'iron' | 'gold' | 'fish' | 'grain';

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

export interface Tile {
  /** 0..100 */
  elevation: number;
  /** 0..100 */
  moisture: number;
  /** Degrees Celsius, -30..40 */
  temperature: number;
  /** 0..100 */
  fertility: number;
  biome: Biome;
  surface: Surface;
  /** True when the tile carries a river channel */
  river: boolean;
  resource: ResourceType;
  ownerId: string | null;
}

export interface World {
  width: number;
  height: number;
  seed: number;
  /** Row-major: tiles[y][x] */
  tiles: Tile[][];
  tick: number;
  /** Row-major smooth elevation 0..100, drives surfaces and contours */
  elevationMap: Float32Array;
  /** Row-major moisture 0..100, interpolated per pixel for smooth biome borders */
  moistureMap: Float32Array;
  /** Row-major temperature in °C */
  temperatureMap: Float32Array;
  /** Row-major elevation with micro relief, drives hillshading and water flow */
  reliefMap: Float32Array;
  /** Row-major D8 flow accumulation: how many tiles drain through this one */
  flowAccumulation: Float32Array;
  /** Row-major downstream tile index, -1 when the tile drains nowhere */
  flowDownstream: Int32Array;
}

export function isWaterSurface(surface: Surface): boolean {
  return surface === 'deepOcean' || surface === 'shallowWater';
}
