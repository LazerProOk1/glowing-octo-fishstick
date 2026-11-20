// World address in the hash: `#<seed>?fantasy=1&size=small&off=id1,id2&packs=base,x`. The seed is URI
// encoded (cyrillic, "?" and "&" in the seed survive the round trip), the params go after the first "?".
// Default values are not written to the address. The generator version is not part of it: the address is
// a world recipe for the current version (saves store WorldParams whole, with the version).
import { DEFAULT_PACKS } from './content/registry';
import { DEFAULT_SIZE, defaultParams, isWorldSize, type WorldParams } from './sim/world/params';

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Disabled biomes without duplicates, alphabetical: `off=a,b` and `off=b,a` are the same world. */
function normalizeOff(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Values from URLSearchParams are already decoded (we do not decode again: "%41" in an id would stay "A"). A comma separates ids. */
function list(raw: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Parses `location.hash`; unknown params are ignored, an unknown size → medium. */
export function parseWorldUrl(hash: string): WorldParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const out = defaultParams(decode(q < 0 ? raw : raw.slice(0, q)).trim());
  if (q >= 0) {
    const params = new URLSearchParams(raw.slice(q + 1));
    out.options.fantasy = params.get('fantasy') === '1';
    const size = params.get('size') ?? DEFAULT_SIZE;
    out.options.size = isWorldSize(size) ? size : DEFAULT_SIZE;
    out.options.disabledBiomes = normalizeOff(list(params.get('off')));
    // Empty `packs=` (truncated link) — default packs: the world cannot be built without packs.
    const packs = list(params.get('packs'));
    if (packs.length > 0) out.packs = packs;
  }
  return out;
}

/** Reverse assembly; default values are not written. */
export function buildWorldUrl(p: WorldParams): string {
  const params: string[] = [];
  if (p.options.fantasy) params.push('fantasy=1');
  if (p.options.size !== DEFAULT_SIZE) params.push(`size=${p.options.size}`);
  if (p.options.disabledBiomes.length > 0) {
    params.push(`off=${normalizeOff(p.options.disabledBiomes).map(encodeURIComponent).join(',')}`);
  }
  if (p.packs.length > 0 && !sameList(p.packs, DEFAULT_PACKS)) params.push(`packs=${p.packs.map(encodeURIComponent).join(',')}`);
  return `#${encodeURIComponent(p.seed.trim())}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}
