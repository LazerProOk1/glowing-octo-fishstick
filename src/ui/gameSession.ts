import { advanceClock, faster, newClock, setSpeed, slower, togglePause, type Clock } from '../game/clock';
import { pickStartProvince } from '../game/start';
import { startVisibility } from '../game/visibility';
import type { MapView } from '../render/MapView';
import type { World } from '../sim/world/types';
import { TopBar } from './topBar';
import type { ProvinceTooltip } from './tooltip';

const FLIGHT_MS = 1500;

/**
 * Per-world game state on the main thread: clock, start province, fog and the top bar.
 * start() builds all of it from scratch, reset() drops it — nothing survives a new world.
 */
export class GameSession {
  private readonly bar: TopBar;
  private clock: Clock | null = null;
  private vis: Uint8Array | null = null;
  private fogOff = false;

  constructor(
    parent: HTMLElement,
    private readonly view: MapView,
    private readonly tooltip: ProvinceTooltip,
    private readonly onFogOff: (off: boolean) => void,
  ) {
    this.bar = new TopBar(parent, {
      setSpeed: (i) => this.setSpeed(i),
      faster: () => this.faster(),
      slower: () => this.slower(),
    });
  }

  /** Call right after view.setWorld(world): start province, fog from zero, camera flight, paused clock. */
  start(world: World): void {
    const start = pickStartProvince(world);
    this.vis = startVisibility(world, start);
    this.view.setOwnProvinces([start]);
    this.view.setVisibility(this.vis);
    this.setFogOff(false);
    const to = this.view.startView(start);
    if (to) this.view.flyTo(to.cell, to.zoom, FLIGHT_MS);
    this.clock = newClock();
    this.bar.update(this.clock);
    this.bar.setVisible(true);
  }

  /** A new world is being built: the old game is gone. */
  reset(): void {
    this.clock = null;
    this.vis = null;
    this.bar.setVisible(false);
  }

  /** Per frame, real milliseconds. */
  tick(dtMs: number): void {
    if (!this.clock) return;
    this.clock = advanceClock(this.clock, dtMs).clock;
    this.bar.update(this.clock);
  }

  togglePause = (): void => this.change(togglePause);
  // Choosing a speed also starts the time (spec 8.1: time runs after Space or a speed button).
  setSpeed = (i: number): void => this.change((c) => ({ ...setSpeed(c, i), paused: false }));
  faster = (): void => this.change((c) => ({ ...faster(c), paused: false }));
  slower = (): void => this.change((c) => ({ ...slower(c), paused: false }));

  /** "No fog": shows the whole world, game visibility is untouched. */
  setFogOff(off: boolean): void {
    this.fogOff = off;
    this.view.setFogEnabled(!off);
    this.tooltip.setVisibility(off ? null : this.vis);
    this.onFogOff(off);
  }

  toggleFog(): void {
    this.setFogOff(!this.fogOff);
  }

  private change(f: (c: Clock) => Clock): void {
    if (!this.clock) return;
    this.clock = f(this.clock);
    this.bar.update(this.clock);
  }
}
