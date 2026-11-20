import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/ru';
import { CodedError, ERR_CLEANUP_NO_CONVERGE } from '../../src/sim/world/errors';
import { errorDetail } from '../../src/ui/errorScreen';

describe('errorDetail', () => {
  it('the province cleanup error code is shown in Russian', () => {
    expect(errorDetail(new Error(ERR_CLEANUP_NO_CONVERGE))).toBe(t('error.cleanupNoConverge'));
  });

  it('coded errors are translated with their data, also after crossing the worker as text', () => {
    const e = new CodedError('too_many_provinces', { n: 70000, max: 65535 });
    expect(errorDetail(e)).toContain('70000');
    expect(errorDetail(e)).toContain('65535');
    expect(errorDetail(new Error(e.message))).toBe(errorDetail(e));
  });

  it('other errors — the text as is', () => {
    expect(errorDetail(new Error('boom'))).toBe('boom');
    expect(errorDetail('x')).toBe('x');
  });
});
