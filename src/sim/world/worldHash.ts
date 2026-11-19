// Short world hash: all players in an online game must have the same world (docs/architecture.md,
// "Readiness for stage 2"). The only world hash implementation in the project.
import { GEN_VERSION } from './params';
import type { World } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Continues FNV-1a (32 bit) with the bytes of an array. */
function fnvBytes(h: number, v: ArrayBufferView): number {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, FNV_PRIME);
  }
  return h;
}

/** Continues FNV-1a with a string: both bytes of each UTF-16 code, without TextEncoder. */
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

/** FNV-1a (32 bit) over the bytes of one array, 8 hex characters. */
export function fnv1a(v: ArrayBufferView): string {
  return hex(fnvBytes(FNV_OFFSET, v));
}

/** World params and enabled biomes (ids in code order) as a string with a fixed field order. */
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
 * World hash (8 hex characters) over the params, biome list, generator version, size, height,
 * climate (temperature, moisture, arcana), cell biomes, rivers and cell provinces.
 * The province list, adjacency edges, water type, coastal flag and `lakeside` are derived from these
 * arrays with exact arithmetic (comparisons and integer counters), so they are not hashed separately.
 * Two worlds with the same hash match bit for bit in these arrays (up to 32-bit hash collisions).
 * Needed when joining an online game: if the player's hash differs from the host's, the host sends it.
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
