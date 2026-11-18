import { t } from '../i18n/ru';
import { LOAD_STEPS, type LoadStep } from '../worker/protocol';
import { el, formatSeconds, NBSP } from './dom';

/**
 * Компактный блок загрузки: название этапа, номер этапа, полоса по этапам и время.
 * Время обновляется из requestAnimationFrame: если главный поток встанет, счётчик замрёт,
 * так что блок заодно показывает, что генерация идёт в воркере.
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
    // Счётчик меняется каждый кадр — читалке экрана он не нужен (иначе живой регион не умолкает).
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

  /** Показывает блок для нового зерна. */
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

  /** Убирает блок сразу. */
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
