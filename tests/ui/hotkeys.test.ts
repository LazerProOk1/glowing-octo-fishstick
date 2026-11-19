import { describe, expect, it } from 'vitest';
import { ru } from '../../src/i18n/ru';
import { appHotkeys, keyLabel, registerHotkeys, type Hotkey, type KeyTarget } from '../../src/ui/hotkeys';

type Listener = (e: KeyboardEvent) => void;

/** Fake window: stores the keydown handlers. */
function fakeTarget(): KeyTarget & { listeners: Set<Listener>; press(e: Partial<KeyEventLike>): KeyEventLike } {
  const listeners = new Set<Listener>();
  return {
    listeners,
    addEventListener: (_type, l) => listeners.add(l),
    removeEventListener: (_type, l) => listeners.delete(l),
    press(init) {
      const e: KeyEventLike = {
        code: '',
        repeat: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: null,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...init,
      };
      for (const l of listeners) l(e as unknown as KeyboardEvent);
      return e;
    },
  };
}

interface KeyEventLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: unknown;
  defaultPrevented: boolean;
  preventDefault(): void;
}

function counter(): { list: Hotkey[]; calls: Record<string, number> } {
  const calls: Record<string, number> = { debug: 0, mapMode: 0 };
  const list = appHotkeys({
    toggleDebug: () => calls.debug!++,
    nextMapMode: () => calls.mapMode!++,
  });
  return { list, calls };
}

describe('hotkeys', () => {
  it('the app list has no duplicate codes or ids, every key has a translation', () => {
    const { list } = counter();
    const codes = list.map((h) => h.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(list.map((h) => h.id)).size).toBe(list.length);
    for (const h of list) expect(ru).toHaveProperty([h.nameKey]);
    expect(codes).toContain('F3');
    expect(codes).toContain('KeyM');
  });

  it('one handler per window; a press runs the action and cancels the browser behaviour', () => {
    const { list, calls } = counter();
    const target = fakeTarget();
    const off = registerHotkeys(list, target);
    expect(target.listeners.size).toBe(1);
    const e = target.press({ code: 'F3' });
    expect(calls.debug).toBe(1);
    expect(e.defaultPrevented).toBe(true);
    target.press({ code: 'KeyM' });
    expect(calls.mapMode).toBe(1);
    const other = target.press({ code: 'KeyQ' });
    expect(other.defaultPrevented).toBe(false);
    off();
    expect(target.listeners.size).toBe(0);
  });

  it('typing in an input is not intercepted', () => {
    const { list, calls } = counter();
    const target = fakeTarget();
    registerHotkeys(list, target);
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const e = target.press({ code: 'KeyM', target: { tagName } });
      expect(e.defaultPrevented).toBe(false);
    }
    target.press({ code: 'KeyM', target: { tagName: 'DIV', isContentEditable: true } });
    expect(calls.mapMode).toBe(0);
    target.press({ code: 'KeyM', target: { tagName: 'CANVAS' } });
    expect(calls.mapMode).toBe(1);
  });

  it('F3 works in an input and cancels the browser search, letter keys do not', () => {
    const { list, calls } = counter();
    const target = fakeTarget();
    registerHotkeys(list, target);
    const f3 = target.press({ code: 'F3', target: { tagName: 'INPUT' } });
    expect(calls.debug).toBe(1);
    expect(f3.defaultPrevented).toBe(true);
    const m = target.press({ code: 'KeyM', target: { tagName: 'INPUT' } });
    expect(calls.mapMode).toBe(0);
    expect(m.defaultPrevented).toBe(false);
  });

  it('Ctrl/Alt/Meta combinations and auto-repeat do not run the action', () => {
    const { list, calls } = counter();
    const target = fakeTarget();
    registerHotkeys(list, target);
    target.press({ code: 'KeyM', ctrlKey: true });
    target.press({ code: 'KeyM', altKey: true });
    target.press({ code: 'KeyM', metaKey: true });
    const held = target.press({ code: 'F3', repeat: true });
    expect(calls.mapMode).toBe(0);
    expect(calls.debug).toBe(0);
    // Auto-repeat of F3 still must not open the browser search.
    expect(held.defaultPrevented).toBe(true);
  });

  it('a duplicate code at registration is an error', () => {
    const a: Hotkey = { id: 'a', code: 'KeyA', nameKey: 'key.debug', action: () => undefined };
    expect(() => registerHotkeys([a, { ...a, id: 'b' }], fakeTarget())).toThrow();
  });

  it('keyLabel', () => {
    expect(keyLabel('F3')).toBe('F3');
    expect(keyLabel('KeyM')).toBe('M');
    expect(keyLabel('Digit1')).toBe('1');
  });
});
