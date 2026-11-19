import { describe, expect, it } from 'vitest';
import { defaultParams, GEN_VERSION, type WorldParams } from '../src/sim/world/params';
import { buildWorldUrl, parseWorldUrl } from '../src/worldUrl';

/** Default params with option overrides. */
function params(seed: string, options: Partial<WorldParams['options']> = {}, packs?: string[]): WorldParams {
  const p = defaultParams(seed);
  return { ...p, packs: packs ?? p.packs, options: { ...p.options, ...options } };
}

describe('parseWorldUrl', () => {
  it('all params: seed, fantasy, size, disabled biomes (no duplicates, alphabetical)', () => {
    expect(parseWorldUrl('#Бета-7?fantasy=1&size=small&off=swamp,desert')).toEqual(
      params('Бета-7', { fantasy: true, size: 'small', disabledBiomes: ['desert', 'swamp'] }),
    );
    expect(parseWorldUrl('#x?off=swamp,desert,swamp')).toEqual(parseWorldUrl('#x?off=desert,swamp'));
  });

  it('the generator version is current, the default packs are the base pack', () => {
    const p = parseWorldUrl('#abc');
    expect(p.genVersion).toBe(GEN_VERSION);
    expect(p.packs).toEqual(['base']);
  });

  it('packs from the address keep their order', () => {
    expect(parseWorldUrl('#abc?packs=base,ww2').packs).toEqual(['base', 'ww2']);
  });

  it('default values', () => {
    expect(parseWorldUrl('#abc')).toEqual(params('abc'));
    expect(parseWorldUrl('#abc').options).toEqual({ fantasy: false, disabledBiomes: [], size: 'medium' });
  });

  it('an unknown size → medium', () => {
    expect(parseWorldUrl('#abc?size=huge').options.size).toBe('medium');
    expect(parseWorldUrl('#abc?size=').options.size).toBe('medium');
    expect(parseWorldUrl('#abc?size=large').options.size).toBe('large');
  });

  it('the seed is URI encoded', () => {
    expect(parseWorldUrl(`#${encodeURIComponent('Бета-7')}?fantasy=1`)).toEqual(params('Бета-7', { fantasy: true }));
  });

  it('an empty address', () => {
    expect(parseWorldUrl('')).toEqual(params(''));
    expect(parseWorldUrl('#')).toEqual(params(''));
  });

  it('seed only, surrounding spaces are trimmed', () => {
    expect(parseWorldUrl('#%20abc%20')).toEqual(params('abc'));
  });

  it('extra params and fantasy≠1 are ignored', () => {
    expect(parseWorldUrl('#abc?foo=bar&fantasy=0&off=')).toEqual(params('abc'));
  });

  it('off= is decoded: encoded ids read the same as plain ones', () => {
    expect(parseWorldUrl('#x?off=%D0%BB%D0%B5%D1%81,desert').options.disabledBiomes).toEqual(['desert', 'лес']);
  });

  it('packs= without values — default packs', () => {
    expect(parseWorldUrl('#abc?packs=').packs).toEqual(['base']);
  });

  it('broken encoding does not crash the parsing', () => {
    expect(parseWorldUrl('#%E0%A4%A?fantasy=1').options.fantasy).toBe(true);
  });
});

describe('buildWorldUrl', () => {
  it('seed without options: default values are not written', () => {
    expect(buildWorldUrl(params('1'))).toBe('#1');
    expect(buildWorldUrl(params('1', { size: 'medium' }))).toBe('#1');
  });

  it('example from the spec', () => {
    const url = buildWorldUrl(params('Бета-7', { fantasy: true, size: 'small', disabledBiomes: ['swamp'] }));
    expect(decodeURIComponent(url)).toBe('#Бета-7?fantasy=1&size=small&off=swamp');
  });

  it('reverse assembly matches the parsing', () => {
    const p = params('Бета-7', { fantasy: true, size: 'large', disabledBiomes: ['swamp', 'desert'] });
    const url = buildWorldUrl(p);
    expect(url).toBe(`#${encodeURIComponent('Бета-7')}?fantasy=1&size=large&off=desert,swamp`);
    expect(buildWorldUrl({ ...p, options: { ...p.options, disabledBiomes: ['desert', 'swamp', 'desert'] } })).toBe(url);
    expect(parseWorldUrl(url)).toEqual(params('Бета-7', { fantasy: true, size: 'large', disabledBiomes: ['desert', 'swamp'] }));
  });

  it('non-default packs survive the round trip', () => {
    const p = params('x', {}, ['base', 'ww2']);
    expect(buildWorldUrl(p)).toBe('#x?packs=base,ww2');
    expect(parseWorldUrl(buildWorldUrl(p))).toEqual(p);
  });

  it('biome ids with "%", "+" and cyrillic survive the round trip; an empty pack list is not written', () => {
    const p = params('x', { disabledBiomes: ['100%41', 'a+b', 'лес'].sort() });
    expect(parseWorldUrl(buildWorldUrl(p))).toEqual(p);
    expect(buildWorldUrl(params('x', {}, []))).toBe('#x');
  });

  it('a seed with a question mark and an ampersand survives the round trip', () => {
    const p = params('a?b&c', { fantasy: true });
    expect(parseWorldUrl(buildWorldUrl(p))).toEqual(p);
  });
});
