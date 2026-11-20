import { describe, expect, it } from 'vitest';
import {
  SPEEDS,
  advanceClock,
  faster,
  newClock,
  setSpeed,
  slower,
  togglePause,
} from '../../src/game/clock';

describe('clock', () => {
  it('starts paused at speed index 2', () => {
    expect(newClock()).toEqual({ tick: 0, speed: 2, paused: true, carryMs: 0 });
  });
  it('paused gives no ticks', () => {
    expect(advanceClock(newClock(), 1000).ticks).toBe(0);
  });
  it.each(SPEEDS.map((s, i) => [i, s] as const))('speed %i gives ~%i days per second', (i, days) => {
    let c = setSpeed(togglePause(newClock()), i);
    let total = 0;
    for (let ms = 0; ms < 1000; ms += 1000 / 60) {
      const r = advanceClock(c, 1000 / 60);
      c = r.clock;
      total += r.ticks;
    }
    expect(Math.abs(total - days)).toBeLessThanOrEqual(1);
    expect(c.tick).toBe(total);
  });
  it('one 10 s frame is capped and the carry dropped', () => {
    const c = setSpeed(togglePause(newClock()), 4);
    const r = advanceClock(c, 10000);
    expect(r.ticks).toBe(Math.ceil(SPEEDS[4] * 0.25));
    expect(r.clock.carryMs).toBe(0);
  });
  it('speed is clamped', () => {
    let c = newClock();
    for (let i = 0; i < 10; i++) c = faster(c);
    expect(c.speed).toBe(4);
    for (let i = 0; i < 10; i++) c = slower(c);
    expect(c.speed).toBe(0);
  });
});
