import type { GenOptions } from '../content/biomes/types';
import type { GenRequest, GenResponse, GenResult, LoadStep } from './protocol';

export type { GenResult, GenTimings, LoadStep } from './protocol';

/** Минимальный интерфейс воркера; в тестах подменяется фабрикой. */
export interface WorkerPort {
  post(req: GenRequest): void;
  terminate(): void;
}

export type WorkerFactory = (
  onMessage: (msg: GenResponse) => void,
  onError: (message: string) => void,
) => WorkerPort;

/** Запрос вытеснен более новым; его результат не нужен. */
export class SupersededError extends Error {
  constructor() {
    super('superseded by a newer request');
    this.name = 'SupersededError';
  }
}

export function isSuperseded(err: unknown): boolean {
  return err instanceof SupersededError;
}

export type StageCallback = (step: LoadStep) => void;

export interface GenClient {
  requestWorld(seed: string, options?: GenOptions, onStage?: StageCallback): Promise<GenResult>;
  dispose(): void;
}

interface Pending {
  id: number;
  resolve(result: GenResult): void;
  reject(err: Error): void;
  onStage?: StageCallback;
}

/** Настоящий модульный воркер Vite. */
export const viteWorkerFactory: WorkerFactory = (onMessage, onError) => {
  const worker = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<GenResponse>) => onMessage(e.data);
  worker.onerror = (e: ErrorEvent) => {
    e.preventDefault();
    onError(e.message || 'generation worker failed');
  };
  worker.onmessageerror = () => onError('generation worker sent an unreadable message');
  return {
    post: (req) => worker.postMessage(req),
    terminate: () => worker.terminate(),
  };
};

/**
 * Клиент генерации. Одновременно выполняется один запрос: новый запрос прерывает воркер,
 * занятый старым, а обещание старого отклоняется SupersededError.
 */
export function createGenClient(factory: WorkerFactory = viteWorkerFactory): GenClient {
  let port: WorkerPort | null = null;
  let current: Pending | null = null;
  let nextId = 1;

  const killPort = (): void => {
    port?.terminate();
    port = null;
  };

  const onMessage = (msg: GenResponse): void => {
    const p = current;
    if (!p || msg.id !== p.id) return; // ответ на вытесненный запрос
    if (msg.type === 'stage') {
      p.onStage?.(msg.stage);
      return;
    }
    current = null;
    if (msg.type === 'done') {
      p.resolve({ world: msg.world, bake: msg.bake, timings: msg.timings });
    } else {
      p.reject(new Error(msg.message));
    }
  };

  const onError = (message: string): void => {
    const p = current;
    current = null;
    killPort();
    p?.reject(new Error(message));
  };

  return {
    requestWorld(seed, options = {}, onStage) {
      if (current) {
        const old = current;
        current = null;
        killPort(); // генерацию нельзя прервать изнутри — останавливаем воркер целиком
        old.reject(new SupersededError());
      }
      return new Promise<GenResult>((resolve, reject) => {
        const id = nextId++;
        current = { id, resolve, reject, onStage };
        try {
          port ??= factory(onMessage, onError);
          port.post({ id, seed, options });
        } catch (err) {
          current = null;
          killPort();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    dispose() {
      const p = current;
      current = null;
      killPort();
      p?.reject(new SupersededError());
    },
  };
}

let defaultClient: GenClient | null = null;

/**
 * Генерирует мир и запекает его текстуры в воркере; более новый вызов вытесняет предыдущий.
 * Типизированные массивы приходят передачей (transferable), без копирования.
 */
export function requestWorld(seed: string, options: GenOptions = {}, onStage?: StageCallback): Promise<GenResult> {
  defaultClient ??= createGenClient();
  return defaultClient.requestWorld(seed, options, onStage);
}
