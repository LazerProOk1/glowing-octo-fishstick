import { t, translate } from '../i18n/ru';
import type { World } from '../sim/world/types';
import { el } from './dom';

const OFFSET = 14;

/** Небольшая подсказка у курсора: номер провинции; биом, суша/море, прибрежная. */
export class ProvinceTooltip {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private world: World | null = null;
  private id: number | null = null;
  private x = 0;
  private y = 0;
  private pressed = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'tooltip ui-panel');
    this.root.hidden = true;
    this.root.setAttribute('role', 'tooltip');
    this.titleEl = el('div', 'tooltip__title');
    this.infoEl = el('div', 'tooltip__info');
    this.root.append(this.titleEl, this.infoEl);
    parent.append(this.root);
    window.addEventListener('pointermove', this.onMove);
  }

  setWorld(world: World | null): void {
    this.world = world;
    this.setProvince(null);
  }

  setProvince(id: number | null): void {
    this.id = id;
    const p = id !== null ? this.world?.provinces[id] : undefined;
    if (!p) {
      this.root.hidden = true;
      return;
    }
    this.titleEl.textContent = `${t('tip.province')} ${p.id}`;
    const def = this.world?.biomes.find((b) => b.id === p.biome);
    const parts = [def ? translate(def.nameKey) : p.biome, p.isLand ? t('tip.land') : t('tip.sea')];
    if (p.coastal) parts.push(t('tip.coastal'));
    this.infoEl.textContent = parts.join(' · ');
    this.update();
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onMove);
    this.root.remove();
  }

  private readonly onMove = (e: PointerEvent): void => {
    this.x = e.clientX;
    this.y = e.clientY;
    this.pressed = e.buttons !== 0;
    this.update();
  };

  /** Ставит подсказку у курсора, не давая ей уйти за край окна. */
  private update(): void {
    const visible = this.id !== null && !this.pressed && this.world !== null;
    this.root.hidden = !visible;
    if (!visible) return;
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    let left = this.x + OFFSET;
    let top = this.y + OFFSET;
    if (left + w > window.innerWidth - 4) left = this.x - OFFSET - w;
    if (top + h > window.innerHeight - 4) top = this.y - OFFSET - h;
    this.root.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`;
  }
}
