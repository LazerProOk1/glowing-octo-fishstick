// Nested worker: bakes terrain textures (height, normals, shore, biome colours)
// while the generation worker carves rivers and splits the map into provinces.
import { bakeSurface, coastHeight } from '../render/bakeWorld';
import {
  PROTOCOL_VERSION,
  surfaceTransferables,
  versionErrorReply,
  type SurfaceConnect,
  type SurfaceRequest,
  type SurfaceResponse,
} from './protocol';

interface Scope {
  onmessage: ((e: MessageEvent<SurfaceConnect>) => void) | null;
  postMessage(msg: SurfaceResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const mismatch = versionErrorReply(e.data);
  if (mismatch) {
    scope.postMessage(mismatch);
    return;
  }
  e.data.port.onmessage = (req: MessageEvent<SurfaceRequest>) => bakeRequest(req.data);
  // The generation worker waits for this before it starts generating (genWorker.ts, SURFACE_READY_MS).
  scope.postMessage({ v: PROTOCOL_VERSION, type: 'ready' });
};

function bakeRequest(req: SurfaceRequest): void {
  const mismatch = versionErrorReply(req);
  if (mismatch) {
    scope.postMessage(mismatch);
    return;
  }
  const { id, height, biome, defs, w, h } = req;
  const start = performance.now();
  try {
    const coast = coastHeight(height, w, h);
    const bake = bakeSurface(height, biome, defs, w, h, coast);
    const ms = performance.now() - start;
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'done', id, bake, coast, ms }, [
      ...surfaceTransferables(bake),
      coast.buffer,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'error', id, message });
  }
}
