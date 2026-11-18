// Вложенный воркер: запекает текстуры рельефа (высота, нормали, берег, цвета биомов),
// пока воркер генерации прокладывает реки и делит карту на провинции.
import { bakeSurface } from '../render/bakeWorld';
import {
  PROTOCOL_VERSION,
  surfaceTransferables,
  versionErrorReply,
  type SurfaceRequest,
  type SurfaceResponse,
} from './protocol';

interface Scope {
  onmessage: ((e: MessageEvent<SurfaceRequest>) => void) | null;
  postMessage(msg: SurfaceResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const mismatch = versionErrorReply(e.data);
  if (mismatch) {
    scope.postMessage(mismatch);
    return;
  }
  const { id, height, biome, defs, w, h } = e.data;
  const start = performance.now();
  try {
    const bake = bakeSurface(height, biome, defs, w, h);
    const ms = performance.now() - start;
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'done', id, bake, ms }, surfaceTransferables(bake));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    scope.postMessage({ v: PROTOCOL_VERSION, type: 'error', id, message });
  }
};
