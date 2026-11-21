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
  faster(): void;
  slower(): void;
}

/** Small plate centred at the top: date, pause label, five speed bars with −/+ buttons. */
export class TopBar {
  private readonly root: HTMLElement;
  private readonly dateEl: HTMLElement;
  private readonly pauseEl: HTMLElement;
  private readonly bars: HTMLButtonElement[] = [];
  private last = '';

  constructor(parent: HTMLElement, actions: TopBarActions) {
    this.root = el('section', 'topbar ui-panel');
    this.root.hidden = true;
    this.dateEl = el('div', 'topbar__date');
    this.pauseEl = el('div', 'topbar__pause', t('bar.pause'));
    const row = el('div', 'topbar__speed');
    row.append(this.button('−', t('bar.slower'), actions.slower));
    SPEEDS.forEach((_, i) => {
      const b = this.button('', `${t('bar.speed')} ${i + 1}`, () => actions.setSpeed(i));
      b.classList.add('topbar__bar');
      this.bars.push(b);
      row.append(b);
    });
    row.append(this.button('+', t('bar.faster'), actions.faster));
    this.root.append(this.dateEl, row, this.pauseEl);
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
    this.pauseEl.style.visibility = s.paused ? 'visible' : 'hidden';
    this.bars.forEach((b, i) => b.classList.toggle('topbar__bar--on', i <= s.speed));
  }

  private button(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'topbar__btn', text);
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
