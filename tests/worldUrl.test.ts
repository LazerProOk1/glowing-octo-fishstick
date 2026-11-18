import { describe, expect, it } from 'vitest';
import { buildWorldUrl, parseWorldUrl } from '../src/worldUrl';

describe('parseWorldUrl', () => {
  it('сид, фэнтези и выключенные биомы', () => {
    expect(parseWorldUrl('#Бета-7?fantasy=1&off=swamp,desert')).toEqual({
      seed: 'Бета-7',
      options: { fantasy: true, disabledBiomes: ['swamp', 'desert'] },
    });
  });

  it('сид в кодировке URI', () => {
    expect(parseWorldUrl(`#${encodeURIComponent('Бета-7')}?fantasy=1`)).toEqual({
      seed: 'Бета-7',
      options: { fantasy: true },
    });
  });

  it('пустой адрес', () => {
    expect(parseWorldUrl('')).toEqual({ seed: '', options: {} });
    expect(parseWorldUrl('#')).toEqual({ seed: '', options: {} });
  });

  it('только сид, пробелы по краям убираются', () => {
    expect(parseWorldUrl('#%20abc%20')).toEqual({ seed: 'abc', options: {} });
  });

  it('лишние параметры и fantasy≠1 игнорируются', () => {
    expect(parseWorldUrl('#abc?foo=bar&fantasy=0&off=')).toEqual({ seed: 'abc', options: {} });
  });

  it('битая кодировка не роняет разбор', () => {
    expect(parseWorldUrl('#%E0%A4%A?fantasy=1').options).toEqual({ fantasy: true });
  });
});

describe('buildWorldUrl', () => {
  it('сид без опций', () => {
    expect(buildWorldUrl('1', {})).toBe('#1');
  });

  it('обратная сборка совпадает с разбором', () => {
    const url = buildWorldUrl('Бета-7', { fantasy: true, disabledBiomes: ['swamp', 'desert'] });
    expect(url).toBe(`#${encodeURIComponent('Бета-7')}?fantasy=1&off=swamp,desert`);
    expect(parseWorldUrl(url)).toEqual({ seed: 'Бета-7', options: { fantasy: true, disabledBiomes: ['swamp', 'desert'] } });
  });

  it('сид со знаком вопроса и амперсандом переживает круг', () => {
    const url = buildWorldUrl('a?b&c', { fantasy: true });
    expect(parseWorldUrl(url)).toEqual({ seed: 'a?b&c', options: { fantasy: true } });
  });
});
