import { describe, expect, it } from 'vitest';
import { findLakes } from '../../../src/sim/world/lakes';
import { build } from './provincesSuite';

/**
 * Stage 1 review focus: 20 seeds, including the empty one and "Бета-7" (almost all water / almost
 * all land). Small size to keep the run fast: the variable sea radius depends on the distance to
 * land in cells, and tiny seas are more common on small.
 */
describe('sea provinces over 20 seeds (small)', () => {
  const SEEDS = [...Array.from({ length: 17 }, (_, i) => String(i + 1)), '', 'Бета-7', 'worldbox'];
  it.each(SEEDS)('seed %j: every sea gets a province, ids < 65535', { timeout: 60000 }, (seed) => {
    const f = build(seed, {}, 'small');
    const n = f.w * f.h;
    const lake = findLakes(f.height, f.w, f.h);
    let seaCells = 0;
    for (let i = 0; i < n; i++) if (!f.land[i] && !lake[i]) seaCells++;
    const sea = f.provinces.filter((p) => p.water === 'sea').length;
    if (seaCells > 0) expect(sea).toBeGreaterThan(0);
    expect(f.provinces.length).toBeLessThan(65535);
    f.provinces.forEach((p, i) => expect(p.id).toBe(i));
    for (let i = 0; i < n; i++) {
      if (!f.land[i] && !lake[i] && f.provinces[f.provinceOf[i]!]!.water !== 'sea') throw new Error(`sea cell ${i}`);
    }
  });
});
