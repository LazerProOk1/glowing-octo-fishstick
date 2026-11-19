import { describe, expect, it } from 'vitest';
import { defaultParams, GEN_VERSION, type WorldParams } from '../src/sim/world/params';
import { buildWorldUrl, parseWorldUrl } from '../src/worldUrl';

/** Параметры по умолчанию с правками опций. */
function params(seed: string, options: Partial<WorldParams['options']> = {}, packs?: string[]): WorldParams {
  const p = defaultParams(seed);
  return { ...p, packs: packs ?? p.packs, options: { ...p.options, ...options } };
}

describe('parseWorldUrl', () => {
  it('все параметры: сид, фэнтези, размер, выключенные биомы (без повторов, по алфавиту)', () => {
    expect(parseWorldUrl('#Бета-7?fantasy=1&size=small&off=swamp,desert')).toEqual(
      params('Бета-7', { fantasy: true, size: 'small', disabledBiomes: ['desert', 'swamp'] }),
    );
    expect(parseWorldUrl('#x?off=swamp,desert,swamp')).toEqual(parseWorldUrl('#x?off=desert,swamp'));
  });

  it('версия генератора — текущая, паки по умолчанию — базовый', () => {
    const p = parseWorldUrl('#abc');
    expect(p.genVersion).toBe(GEN_VERSION);
    expect(p.packs).toEqual(['base']);
  });

  it('паки из адреса сохраняют порядок', () => {
    expect(parseWorldUrl('#abc?packs=base,ww2').packs).toEqual(['base', 'ww2']);
  });

  it('значения по умолчанию', () => {
    expect(parseWorldUrl('#abc')).toEqual(params('abc'));
    expect(parseWorldUrl('#abc').options).toEqual({ fantasy: false, disabledBiomes: [], size: 'medium' });
  });

  it('неизвестный размер → medium', () => {
    expect(parseWorldUrl('#abc?size=huge').options.size).toBe('medium');
    expect(parseWorldUrl('#abc?size=').options.size).toBe('medium');
    expect(parseWorldUrl('#abc?size=large').options.size).toBe('large');
  });

  it('сид в кодировке URI', () => {
    expect(parseWorldUrl(`#${encodeURIComponent('Бета-7')}?fantasy=1`)).toEqual(params('Бета-7', { fantasy: true }));
  });

  it('пустой адрес', () => {
    expect(parseWorldUrl('')).toEqual(params(''));
    expect(parseWorldUrl('#')).toEqual(params(''));
  });

  it('только сид, пробелы по краям убираются', () => {
    expect(parseWorldUrl('#%20abc%20')).toEqual(params('abc'));
  });

  it('лишние параметры и fantasy≠1 игнорируются', () => {
    expect(parseWorldUrl('#abc?foo=bar&fantasy=0&off=')).toEqual(params('abc'));
  });

  it('off= декодируется: закодированные id читаются так же, как обычные', () => {
    expect(parseWorldUrl('#x?off=%D0%BB%D0%B5%D1%81,desert').options.disabledBiomes).toEqual(['desert', 'лес']);
  });

  it('packs= без значений — паки по умолчанию', () => {
    expect(parseWorldUrl('#abc?packs=').packs).toEqual(['base']);
  });

  it('битая кодировка не роняет разбор', () => {
    expect(parseWorldUrl('#%E0%A4%A?fantasy=1').options.fantasy).toBe(true);
  });
});

describe('buildWorldUrl', () => {
  it('сид без опций: значения по умолчанию не пишутся', () => {
    expect(buildWorldUrl(params('1'))).toBe('#1');
    expect(buildWorldUrl(params('1', { size: 'medium' }))).toBe('#1');
  });

  it('пример из спецификации', () => {
    const url = buildWorldUrl(params('Бета-7', { fantasy: true, size: 'small', disabledBiomes: ['swamp'] }));
    expect(decodeURIComponent(url)).toBe('#Бета-7?fantasy=1&size=small&off=swamp');
  });

  it('обратная сборка совпадает с разбором', () => {
    const p = params('Бета-7', { fantasy: true, size: 'large', disabledBiomes: ['swamp', 'desert'] });
    const url = buildWorldUrl(p);
    expect(url).toBe(`#${encodeURIComponent('Бета-7')}?fantasy=1&size=large&off=desert,swamp`);
    expect(buildWorldUrl({ ...p, options: { ...p.options, disabledBiomes: ['desert', 'swamp', 'desert'] } })).toBe(url);
    expect(parseWorldUrl(url)).toEqual(params('Бета-7', { fantasy: true, size: 'large', disabledBiomes: ['desert', 'swamp'] }));
  });

  it('паки не по умолчанию переживают круг', () => {
    const p = params('x', {}, ['base', 'ww2']);
    expect(buildWorldUrl(p)).toBe('#x?packs=base,ww2');
    expect(parseWorldUrl(buildWorldUrl(p))).toEqual(p);
  });

  it('id биомов с «%», «+», кириллицей переживают круг; пустой список паков в адрес не пишется', () => {
    const p = params('x', { disabledBiomes: ['100%41', 'a+b', 'лес'].sort() });
    expect(parseWorldUrl(buildWorldUrl(p))).toEqual(p);
    expect(buildWorldUrl(params('x', {}, []))).toBe('#x');
  });

  it('сид со знаком вопроса и амперсандом переживает круг', () => {
    const p = params('a?b&c', { fantasy: true });
    expect(parseWorldUrl(buildWorldUrl(p))).toEqual(p);
  });
});
