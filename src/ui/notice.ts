import { el } from './dom';

const SHOW_MS = 1400;

/** Короткая надпись внизу по центру (например, название режима карты после переключения). */
export class Notice {
  private readonly root: HTMLElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'notice ui-panel');
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    parent.append(this.root);
  }

  show(text: string): void {
    this.root.textContent = text;
    this.root.hidden = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.root.hidden = true;
    }, SHOW_MS);
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.root.remove();
  }
}
