import type { WorldParams } from '../sim/world/params';
import {
  PROTOCOL_VERSION,
  protocolMismatch,
  type GenRequest,
  type GenResponse,
  type GenResult,
  type LoadStep,
} from './protocol';

export type { GenResult, GenTimings, LoadStep } from './protocol';

/** Minimal worker interface; replaced by a factory in tests. */
export interface WorkerPort {
  post(req: GenRequest): void;
  terminate(): void;
}

export type WorkerFactory = (
  onMessage: (msg: GenResponse) => void,
  onError: (message: string) => void,
) => WorkerPort;

/** The request was superseded by a newer one; its result is not needed. */
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
  requestWorld(params: WorldParams, onStage?: StageCallback): Promise<GenResult>;
  dispose(): void;
}

interface Pending {
  id: number;
  resolve(result: GenResult): void;
  reject(err: Error): void;
  onStage?: StageCallback;
}

/** The real Vite module worker. */
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
 * Generation client. One request runs at a time: a new request kills the worker busy with
 * the old one, and the old promise rejects with SupersededError.
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
    if (!p || msg.id !== p.id) return; // answer to a superseded request
    const mismatch = protocolMismatch(msg);
    if (mismatch !== null) {
      // Worker of a different version: its answers cannot be trusted — stop it and reject the request.
      onError(mismatch);
      return;
    }
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
    requestWorld(params, onStage) {
      if (current) {
        const old = current;
        current = null;
        killPort(); // generation cannot be interrupted from inside — stop the whole worker
        old.reject(new SupersededError());
      }
      return new Promise<GenResult>((resolve, reject) => {
        const id = nextId++;
        current = { id, resolve, reject, onStage };
        try {
          port ??= factory(onMessage, onError);
          port.post({ v: PROTOCOL_VERSION, id, params });
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
 * Generates the world and bakes its textures in the worker; a newer call supersedes the previous one.
 * Typed arrays arrive by transfer, without copying.
 */
export function requestWorld(params: WorldParams, onStage?: StageCallback): Promise<GenResult> {
  defaultClient ??= createGenClient();
  return defaultClient.requestWorld(params, onStage);
}
