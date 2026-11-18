// Адрес мира в hash: `#<seed>?fantasy=1&off=id1,id2`. Сид — в кодировке URI (кириллица,
// «?» и «&» в сиде переживают круг), параметры — после первого «?».
import type { GenOptions } from './content/biomes/types';

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Разбор `location.hash`; неизвестные параметры игнорируются. */
export function parseWorldUrl(hash: string): { seed: string; options: GenOptions } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const seed = decode(q < 0 ? raw : raw.slice(0, q)).trim();
  const options: GenOptions = {};
  if (q >= 0) {
    const params = new URLSearchParams(raw.slice(q + 1));
    if (params.get('fantasy') === '1') options.fantasy = true;
    const off = (params.get('off') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (off.length > 0) options.disabledBiomes = off;
  }
  return { seed, options };
}

/** Обратная сборка; пустые опции не пишутся. */
export function buildWorldUrl(seed: string, options: GenOptions): string {
  const params: string[] = [];
  if (options.fantasy) params.push('fantasy=1');
  if (options.disabledBiomes && options.disabledBiomes.length > 0) {
    params.push(`off=${options.disabledBiomes.map(encodeURIComponent).join(',')}`);
  }
  return `#${encodeURIComponent(seed)}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}
