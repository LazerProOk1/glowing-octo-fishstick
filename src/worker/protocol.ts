import type { BiomeDef } from '../content/biomes/types';
import { bakeTransferables, uniqueBuffers, type SurfaceBake, type WorldBake } from '../render/bakeWorld';
import { GEN_STAGES } from '../sim/world/generateWorld';
import type { WorldParams } from '../sim/world/params';
import type { World } from '../sim/world/types';

/** Worker steps: six generation stages and map texture baking. */
export const LOAD_STEPS = [...GEN_STAGES, 'bake'] as const;
export type LoadStep = (typeof LOAD_STEPS)[number];

/**
 * Step times, ms (measured by the worker). total — from request to finished result.
 * stages.bake — what baking added after the provinces; surface — terrain texture baking
 * in the nested worker, in parallel with rivers and provinces (total counts only the non-overlapping part).
 */
export interface GenTimings {
  stages: Record<LoadStep, number>;
  total: number;
  surface?: number;
}

/** The finished world together with the baked textures and timings. */
export interface GenResult {
  world: World;
  bake: WorldBake;
  timings: GenTimings;
}

/**
 * Protocol version of the messages between the main thread and the workers (both ways, nested worker included).
 * Bump on any change of the message shape. A message of another version (e.g. a worker from an
 * old tab or cache) is rejected with a clear error instead of being parsed blindly.
 */
export const PROTOCOL_VERSION = 5;

/** Common part of all messages. */
interface Versioned {
  v: typeof PROTOCOL_VERSION;
}

export interface GenRequest extends Versioned {
  id: number;
  params: WorldParams;
}

/** Error reply; the worker answers a request of another protocol version the same way. */
export interface ErrorResponse extends Versioned {
  type: 'error';
  id: number;
  message: string;
}

export type GenResponse =
  | (Versioned & { type: 'stage'; id: number; stage: LoadStep })
  | (Versioned & { type: 'done'; id: number } & GenResult)
  | ErrorResponse;

/** Request to the nested terrain-texture worker (the arrays are copies and are transferred without copying). */
export interface SurfaceRequest extends Versioned {
  id: number;
  height: Float32Array;
  biome: Uint8Array;
  /** World biomes: colours and kind (water/land) by code. */
  defs: BiomeDef[];
  w: number;
  h: number;
}

export type SurfaceResponse = (Versioned & { type: 'done'; id: number; bake: SurfaceBake; ms: number }) | ErrorResponse;

function versionOf(msg: unknown): unknown {
  return typeof msg === 'object' && msg !== null ? (msg as { v?: unknown }).v : undefined;
}

/** Error text if the message has another protocol version; null — the version matches. */
export function protocolMismatch(msg: unknown): string | null {
  const v = versionOf(msg);
  if (v === PROTOCOL_VERSION) return null;
  return `worker protocol version mismatch: got ${String(v)}, expected ${PROTOCOL_VERSION} (reload the page)`;
}

/** Worker reply to a request of another protocol version; null — the version matches, the request can be parsed. */
export function versionErrorReply(msg: unknown): ErrorResponse | null {
  const message = protocolMismatch(msg);
  if (message === null) return null;
  const id = typeof msg === 'object' && msg !== null ? (msg as { id?: unknown }).id : undefined;
  return { v: PROTOCOL_VERSION, type: 'error', id: typeof id === 'number' ? id : -1, message };
}

/** Buffers of all world typed arrays, each exactly once (a repeat in the transfer list is an error). */
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

/** Terrain texture buffers, each exactly once: all SurfaceBake fields, new fields transfer themselves. */
export function surfaceTransferables(bake: SurfaceBake): ArrayBuffer[] {
  return bakeTransferables(bake);
}
