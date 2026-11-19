import { beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';
import { worldHash } from '../../../src/sim/world/worldHash';

function smallWorld(seed: string): World {
  const p = defaultParams(seed);
  p.options.size = 'small';
  return generateWorld(p);
}

describe('worldHash', () => {
  let a: World;
  beforeAll(() => {
    a = smallWorld('1');
  }, 60000);

  // Эталонный хеш (литерал) лежит только в tests/sim/world/fingerprint.test.ts.
  it('выглядит как 8 hex-символов', () => {
    expect(worldHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('совпадает у двух генераций с одними параметрами', () => {
    expect(worldHash(smallWorld('1'))).toBe(worldHash(a));
  }, 60000);

  it('меняется при смене сида', () => {
    expect(worldHash(smallWorld('2'))).not.toBe(worldHash(a));
  }, 60000);

  it('учитывает параметры мира, даже если массивы те же', () => {
    const other: World = { ...a, params: { ...a.params, options: { ...a.params.options, fantasy: true } } };
    expect(worldHash(other)).not.toBe(worldHash(a));
  });
});
