import type { BiomeDef } from '../content/biomes/types';
import { uniqueBuffers, type SurfaceBake, type WorldBake } from '../render/bakeWorld';
import { GEN_STAGES } from '../sim/world/generateWorld';
import type { WorldParams } from '../sim/world/params';
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

/**
 * Версия протокола сообщений главного потока и воркеров (в обе стороны, включая вложенный воркер).
 * Поднимать при любом изменении формы сообщений. Сообщение другой версии (например, воркер из
 * старой вкладки или кэша) отклоняется с понятной ошибкой, а не разбирается вслепую.
 */
export const PROTOCOL_VERSION = 5;

/** Общая часть всех сообщений. */
interface Versioned {
  v: typeof PROTOCOL_VERSION;
}

export interface GenRequest extends Versioned {
  id: number;
  params: WorldParams;
}

/** Ответ-ошибка; так же воркер отвечает на запрос другой версии протокола. */
export interface ErrorResponse extends Versioned {
  type: 'error';
  id: number;
  message: string;
}

export type GenResponse =
  | (Versioned & { type: 'stage'; id: number; stage: LoadStep })
  | (Versioned & { type: 'done'; id: number } & GenResult)
  | ErrorResponse;

/** Запрос вложенному воркеру текстур рельефа (массивы — копии, передаются без копирования). */
export interface SurfaceRequest extends Versioned {
  id: number;
  height: Float32Array;
  biome: Uint8Array;
  /** Биомы мира: цвета и вид (вода/суша) по коду. */
  defs: BiomeDef[];
  w: number;
  h: number;
}

export type SurfaceResponse = (Versioned & { type: 'done'; id: number; bake: SurfaceBake; ms: number }) | ErrorResponse;

function versionOf(msg: unknown): unknown {
  return typeof msg === 'object' && msg !== null ? (msg as { v?: unknown }).v : undefined;
}

/** Текст ошибки, если сообщение другой версии протокола; null — версия своя. */
export function protocolMismatch(msg: unknown): string | null {
  const v = versionOf(msg);
  if (v === PROTOCOL_VERSION) return null;
  return `worker protocol version mismatch: got ${String(v)}, expected ${PROTOCOL_VERSION} (reload the page)`;
}

/** Ответ воркера на запрос другой версии протокола; null — версия своя, запрос можно разбирать. */
export function versionErrorReply(msg: unknown): ErrorResponse | null {
  const message = protocolMismatch(msg);
  if (message === null) return null;
  const id = typeof msg === 'object' && msg !== null ? (msg as { id?: unknown }).id : undefined;
  return { v: PROTOCOL_VERSION, type: 'error', id: typeof id === 'number' ? id : -1, message };
}

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
  return uniqueBuffers([bake.height, bake.surface, bake.biomeColor, bake.seaDepth]);
}
