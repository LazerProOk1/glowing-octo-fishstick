/** Creates an element with a class and (optionally) text. */
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

/** Non-breaking space (U+00A0). */
export const NBSP = String.fromCharCode(0xa0);

/** Milliseconds → integer, thousands separated by a non-breaking space: 1234 → "1 234". */
export function formatMs(ms: number): string {
  return String(Math.round(ms)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Seconds with one decimal place, comma separated: "4,6". */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',');
}
