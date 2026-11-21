import { describe, expect, it } from 'vitest';
import { FOG_STEP, fogFieldSize } from '../../src/render/shaders/fog';

describe('fogFieldSize', () => {
  it('clamp-to-edge on the field equals the cell clamp of every lattice point', () => {
    for (const w of [1, 2, 3, 4, 5, 1024, 1025, 3072]) {
      const n = fogFieldSize(w, w).w;
      const cellOfTexel = (j: number): number => Math.min(FOG_STEP * Math.min(Math.max(j, 0), n - 1), w - 1);
      const cellOfLattice = (j: number): number => Math.min(Math.max(FOG_STEP * j, 0), w - 1);
      for (let j = -3; j < n + 3; j++) expect(cellOfTexel(j)).toBe(cellOfLattice(j));
    }
  });
});
