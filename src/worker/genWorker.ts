// Модульный воркер: генерация мира и запекание текстур карты, чтобы главный поток
// не блокировался на несколько секунд. Текстуры рельефа запекает вложенный воркер
// параллельно рекам и провинциям; без вложенных воркеров они пекутся здесь же, после генерации.
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
      const mismatch = protocolMismatch(msg);
      if (mismatch !== null) {
        // Вложенный воркер другой версии: больше его не используем, рельеф печём здесь.
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

interface SurfaceJob {
  result: Promise<SurfaceResult>;
  /** Запускает таймаут ожидания результата (вызывается, когда generateWorld закончил). */
  startTimeout(): void;
}

/** Отправляет копии высоты и биомов во вложенный воркер; null — если его нет. */
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
  // Таймаут отсчитывается от конца generateWorld, а не от отправки запроса: вложенный воркер
  // конкурирует с генерацией за процессор, и долгая генерация большого мира не должна его ронять.
  const startTimeout = (): void => {
    if (settled) return;
    timer = setTimeout(
      () => dropSurfaceWorker(worker, new Error('surface worker timed out'), true),
      SURFACE_TIMEOUT_MS,
    );
  };
  return { result, startTimeout };
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
  try {
    let parallel = null as SurfaceJob | null;
    const world = generateWorld(params, enter, (height, biome, defs, w, h) => {
      parallel = startSurfaceBake(id, height, biome, defs, w, h);
    });
    const job: SurfaceJob | null = parallel;
    job?.startTimeout();
    enter('bake');
    // Текстуры провинций зависят от всей генерации — их печём здесь, пока вложенный воркер
    // доделывает рельеф; потом ждём его результата.
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
    const message = err instanceof Error ? err.message : String(err);
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'error', id, message });
  }
}

function bakeHere(world: World): SurfaceResult {
  const t = performance.now();
  return { bake: bakeSurface(world.height, world.biome, world.biomes, world.w, world.h), ms: performance.now() - t };
}
