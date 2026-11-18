// Реестр горячих клавиш: все клавиши приложения в одном списке, один обработчик keydown на окно.
import type { RuKey } from '../i18n/ru';

export interface Hotkey {
  id: string;
  /** KeyboardEvent.code — физическая клавиша, не зависит от раскладки (M = Ь). */
  code: string;
  /** Ключ перевода: что делает клавиша (список в панели F3). */
  nameKey: RuKey;
  action: () => void;
}

/** То, на что вешается обработчик (window; в тестах — подделка). */
export interface KeyTarget {
  addEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void;
}

/** Действия, к которым привязаны клавиши приложения. */
export interface HotkeyActions {
  toggleDebug(): void;
  nextMapMode(): void;
}

/** Все клавиши приложения. Новая клавиша — новая запись здесь (и перевод nameKey в ru.ts). */
export function appHotkeys(a: HotkeyActions): Hotkey[] {
  return [
    { id: 'debug', code: 'F3', nameKey: 'key.debug', action: a.toggleDebug },
    { id: 'mapMode', code: 'KeyM', nameKey: 'key.mapMode', action: a.nextMapMode },
  ];
}

/** Подпись клавиши для списка: KeyM → M, Digit1 → 1, F3 → F3. */
export function keyLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, '');
}

/** Фокус в поле ввода: клавиши должны печатать текст, а не переключать карту. */
function isEditable(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const t = target as { tagName?: unknown; isContentEditable?: unknown };
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true;
}

/**
 * Вешает один обработчик keydown на target (по умолчанию окно). Нажатия в полях ввода и
 * сочетания с Ctrl/Alt/Meta пропускаются (они остаются браузеру). У своей клавиши отменяется
 * действие браузера (F3 — поиск по странице), автоповтор при удержании действие не вызывает.
 * Возвращает отписку.
 */
export function registerHotkeys(list: readonly Hotkey[], target: KeyTarget = window): () => void {
  const byCode = new Map<string, Hotkey>();
  for (const h of list) {
    if (byCode.has(h.code)) throw new Error(`duplicate hotkey code ${h.code}`);
    byCode.set(h.code, h);
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey || isEditable(e.target)) return;
    const h = byCode.get(e.code);
    if (!h) return;
    e.preventDefault();
    if (!e.repeat) h.action();
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
