/** Game calendar: 365-day years, fixed month lengths, no leap years. Tick 0 = 1 March 3000 BC. */

export const START_YEAR = -3000;

export interface GameDate {
  day: number;
  /** 1..12 */
  month: number;
  /** BC is negative, there is no year 0: ... -2, -1, 1, 2 ... */
  year: number;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const YEAR_DAYS = 365;
/** Days from 1 January to 1 March. */
const START_DAY_OF_YEAR = 59;

export function dateOfTick(tick: number): GameDate {
  const total = tick + START_DAY_OF_YEAR;
  const yearIndex = Math.floor(total / YEAR_DAYS);
  let rest = total - yearIndex * YEAR_DAYS;
  let month = 1;
  for (const len of MONTH_DAYS) {
    if (rest < len) break;
    rest -= len;
    month++;
  }
  const y = START_YEAR + yearIndex;
  return { day: rest + 1, month, year: y >= 0 ? y + 1 : y };
}
