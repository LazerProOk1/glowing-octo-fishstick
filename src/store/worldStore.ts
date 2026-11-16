import { create } from 'zustand';
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH, generateWorld } from '../simulation/mapGenerator';
import type { World } from '../types/world';

export const MIN_SEED = 1;
export const MAX_SEED = 99999;
const INITIAL_SEED = 1337;

function createWorld(seed: number): World {
  return generateWorld(seed, DEFAULT_WORLD_WIDTH, DEFAULT_WORLD_HEIGHT);
}

interface WorldState {
  world: World;
  seed: number;
  selectedProvinceId: number | null;
  setSeed: (seed: number) => void;
  generateNewWorld: () => void;
  selectProvince: (provinceId: number | null) => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  world: createWorld(INITIAL_SEED),
  seed: INITIAL_SEED,
  selectedProvinceId: null,
  setSeed: (seed: number) => {
    const normalizedSeed = Math.min(MAX_SEED, Math.max(MIN_SEED, Math.round(seed)));
    set({ seed: normalizedSeed, world: createWorld(normalizedSeed), selectedProvinceId: null });
  },
  generateNewWorld: () => {
    const seed = Math.floor(Math.random() * (MAX_SEED - MIN_SEED + 1)) + MIN_SEED;
    set({ seed, world: createWorld(seed), selectedProvinceId: null });
  },
  selectProvince: (provinceId: number | null) => {
    set({ selectedProvinceId: provinceId });
  },
}));
