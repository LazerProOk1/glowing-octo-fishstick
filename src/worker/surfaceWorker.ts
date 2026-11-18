// Вложенный воркер: запекает текстуры рельефа (высота, нормали, берег, цвета биомов),
// пока воркер генерации прокладывает реки и делит карту на провинции.
import { bakeSurface } from '../render/bakeWorld';
import { surfaceTransferables, type SurfaceRequest, type SurfaceResponse } from './protocol';

interface Scope {
  onmessage: ((e: MessageEvent<SurfaceRequest>) => void) | null;
  postMessage(msg: SurfaceResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { id, height, biome, w, h } = e.data;
  const start = performance.now();
  try {
    const bake = bakeSurface(height, biome, w, h);
    scope.postMessage({ type: 'done', id, bake, ms: performance.now() - start }, surfaceTransferables(bake));
  } catch (err) {
    scope.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
