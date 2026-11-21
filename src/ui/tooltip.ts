import { t, translate } from '../i18n/ru';
import type { BiomeDef } from '../content/biomes/types';
import type { Province, World } from '../sim/world/types';
import { el } from './dom';

const OFFSET = 14;

/** Tooltip line: biome, land / sea / water (lake), coastal; capitalised. */
export function provinceInfo(p: Province, biomes: readonly BiomeDef[]): string {
  const def = biomes.find((b) => b.id === p.biome);
  const medium = p.water === 'lake' ? t('tip.water') : p.isLand ? t('tip.land') : t('tip.sea');
  const parts = [def ? translate(def.nameKey) : p.biome, medium];
  if (p.coastal) parts.push(t('tip.coastal'));
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Over fog only the guessable part: «Unexplored land/sea» and the terrain type. Lakes count as sea. */
export function fogInfo(p: Province, biomes: readonly BiomeDef[]): { title: string; info: string } {
  const def = biomes.find((b) => b.id === p.biome);
  const name = def ? translate(def.nameKey) : p.biome;
  return { title: t(p.isLand ? 'tip.unknownLand' : 'tip.unknownSea'), info: name.charAt(0).toUpperCase() + name.slice(1) };
}

/** Small tooltip at the cursor: province id; biome, land/sea, coastal. */
export class ProvinceTooltip {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private world: World | null = null;
  private id: number | null = null;
  /** Game visibility by province id; null — no fog, everything is shown. */
  private vis: Uint8Array | null = null;
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

  /** Visibility for the fog variant; null shows full info everywhere. */
  setVisibility(vis: Uint8Array | null): void {
    this.vis = vis;
    this.setProvince(this.id);
  }

  setProvince(id: number | null): void {
    this.id = id;
    const p = id !== null ? this.world?.provinces[id] : undefined;
    if (!p) {
      this.root.hidden = true;
      return;
    }
    const biomes = this.world?.biomes ?? [];
    if (this.vis && this.vis[p.id] !== 1) {
      const f = fogInfo(p, biomes);
      this.titleEl.textContent = f.title;
      this.infoEl.textContent = f.info;
    } else {
      this.titleEl.textContent = `${t('tip.province')} ${p.id}`;
      this.infoEl.textContent = provinceInfo(p, biomes);
    }
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

  /** Places the tooltip at the cursor without letting it leave the window edge. */
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
