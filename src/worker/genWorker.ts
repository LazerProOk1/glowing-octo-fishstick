// Module worker: world generation and map texture baking, so the main thread is not
// blocked for several seconds. Terrain textures are baked by a nested worker in parallel
// with rivers and provinces; without nested workers they are baked here, after generation.
import type { BiomeDef } from '../content/biomes/types';
import { bakeProvinces, bakeSurface, bakeTransferables, type SurfaceBake, type WorldBake } from '../render/bakeWorld';
import { generateWorld } from '../sim/world/generateWorld';
import type { World } from '../sim/world/types';
import {
  collectTransferables,
  LOAD_STEPS,
  PROTOCOL_VERSION,
  protocolMismatch,
  versionErrorReply,
  type GenRequest,
  type GenResponse,
  type GenTimings,
  type LoadStep,
  type SurfaceRequest,
  type SurfaceResponse,
} from './protocol';

interface Scope {
  onmessage: ((e: MessageEvent<GenRequest>) => void) | null;
  postMessage(msg: GenResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as Scope;

interface SurfaceResult {
  bake: SurfaceBake;
  ms: number;
}

/** The nested worker is created once; null — unavailable (then we bake on this thread). */
let surfaceWorker: Worker | null | undefined;
const surfacePending = new Map<number, { resolve(r: SurfaceResult): void; reject(e: Error): void }>();
/**
 * How long to wait for the nested worker from the moment of the request. It bakes in ~0.5–1 s; if there
 * is no answer in that time, the worker is considered hung, it is stopped, and the terrain is baked here.
 */
const SURFACE_TIMEOUT_MS = 15000;

/**
 * Stops the nested worker and rejects the pending requests.
 * retry — recreate it on the next generation (a hang), otherwise do not try again (a failure).
 */
function dropSurfaceWorker(worker: Worker, err: Error, retry: boolean): void {
  if (surfaceWorker === worker) surfaceWorker = retry ? undefined : null;
  worker.terminate();
  for (const p of surfacePending.values()) p.reject(err);
  surfacePending.clear();
}

function getSurfaceWorker(): Worker | null {
  if (surfaceWorker !== undefined) return surfaceWorker;
  try {
    if (typeof Worker === 'undefined') throw new Error('no nested workers');
    const worker = new Worker(new URL('./surfaceWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SurfaceResponse>) => {
      const msg = e.data;
      const mismatch = protocolMismatch(msg);
      if (mismatch !== null) {
        // Nested worker of a different version: stop using it, bake the terrain here.
        dropSurfaceWorker(worker, new Error(mismatch), false);
        return;
      }
      const p = surfacePending.get(msg.id);
      if (!p) return;
      surfacePending.delete(msg.id);
      if (msg.type === 'done') p.resolve({ bake: msg.bake, ms: msg.ms });
      else p.reject(new Error(msg.message));
    };
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      // The worker did not start or crashed: bake on this thread from now on.
      dropSurfaceWorker(worker, new Error(e.message || 'surface worker failed'), false);
    };
    worker.onmessageerror = () => {
      dropSurfaceWorker(worker, new Error('surface worker sent an unreadable message'), false);
    };
    surfaceWorker = worker;
  } catch {
    surfaceWorker = null;
  }
  return surfaceWorker;
}

interface SurfaceJob {
  result: Promise<SurfaceResult>;
  /** Starts the wait timeout for the result (called when generateWorld has finished). */
  startTimeout(): void;
  /** Cancels the job: the nested worker is terminated (if it has not answered yet), the next world creates a new one. */
  cancel(): void;
}

/** Sends copies of height and biomes to the nested worker; null if there is none. */
function startSurfaceBake(
  id: number,
  height: Float32Array,
  biome: Uint8Array,
  defs: BiomeDef[],
  w: number,
  h: number,
): SurfaceJob | null {
  const worker = getSurfaceWorker();
  if (!worker) return null;
  const req: SurfaceRequest = {
    v: PROTOCOL_VERSION,
    id,
    height: height.slice(),
    biome: biome.slice(),
    defs,
    w,
    h,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const result = new Promise<SurfaceResult>((resolve, reject) => {
    surfacePending.set(id, {
      resolve: (r) => {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        settled = true;
        clearTimeout(timer);
        reject(e);
      },
    });
    worker.postMessage(req, [req.height.buffer, req.biome.buffer]);
  });
  // The timeout counts from the end of generateWorld, not from sending the request: the nested worker
  // competes with generation for the CPU, and long generation of a large world must not bring it down.
  const startTimeout = (): void => {
    if (settled) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => dropSurfaceWorker(worker, new Error('surface worker timed out'), true),
      SURFACE_TIMEOUT_MS,
    );
  };
  const cancel = (): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    surfacePending.delete(id);
    if (surfaceWorker === worker) surfaceWorker = undefined;
    worker.terminate();
  };
  return { result, startTimeout, cancel };
}

scope.onmessage = (e) => {
  const mismatch = versionErrorReply(e.data);
  if (mismatch) {
    scope.postMessage(mismatch);
    return;
  }
  void handle(e.data);
};

async function handle({ id, params }: GenRequest): Promise<void> {
  const stages = Object.fromEntries(LOAD_STEPS.map((s) => [s, 0])) as Record<LoadStep, number>;
  const start = performance.now();
  let step: LoadStep | null = null;
  let stepStart = start;
  const enter = (next: LoadStep | null): void => {
    const now = performance.now();
    if (step) stages[step] = now - stepStart;
    step = next;
    stepStart = now;
    if (next) scope.postMessage({ v: PROTOCOL_VERSION, type: 'stage', id, stage: next });
  };
  let parallel = null as SurfaceJob | null;
  try {
    const world = generateWorld(params, enter, (height, biome, defs, w, h) => {
      parallel = startSurfaceBake(id, height, biome, defs, w, h);
    });
    const job: SurfaceJob | null = parallel;
    job?.startTimeout();
    enter('bake');
    // Province textures depend on the whole generation — they are baked here while the nested worker
    // finishes the terrain; then we wait for its result.
    const own = bakeProvinces(world);
    const pending: Promise<SurfaceResult> | null = job ? job.result : null;
    let surface: SurfaceResult;
    try {
      surface = pending ? await pending : bakeHere(world);
    } catch {
      surface = bakeHere(world);
    }
    const bake: WorldBake = { ...own, ...surface.bake };
    enter(null);
    const timings: GenTimings = { stages, total: performance.now() - start, surface: surface.ms };
    const transfer = [...new Set([...collectTransferables(world), ...bakeTransferables(bake)])];
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'done', id, world, bake, timings }, transfer);
  } catch (err) {
    // Generation failed while terrain baking was already running: do not leave the nested worker spinning.
    const job: SurfaceJob | null = parallel;
    job?.cancel();
    const message = err instanceof Error ? err.message : String(err);
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'error', id, message });
  }
}

function bakeHere(world: World): SurfaceResult {
  const t = performance.now();
  return { bake: bakeSurface(world.height, world.biome, world.biomes, world.w, world.h), ms: performance.now() - t };
}
