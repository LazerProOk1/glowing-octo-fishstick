import { describe, expect, it } from 'vitest';
import { dateOfTick } from '../../src/game/calendar';
import { formatDate } from '../../src/i18n/ru';

describe('calendar', () => {
  it('tick 0 is 1 March 3000 BC', () => {
    expect(dateOfTick(0)).toEqual({ day: 1, month: 3, year: -3000 });
    expect(formatDate(dateOfTick(0))).toBe('1 марта 3000 г. до н. э.');
  });
  it('month and year edges', () => {
    expect(dateOfTick(30)).toEqual({ day: 31, month: 3, year: -3000 });
    expect(dateOfTick(31)).toEqual({ day: 1, month: 4, year: -3000 });
    // 31 Dec 3000 BC = day 364 of year; start is day 59
    expect(dateOfTick(305)).toEqual({ day: 31, month: 12, year: -3000 });
    expect(dateOfTick(306)).toEqual({ day: 1, month: 1, year: -2999 });
  });
  it('28 February goes to 1 March', () => {
    expect(dateOfTick(306 + 58)).toEqual({ day: 28, month: 2, year: -2999 });
    expect(dateOfTick(306 + 59)).toEqual({ day: 1, month: 3, year: -2999 });
  });
  it('365 ticks are one year', () => {
    expect(dateOfTick(365)).toEqual({ day: 1, month: 3, year: -2999 });
  });
  it('1 BC is followed by 1 AD, no year 0', () => {
    const ticksToJan1AD = 2999 * 365 + 306; // 1 Jan of year index 3000
    expect(dateOfTick(ticksToJan1AD - 1)).toEqual({ day: 31, month: 12, year: -1 });
    expect(dateOfTick(ticksToJan1AD)).toEqual({ day: 1, month: 1, year: 1 });
    expect(formatDate(dateOfTick(ticksToJan1AD))).toBe('1 января 1 г. н. э.');
  });
});
