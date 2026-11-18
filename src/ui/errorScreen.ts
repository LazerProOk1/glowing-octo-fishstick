import { t } from '../i18n/ru';
import { el } from './dom';

/**
 * Показывает сообщение об ошибке поверх всего. message — уже переведённая строка,
 * detail — техническая подробность (текст исключения).
 * retryHash — адрес, на который переходит «Перезагрузить» (мир по умолчанию для того же сида,
 * если ошибку дали неверные параметры в адресе). Возвращает функцию, убирающую сообщение.
 */
export function showError(parent: HTMLElement, message: string, detail?: string, retryHash?: string): () => void {
  const root = el('div', 'error-screen ui-panel');
  root.setAttribute('role', 'alert');
  root.append(el('h1', 'error-screen__title', t('error.title')), el('p', 'error-screen__message', message));
  if (detail) root.append(el('pre', 'error-screen__detail', detail));
  const retry = el('button', 'ui-button', t('error.retry'));
  retry.type = 'button';
  retry.addEventListener('click', () => {
    // Без смены адреса перезагрузка снова упёрлась бы в те же неверные параметры.
    if (retryHash !== undefined) history.replaceState(null, '', retryHash);
    location.reload();
  });
  root.append(retry);
  parent.append(root);
  return () => root.remove();
}

export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
