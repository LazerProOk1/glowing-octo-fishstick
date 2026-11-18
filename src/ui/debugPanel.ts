import { t } from '../i18n/ru';
import type { World } from '../sim/world/types';
import { LOAD_STEPS, type GenTimings, type LoadStep } from '../worker/protocol';
import { el, formatMs } from './dom';

const FPS_INTERVAL_MS = 500;
const NONE = '-';

function row(label: string): { row: HTMLElement; value: HTMLElement } {
  const r = el('div', 'debug__row');
  const value = el('span', 'debug__value', NONE);
  r.append(el('span', 'debug__label', label), value);
  return { row: r, value };
}

/** Панель отладки (F3): зерно, время этапов, FPS, провинции, ввод нового зерна. */
export class DebugPanel {
  private readonly root: HTMLElement;
  private readonly seedValue: HTMLElement;
  private readonly fpsValue: HTMLElement;
  private readonly provValue: HTMLElement;
  private readonly landValue: HTMLElement;
  private readonly seaValue: HTMLElement;
  private readonly totalValue: HTMLElement;
  private readonly surfaceValue: HTMLElement;
  private readonly stageValues = new Map<LoadStep, HTMLElement>();
  private readonly input: HTMLInputElement;
  private timer = 0;

  constructor(
    parent: HTMLElement,
    private readonly getFps: () => number,
    private readonly onSeed: (seed: string) => void,
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
    const prov = row(t('debug.provinces'));
    this.provValue = prov.value;
    const land = row(t('debug.land'));
    this.landValue = land.value;
    const sea = row(t('debug.sea'));
    this.seaValue = sea.value;
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

    this.root.append(head, seed.row, fps.row, prov.row, land.row, sea.row, timings, field);
    parent.append(this.root);

    this.input.addEventListener('keydown', this.onInputKey);
    window.addEventListener('keydown', this.onKey);
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

  setSeed(seed: string): void {
    this.seedValue.textContent = seed;
  }

  /** Сведения о готовом мире; timings — замеры воркера (может не быть). */
  setWorld(world: World, timings: GenTimings | null): void {
    this.setSeed(world.seed);
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
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  private readonly tickFps = (): void => {
    this.fpsValue.textContent = String(Math.round(this.getFps()));
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'F3') return;
    e.preventDefault(); // F3 в браузере — поиск по странице
    this.toggle();
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
