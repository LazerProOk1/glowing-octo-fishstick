import { t } from '../i18n/ru';
import { LOAD_STEPS, type LoadStep } from '../worker/protocol';
import { el, formatSeconds, NBSP } from './dom';

/**
 * Compact loading block: stage name, stage number, progress bar over the stages and time.
 * The time updates from requestAnimationFrame: if the main thread stalls, the counter freezes,
 * so the block also shows that generation runs in the worker.
 */
export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly seedEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly elapsedEl: HTMLElement;
  private raf = 0;
  private startedAt = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'loading ui-panel');
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');

    const head = el('div', 'loading__head');
    this.elapsedEl = el('span', 'loading__elapsed');
    // The counter changes every frame — a screen reader does not need it (otherwise the live region never goes quiet).
    this.elapsedEl.setAttribute('aria-hidden', 'true');
    head.append(el('h1', 'loading__title', t('loading.title')), this.elapsedEl);
    this.seedEl = el('div', 'loading__seed');
    const stage = el('div', 'loading__stage');
    this.stageEl = el('span', 'loading__stage-name');
    this.countEl = el('span', 'loading__count');
    stage.append(this.stageEl, this.countEl);
    const track = el('div', 'loading__track');
    this.fill = el('div', 'loading__fill');
    track.append(this.fill);
    this.root.append(head, this.seedEl, stage, track);
    parent.append(this.root);
  }

  /** Shows the block for a new seed. */
  show(seed: string): void {
    this.root.hidden = false;
    this.seedEl.textContent = `${t('loading.seed')}: ${seed}`;
    this.setStep(0);
    this.startedAt = performance.now();
    this.elapsedEl.textContent = `${formatSeconds(0)}${NBSP}${t('unit.s')}`;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  setStage(stage: LoadStep): void {
    const i = LOAD_STEPS.indexOf(stage);
    if (i >= 0) this.setStep(i);
  }

  /** Removes the block immediately. */
  hide(): void {
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private setStep(i: number): void {
    const step = LOAD_STEPS[i] ?? LOAD_STEPS[0];
    this.stageEl.textContent = t(`stage.${step}`);
    this.countEl.textContent = `${i + 1}/${LOAD_STEPS.length}`;
    this.fill.style.width = `${((i / LOAD_STEPS.length) * 100).toFixed(1)}%`;
  }

  private readonly frame = (now: number): void => {
    this.elapsedEl.textContent = `${formatSeconds(now - this.startedAt)}${NBSP}${t('unit.s')}`;
    this.raf = requestAnimationFrame(this.frame);
  };
}
