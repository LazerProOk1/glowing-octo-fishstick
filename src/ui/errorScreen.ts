import { t } from '../i18n/ru';
import { el } from './dom';

/**
 * Показывает сообщение об ошибке поверх всего. message — уже переведённая строка,
 * detail — техническая подробность (текст исключения). Возвращает функцию, убирающую сообщение.
 */
export function showError(parent: HTMLElement, message: string, detail?: string): () => void {
  const root = el('div', 'error-screen ui-panel');
  root.setAttribute('role', 'alert');
  root.append(el('h1', 'error-screen__title', t('error.title')), el('p', 'error-screen__message', message));
  if (detail) root.append(el('pre', 'error-screen__detail', detail));
  const retry = el('button', 'ui-button', t('error.retry'));
  retry.type = 'button';
  retry.addEventListener('click', () => location.reload());
  root.append(retry);
  parent.append(root);
  return () => root.remove();
}

export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
