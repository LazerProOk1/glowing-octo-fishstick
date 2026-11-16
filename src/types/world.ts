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

export type ResourceType = 'none' | 'wood' | 'stone' | 'iron' | 'gold' | 'fish' | 'grain';

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
}
