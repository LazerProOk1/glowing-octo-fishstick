import { dateOfTick } from '../game/calendar';
import { SPEEDS, type Clock } from '../game/clock';
import { formatDate, t } from '../i18n/ru';
import { el } from './dom';

/** What the plate shows: date text, speed index, pause flag. Pure, so it is easy to test. */
export function topBarState(c: Clock): { date: string; speed: number; paused: boolean } {
  return { date: formatDate(dateOfTick(c.tick)), speed: c.speed, paused: c.paused };
}

export interface TopBarActions {
  setSpeed(index: number): void;
  togglePause(): void;
}

/** Thin strip at the top edge: pause/play glyph | date | five speed pips. */
export class TopBar {
  private readonly root: HTMLElement;
  private readonly dateEl: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly pips: HTMLButtonElement[] = [];
  private last = '';

  constructor(parent: HTMLElement, actions: TopBarActions) {
    this.root = el('section', 'topbar');
    this.root.hidden = true;
    this.pauseBtn = this.button(t('bar.pause'), actions.togglePause);
    this.pauseBtn.classList.add('topbar__pause');
    this.pauseBtn.append(el('span', 'topbar__glyph'));
    this.dateEl = el('div', 'topbar__date');
    const speed = el('div', 'topbar__speed');
    SPEEDS.forEach((_, i) => {
      const b = this.button(`${t('bar.speed')} ${i + 1}`, () => actions.setSpeed(i));
      b.classList.add('topbar__pip');
      this.pips.push(b);
      speed.append(b);
    });
    this.root.append(this.pauseBtn, this.dateEl, speed);
    parent.append(this.root);
  }

  setVisible(on: boolean): void {
    this.root.hidden = !on;
    if (!on) this.last = '';
  }

  /** Touches the DOM only when the date, speed or pause changed. */
  update(c: Clock): void {
    const s = topBarState(c);
    const key = `${s.date}|${s.speed}|${s.paused}`;
    if (key === this.last) return;
    this.last = key;
    this.dateEl.textContent = s.date;
    this.root.classList.toggle('topbar--paused', s.paused);
    this.pauseBtn.setAttribute('aria-pressed', String(s.paused));
    this.pips.forEach((b, i) => b.classList.toggle('topbar__pip--on', i <= s.speed));
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'topbar__btn');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      onClick();
      b.blur(); // Space must pause the game, not "press" the button again
    });
    return b;
  }
}
