import { t, translate } from '../i18n/ru';
import type { World } from '../sim/world/types';
import { LOAD_STEPS, type GenTimings, type LoadStep } from '../worker/protocol';
import { el, formatMs } from './dom';
import { keyLabel, type Hotkey } from './hotkeys';

/** Frame benchmark results (ms and fps); null instead means the benchmark is unavailable. The shape is defined by the panel, the renderer only produces it. */
export interface BenchResult {
  avg: number;
  p95: number;
  fps: number;
}

const FPS_INTERVAL_MS = 500;
const NONE = '-';

function row(label: string): { row: HTMLElement; value: HTMLElement } {
  const r = el('div', 'debug__row');
  const value = el('span', 'debug__value', NONE);
  r.append(el('span', 'debug__label', label), value);
  return { row: r, value };
}

/**
 * Debug panel (F3): seed, stage times, FPS, provinces, map mode, key list,
 * new-seed input. It does not listen for keys itself — it is opened from the registry (hotkeys.ts).
 */
export class DebugPanel {
  private readonly root: HTMLElement;
  private readonly seedValue: HTMLElement;
  private readonly fpsValue: HTMLElement;
  private readonly benchValue: HTMLElement;
  private readonly provValue: HTMLElement;
  private readonly landValue: HTMLElement;
  private readonly seaValue: HTMLElement;
  private readonly totalValue: HTMLElement;
  private readonly surfaceValue: HTMLElement;
  private readonly modeValue: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly stageValues = new Map<LoadStep, HTMLElement>();
  private readonly input: HTMLInputElement;
  private readonly benchBtn: HTMLButtonElement;
  private timer = 0;

  constructor(
    parent: HTMLElement,
    private readonly getFps: () => number,
    private readonly onSeed: (seed: string) => void,
    private readonly onBench: () => BenchResult | null,
  ) {
    this.root = el('section', 'debug ui-panel');
    this.root.hidden = true;
    this.root.setAttribute('aria-label', t('debug.title'));

    const head = el('div', 'debug__head');
    head.append(el('span', '', t('debug.title')), el('span', 'debug__hint', t('debug.hint')));

    const seed = row(t('debug.seed'));
    this.seedValue = seed.value;
    const fps = row(t('debug.fps'));
    this.fpsValue = fps.value;
    const bench = row(t('debug.frame'));
    this.benchValue = bench.value;
    const benchBtn = el('button', 'ui-button debug__bench', t('debug.bench'));
    benchBtn.type = 'button';
    benchBtn.addEventListener('click', this.runBench);
    this.benchBtn = benchBtn;
    const prov = row(t('debug.provinces'));
    this.provValue = prov.value;
    const land = row(t('debug.land'));
    this.landValue = land.value;
    const sea = row(t('debug.sea'));
    this.seaValue = sea.value;
    const mode = row(t('debug.mapMode'));
    this.modeValue = mode.value;
    land.row.classList.add('debug__row--sub');
    sea.row.classList.add('debug__row--sub');

    const timings = el('div', 'debug__group');
    timings.append(el('div', 'debug__section', t('debug.timings')));
    for (const s of LOAD_STEPS) {
      const r = row(t(`stageShort.${s}`));
      this.stageValues.set(s, r.value);
      timings.append(r.row);
    }
    const total = row(t('debug.total'));
    total.row.classList.add('debug__row--total');
    this.totalValue = total.value;
    const surface = row(t('debug.surface'));
    this.surfaceValue = surface.value;
    timings.append(total.row, surface.row);

    const field = el('label', 'debug__field');
    field.append(el('div', 'debug__section', t('debug.newSeed')));
    this.input = el('input', 'debug__input');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.placeholder = t('debug.placeholder');
    field.append(this.input);

    this.keys = el('div', 'debug__group');

    this.root.append(head, seed.row, fps.row, benchBtn, bench.row, prov.row, land.row, sea.row, mode.row, timings, this.keys, field);
    parent.append(this.root);

    // Enter in the seed field is the field's own behaviour, not a hotkey.
    this.input.addEventListener('keydown', this.onInputKey);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    window.clearInterval(this.timer);
    this.timer = 0;
    if (this.visible) {
      this.tickFps();
      this.timer = window.setInterval(this.tickFps, FPS_INTERVAL_MS);
    }
  }

  /** Name of the current map mode (translation key). */
  setMapMode(nameKey: string): void {
    this.modeValue.textContent = translate(nameKey);
  }

  /** Hotkey list: key — action. */
  setHotkeys(list: readonly Hotkey[]): void {
    this.keys.replaceChildren(el('div', 'debug__section', t('debug.keys')));
    for (const h of list) {
      const r = el('div', 'debug__row');
      r.append(el('span', 'debug__label', t(h.nameKey)), el('span', 'debug__value', keyLabel(h.code)));
      this.keys.append(r);
    }
  }

  setSeed(seed: string): void {
    this.seedValue.textContent = seed;
  }

  /** Details of the finished world; timings are the worker measurements (may be absent). */
  setWorld(world: World, timings: GenTimings | null): void {
    this.setSeed(world.params.seed);
    let land = 0;
    for (const p of world.provinces) if (p.isLand) land++;
    this.provValue.textContent = String(world.provinces.length);
    this.landValue.textContent = String(land);
    this.seaValue.textContent = String(world.provinces.length - land);
    for (const stage of LOAD_STEPS) {
      const v = this.stageValues.get(stage);
      if (v) v.textContent = timings ? formatMs(timings.stages[stage]) : NONE;
    }
    this.totalValue.textContent = timings ? formatMs(timings.total) : NONE;
    this.surfaceValue.textContent = timings?.surface !== undefined ? formatMs(timings.surface) : NONE;
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.root.remove();
  }

  private readonly tickFps = (): void => {
    this.fpsValue.textContent = String(Math.round(this.getFps()));
  };

  private readonly runBench = (): void => {
    if (this.benchBtn.disabled) return;
    this.benchBtn.disabled = true;
    this.benchValue.textContent = t('debug.benchRunning');
    // Let the browser paint the label, then measure (the benchmark blocks the thread for the frames).
    window.setTimeout(() => {
      try {
        const r = this.onBench();
        this.benchValue.textContent = r
          ? t('debug.benchResult')
              .replace('{avg}', r.avg.toFixed(1))
              .replace('{p95}', r.p95.toFixed(1))
              .replace('{fps}', String(Math.round(r.fps)))
          : t('debug.benchUnavailable');
      } finally {
        this.benchBtn.disabled = false;
      }
    }, 30);
  };

  private readonly onInputKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter') return;
    const seed = this.input.value.trim();
    if (!seed) return;
    this.input.value = '';
    this.input.blur();
    this.onSeed(seed);
  };
}
