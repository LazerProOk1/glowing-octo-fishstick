// Модульный воркер: генерация мира и запекание текстур карты, чтобы главный поток
// не блокировался на несколько секунд. Текстуры рельефа запекает вложенный воркер
// параллельно рекам и провинциям; без вложенных воркеров они пекутся здесь же, после генерации.
import { bakeTextures } from '../render/bake';
import { bakeSurface, bakeTransferables, type SurfaceBake, type WorldBake } from '../render/bakeWorld';
import { generateWorld } from '../sim/world/generateWorld';
import { WORLD_H, WORLD_W } from '../sim/world/types';
import {
  collectTransferables,
  LOAD_STEPS,
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

/** Вложенный воркер создаётся один раз; null — недоступен (тогда печём в этом потоке). */
let surfaceWorker: Worker | null | undefined;
const surfacePending = new Map<number, { resolve(r: SurfaceResult): void; reject(e: Error): void }>();
/**
 * Сколько ждать вложенный воркер с момента запроса. Он печёт ~0,5–1 с; если за это время нет ответа,
 * воркер считается зависшим, останавливается, и рельеф печётся в этом потоке.
 */
const SURFACE_TIMEOUT_MS = 15000;

/**
 * Останавливает вложенный воркер и отклоняет ожидающие запросы.
 * retry — пересоздать его при следующей генерации (зависание), иначе больше не пробовать (сбой).
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
      const p = surfacePending.get(msg.id);
      if (!p) return;
      surfacePending.delete(msg.id);
      if (msg.type === 'done') p.resolve({ bake: msg.bake, ms: msg.ms });
      else p.reject(new Error(msg.message));
    };
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      // Воркер не поднялся или упал: дальше печём в этом потоке.
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

/** Отправляет копии высоты и биомов во вложенный воркер; null — если его нет. */
function startSurfaceBake(id: number, height: Float32Array, biome: Uint8Array, w: number, h: number): Promise<SurfaceResult> | null {
  const worker = getSurfaceWorker();
  if (!worker) return null;
  const req: SurfaceRequest = { id, height: height.slice(), biome: biome.slice(), w, h };
  return new Promise<SurfaceResult>((resolve, reject) => {
    const timer = setTimeout(
      () => dropSurfaceWorker(worker, new Error('surface worker timed out'), true),
      SURFACE_TIMEOUT_MS,
    );
    surfacePending.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    worker.postMessage(req, [req.height.buffer, req.biome.buffer]);
  });
}

scope.onmessage = (e) => {
  void handle(e.data);
};

async function handle({ id, seed }: GenRequest): Promise<void> {
  const stages = Object.fromEntries(LOAD_STEPS.map((s) => [s, 0])) as Record<LoadStep, number>;
  const start = performance.now();
  let step: LoadStep | null = null;
  let stepStart = start;
  const enter = (next: LoadStep | null): void => {
    const now = performance.now();
    if (step) stages[step] = now - stepStart;
    step = next;
    stepStart = now;
    if (next) scope.postMessage({ type: 'stage', id, stage: next });
  };
  try {
    let parallel: Promise<SurfaceResult> | null = null;
    const world = generateWorld(seed, enter, (height, biome) => {
      parallel = startSurfaceBake(id, height, biome, WORLD_W, WORLD_H);
    });
    enter('bake');
    // Текстуры провинций зависят от всей генерации — их печём здесь, пока вложенный воркер
    // доделывает рельеф; потом ждём его результата.
    const own = bakeTextures(world);
    const pending: Promise<SurfaceResult> | null = parallel;
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
    scope.postMessage({ type: 'done', id, world, bake, timings }, transfer);
  } catch (err) {
    scope.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
}

function bakeHere(world: { height: Float32Array; biome: Uint8Array; w: number; h: number }): SurfaceResult {
  const t = performance.now();
  return { bake: bakeSurface(world.height, world.biome, world.w, world.h), ms: performance.now() - t };
}
