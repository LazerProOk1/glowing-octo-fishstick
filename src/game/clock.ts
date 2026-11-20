/** Game clock: pure functions, the caller feeds real frame time. */

/** Game days per real second, by speed index. */
export const SPEEDS = [1, 2, 5, 10, 30] as const;

export interface Clock {
  tick: number;
  /** Index into SPEEDS, 0..4. */
  speed: number;
  paused: boolean;
  /** Real milliseconds not yet turned into a tick. */
  carryMs: number;
}

export function newClock(): Clock {
  return { tick: 0, speed: 2, paused: true, carryMs: 0 };
}

/**
 * Advances by dtMs of real time. At most ceil(speed * 0.25) ticks per call: after a hidden tab or a
 * slow frame the excess time is dropped instead of running hundreds of days at once.
 */
export function advanceClock(c: Clock, dtMs: number): { clock: Clock; ticks: number } {
  if (c.paused) return { clock: c, ticks: 0 };
  const perSec = SPEEDS[c.speed] ?? SPEEDS[2];
  const total = c.carryMs + dtMs;
  let ticks = Math.floor((total * perSec) / 1000);
  let carryMs = total - (ticks * 1000) / perSec;
  const max = Math.ceil(perSec * 0.25);
  if (ticks > max) {
    ticks = max;
    carryMs = 0;
  }
  return { clock: { ...c, tick: c.tick + ticks, carryMs }, ticks };
}

export function setSpeed(c: Clock, speed: number): Clock {
  return { ...c, speed: Math.min(SPEEDS.length - 1, Math.max(0, Math.round(speed))) };
}

export const faster = (c: Clock): Clock => setSpeed(c, c.speed + 1);
export const slower = (c: Clock): Clock => setSpeed(c, c.speed - 1);
export const togglePause = (c: Clock): Clock => ({ ...c, paused: !c.paused });
