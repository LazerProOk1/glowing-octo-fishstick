import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/ru';
import { ERR_CLEANUP_NO_CONVERGE } from '../../src/sim/world/errors';
import { errorDetail } from '../../src/ui/errorScreen';

describe('errorDetail', () => {
  it('the province cleanup error code is shown in Russian', () => {
    expect(errorDetail(new Error(ERR_CLEANUP_NO_CONVERGE))).toBe(t('error.cleanupNoConverge'));
  });

  it('other errors — the text as is', () => {
    expect(errorDetail(new Error('boom'))).toBe('boom');
    expect(errorDetail('x')).toBe('x');
  });
});
