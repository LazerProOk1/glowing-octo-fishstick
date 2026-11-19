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

   // The reference hash (a literal) lives only in tests/sim/world/fingerprint.test.ts.
  it('looks like 8 hex characters', () => {
    expect(worldHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is the same for two generations with the same params', () => {
    expect(worldHash(smallWorld('1'))).toBe(worldHash(a));
  }, 60000);

  it('changes when the seed changes', () => {
    expect(worldHash(smallWorld('2'))).not.toBe(worldHash(a));
  }, 60000);

  it('takes the world params into account even if the arrays are the same', () => {
    const other: World = { ...a, params: { ...a.params, options: { ...a.params.options, fantasy: true } } };
    expect(worldHash(other)).not.toBe(worldHash(a));
  });
});
