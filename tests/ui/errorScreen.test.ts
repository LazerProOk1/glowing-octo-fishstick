import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/ru';
import { ERR_CLEANUP_NO_CONVERGE } from '../../src/sim/world/provinceCleanup';
import { errorDetail } from '../../src/ui/errorScreen';

describe('errorDetail', () => {
  it('код ошибки очистки провинций показывается по-русски', () => {
    expect(errorDetail(new Error(ERR_CLEANUP_NO_CONVERGE))).toBe(t('error.cleanupNoConverge'));
  });

  it('прочие ошибки — текст как есть', () => {
    expect(errorDetail(new Error('boom'))).toBe('boom');
    expect(errorDetail('x')).toBe('x');
  });
});
