// Короткий хеш мира: у всех игроков онлайн-партии должен быть один и тот же мир (docs/architecture.md,
// «Готовность к этапу 2»). Единственная реализация хеша мира в проекте.
import { GEN_VERSION } from './params';
import type { World } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Продолжает FNV-1a (32 бита) байтами массива. */
function fnvBytes(h: number, v: ArrayBufferView): number {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, FNV_PRIME);
  }
  return h;
}

/** Продолжает FNV-1a строкой: оба байта каждого кода UTF-16, без TextEncoder. */
function fnvString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h ^= c & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= c >>> 8;
    h = Math.imul(h, FNV_PRIME);
  }
  return h;
}

function hex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** FNV-1a (32 бита) по байтам одного массива, 8 hex-символов. */
export function fnv1a(v: ArrayBufferView): string {
  return hex(fnvBytes(FNV_OFFSET, v));
}

/** Параметры мира и включённые биомы (id по порядку кодов) строкой с постоянным порядком полей. */
function paramsKey(world: World): string {
  const p = world.params;
  return JSON.stringify([
    p.genVersion,
    p.seed,
    p.packs,
    p.options.fantasy,
    p.options.disabledBiomes,
    p.options.size,
    world.biomes.map((b) => b.id),
  ]);
}

/**
 * Хеш мира (8 hex-символов) по параметрам, списку биомов, версии генератора, размеру, высоте,
 * климату (температура, влажность, аркана), биомам клеток, рекам и провинциям клеток.
 * Список провинций, рёбра соседства, тип воды, прибрежность и `lakeside` выводятся из этих массивов
 * точной арифметикой (сравнения и целые счётчики), поэтому отдельно не хешируются.
 * Два мира с одним хешем побитно совпадают в этих массивах (с точностью до коллизий 32-битного хеша).
 * Нужен при входе в онлайн-игру: если хеш у игрока не совпал с хостом, мир присылает хост.
 */
export function worldHash(world: World): string {
  let h = FNV_OFFSET;
  h = fnvString(h, paramsKey(world));
  h = fnvString(h, `|v${GEN_VERSION}|${world.w}x${world.h}|`);
  h = fnvBytes(h, world.height);
  h = fnvBytes(h, world.temperature);
  h = fnvBytes(h, world.moisture);
  h = fnvBytes(h, world.arcana);
  h = fnvBytes(h, world.biome);
  h = fnvBytes(h, world.riverMask);
  h = fnvBytes(h, world.provinceOf);
  return hex(h);
}
