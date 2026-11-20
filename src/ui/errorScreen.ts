import { translate, t } from '../i18n/ru';
import { ERR_CLEANUP_NO_CONVERGE, parseCodedMessage } from '../sim/world/errors';
import { el } from './dom';

/**
 * Shows an error message above everything. message is an already translated string,
 * detail is a technical detail (the exception text).
 * retryHash is the address "Reload" goes to (the default world for the same seed,
 * if the error came from wrong options in the address). Returns a function that removes the message.
 */
export function showError(parent: HTMLElement, message: string, detail?: string, retryHash?: string): () => void {
  const root = el('div', 'error-screen ui-panel');
  root.setAttribute('role', 'alert');
  root.append(el('h1', 'error-screen__title', t('error.title')), el('p', 'error-screen__message', message));
  if (detail) root.append(el('pre', 'error-screen__detail', detail));
  const retry = el('button', 'ui-button', t('error.retry'));
  retry.type = 'button';
  retry.addEventListener('click', () => {
    // Without changing the address, a reload would hit the same wrong options again.
    if (retryHash !== undefined) history.replaceState(null, '', retryHash);
    location.reload();
  });
  root.append(retry);
  parent.append(root);
  return () => root.remove();
}

/** Error detail: known sim codes (with their data) — in Russian, anything else — the exception text as is. */
export function errorDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === ERR_CLEANUP_NO_CONVERGE) return t('error.cleanupNoConverge');
  const coded = parseCodedMessage(raw);
  if (!coded) return raw;
  const text = translate(`error.${coded.code}`);
  if (text === `error.${coded.code}`) return raw;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => String(coded.params[k] ?? m));
}
