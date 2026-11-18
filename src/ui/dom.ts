/** Создаёт элемент с классом и (необязательно) текстом. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Неразрывный пробел (U+00A0). */
export const NBSP = String.fromCharCode(0xa0);

/** Миллисекунды → целое число, тысячи разделены неразрывным пробелом: 1234 → «1 234». */
export function formatMs(ms: number): string {
  return String(Math.round(ms)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Секунды с одним знаком после запятой: «4,6». */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',');
}
