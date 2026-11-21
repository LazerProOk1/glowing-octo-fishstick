// Hotkey registry: all app keys in one list, one keydown handler per window.
import { t, type RuKey } from '../i18n/ru';

export interface Hotkey {
  id: string;
  /** KeyboardEvent.code — the physical key, independent of layout (same code on QWERTY and JCUKEN). */
  code: string;
  /** Translation key: what the key does (listed in the F3 panel). */
  nameKey: RuKey;
  action: () => void;
  /** Also fires while an input is focused (F-keys type nothing in an input). */
  allowInInput?: boolean;
}

/** What the handler is attached to (window; a fake in tests). */
export interface KeyTarget {
  addEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void;
}

/** Actions the app keys are bound to. */
export interface HotkeyActions {
  toggleDebug(): void;
  nextMapMode(): void;
  togglePause(): void;
  /** Speed index 0..4. */
  setSpeed(index: number): void;
  faster(): void;
  slower(): void;
  toggleFog(): void;
}

/** All app keys. A new key means a new entry here (and a nameKey translation in ru.ts). */
export function appHotkeys(a: HotkeyActions): Hotkey[] {
  return [
    { id: 'debug', code: 'F3', nameKey: 'key.debug', action: a.toggleDebug, allowInInput: true },
    { id: 'mapMode', code: 'KeyM', nameKey: 'key.mapMode', action: a.nextMapMode },
    { id: 'fog', code: 'F4', nameKey: 'key.fog', action: a.toggleFog, allowInInput: true },
    { id: 'pause', code: 'Space', nameKey: 'key.pause', action: a.togglePause },
    ...([1, 2, 3, 4, 5] as const).map((n) => ({
      id: `speed${n}`,
      code: `Digit${n}`,
      nameKey: `key.speed${n}` as const,
      action: () => a.setSpeed(n - 1),
    })),
    { id: 'faster', code: 'Equal', nameKey: 'key.faster', action: a.faster },
    { id: 'fasterNum', code: 'NumpadAdd', nameKey: 'key.faster', action: a.faster },
    { id: 'slower', code: 'Minus', nameKey: 'key.slower', action: a.slower },
    { id: 'slowerNum', code: 'NumpadSubtract', nameKey: 'key.slower', action: a.slower },
  ];
}

/** Key label for the list: KeyM → M, Digit1 → 1, F3 → F3, Equal → +. */
export function keyLabel(code: string): string {
  if (code === 'Space') return t('key.space');
  if (code === 'Equal') return '+';
  if (code === 'Minus') return '−';
  const num = /^Numpad(Add|Subtract)$/.exec(code);
  if (num) return `${t('key.num')} ${num[1] === 'Add' ? '+' : '−'}`;
  return code.replace(/^(Key|Digit)/, '');
}

/** Focus is in an input: keys must type text instead of switching the map. Checkboxes type nothing. */
function isEditable(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const t = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  return (t.tagName === 'INPUT' && t.type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true;
}

/**
 * Attaches one keydown handler to target (the window by default). Presses in inputs (except keys with
 * allowInInput) and Ctrl/Alt/Meta combinations are skipped (they stay with the browser). For its own key
 * the browser action is cancelled (F3 — page search), and auto-repeat while held does not trigger the action.
 * Returns an unsubscribe function.
 */
export function registerHotkeys(list: readonly Hotkey[], target: KeyTarget = window): () => void {
  const byCode = new Map<string, Hotkey>();
  for (const h of list) {
    if (byCode.has(h.code)) throw new Error(`duplicate hotkey code ${h.code}`);
    byCode.set(h.code, h);
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const h = byCode.get(e.code);
    if (!h) return;
    if (isEditable(e.target) && !h.allowInInput) return;
    e.preventDefault();
    if (!e.repeat) h.action();
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
