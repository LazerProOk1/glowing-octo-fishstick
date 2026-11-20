import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/ru';
import { CodedError } from '../../src/content/errors';
import { errorDetail } from '../../src/ui/errorScreen';

describe('errorDetail', () => {
  it('the province cleanup error code is shown in Russian', () => {
    expect(errorDetail(new CodedError('province_cleanup_no_converge'))).toBe(t('error.province_cleanup_no_converge'));
  });

  it('coded errors are translated with their data, also after crossing the worker as text', () => {
    const e = new CodedError('too_many_provinces', { n: 70000, max: 65535 });
    expect(errorDetail(e)).toContain('70000');
    expect(errorDetail(e)).toContain('65535');
    expect(errorDetail(new Error(e.message))).toBe(errorDetail(e));
  });

  it('unknown code and malformed params fall back to the raw text', () => {
    expect(errorDetail(new Error('no_such_code: {"a":1}'))).toBe('no_such_code: {"a":1}');
    expect(() => errorDetail(new Error('foo: {bar}'))).not.toThrow();
    expect(errorDetail(new Error('foo: {bar}'))).toBe('foo: {bar}');
  });

  it('other errors — the text as is', () => {
    expect(errorDetail(new Error('boom'))).toBe('boom');
    expect(errorDetail('x')).toBe('x');
  });
});
