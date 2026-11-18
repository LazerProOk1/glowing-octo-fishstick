import type { BiomeDef, GenOptions } from '../content/biomes/types';
import { uniqueBuffers, type SurfaceBake, type WorldBake } from '../render/bakeWorld';
import { GEN_STAGES } from '../sim/world/generateWorld';
import type { World } from '../sim/world/types';

/** Шаги работы воркера: шесть этапов генерации и запекание текстур карты. */
export const LOAD_STEPS = [...GEN_STAGES, 'bake'] as const;
export type LoadStep = (typeof LOAD_STEPS)[number];

/**
 * Время шагов, мс (замеряет воркер). total — от запроса до готового результата.
 * stages.bake — сколько запекание добавило после провинций; surface — запекание текстур рельефа
 * во вложенном воркере, параллельно рекам и провинциям (в total входит только то, что не перекрылось).
 */
export interface GenTimings {
  stages: Record<LoadStep, number>;
  total: number;
  surface?: number;
}

/** Готовый мир вместе с запечёнными текстурами и замерами. */
export interface GenResult {
  world: World;
  bake: WorldBake;
  timings: GenTimings;
}

export interface GenRequest {
  id: number;
  seed: string;
  options: GenOptions;
}

export type GenResponse =
  | { type: 'stage'; id: number; stage: LoadStep }
  | ({ type: 'done'; id: number } & GenResult)
  | { type: 'error'; id: number; message: string };

/** Запрос вложенному воркеру текстур рельефа (массивы — копии, передаются без копирования). */
export interface SurfaceRequest {
  id: number;
  height: Float32Array;
  biome: Uint8Array;
  /** Биомы мира: цвета и вид (вода/суша) по коду. */
  defs: BiomeDef[];
  w: number;
  h: number;
}

export type SurfaceResponse =
  | { type: 'done'; id: number; bake: SurfaceBake; ms: number }
  | { type: 'error'; id: number; message: string };

/** Буферы всех типизированных массивов мира, каждый один раз (повтор в списке передачи — ошибка). */
export function collectTransferables(world: World): ArrayBuffer[] {
  return uniqueBuffers([
    world.height,
    world.temperature,
    world.moisture,
    world.arcana,
    world.biome,
    world.riverMask,
    world.provinceOf,
  ]);
}

export function surfaceTransferables(bake: SurfaceBake): ArrayBuffer[] {
  return uniqueBuffers([bake.height, bake.surface, bake.biomeColor]);
}
