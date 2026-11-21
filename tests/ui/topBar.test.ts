import { describe, expect, it } from 'vitest';
import { newClock, togglePause } from '../../src/game/clock';
import { topBarState } from '../../src/ui/topBar';

describe('topBarState', () => {
  it('start: paused, speed 3, 1 March 3000 BC', () => {
    expect(topBarState(newClock())).toEqual({ date: '1 марта 3000 г. до н. э.', speed: 2, paused: true });
  });
  it('date follows the tick, pause follows the clock', () => {
    const c = togglePause({ ...newClock(), tick: 31 });
    expect(topBarState(c)).toEqual({ date: '1 апреля 3000 г. до н. э.', speed: 2, paused: false });
  });
});
