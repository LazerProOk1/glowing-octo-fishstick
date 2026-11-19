// Адрес мира в hash: `#<seed>?fantasy=1&size=small&off=id1,id2&packs=base,x`. Сид — в кодировке
// URI (кириллица, «?» и «&» в сиде переживают круг), параметры — после первого «?».
// Значения по умолчанию в адрес не пишутся. Версия генератора в адрес не входит: адрес — рецепт
// мира для текущей версии (сохранения хранят WorldParams целиком, с версией).
import { DEFAULT_PACKS } from './content/registry';
import { DEFAULT_SIZE, defaultParams, isWorldSize, type WorldParams } from './sim/world/params';

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Выключенные биомы без повторов и по алфавиту: `off=a,b` и `off=b,a` — один и тот же мир. */
function normalizeOff(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Значения из URLSearchParams уже раскодированы (повторно не декодируем: «%41» в id остался бы «A»). Запятая разделяет id. */
function list(raw: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Разбор `location.hash`; неизвестные параметры игнорируются, неизвестный размер → medium. */
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
    // `packs=` с пустым списком — осознанный выбор «без паков», он переживает круг build → parse.
    if (params.has('packs')) out.packs = list(params.get('packs'));
  }
  return out;
}

/** Обратная сборка; значения по умолчанию не пишутся. */
export function buildWorldUrl(p: WorldParams): string {
  const params: string[] = [];
  if (p.options.fantasy) params.push('fantasy=1');
  if (p.options.size !== DEFAULT_SIZE) params.push(`size=${p.options.size}`);
  if (p.options.disabledBiomes.length > 0) {
    params.push(`off=${normalizeOff(p.options.disabledBiomes).map(encodeURIComponent).join(',')}`);
  }
  if (!sameList(p.packs, DEFAULT_PACKS)) params.push(`packs=${p.packs.map(encodeURIComponent).join(',')}`);
  return `#${encodeURIComponent(p.seed)}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}
