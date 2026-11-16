import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATLAS_GRID, DetailSlot, FONT_SERIF, TERRAIN_TEXTURES } from '../../src/render/assets';
import { BIOMES } from '../../src/sim/world/types';

const ROOT = join(__dirname, '..', '..');
const ASSETS = join(ROOT, 'assets');
const credits = readFileSync(join(ASSETS, 'CREDITS.md'), 'utf8');

describe('TERRAIN_TEXTURES', () => {
  it('maps every biome to a valid detail slot', () => {
    for (const b of BIOMES) {
      const slot = TERRAIN_TEXTURES[b];
      expect(Number.isInteger(slot), b).toBe(true);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThanOrEqual(DetailSlot.PAPER);
      expect(slot).toBeLessThan(ATLAS_GRID * ATLAS_GRID);
    }
  });
  it('exposes the serif font family', () => {
    expect(FONT_SERIF).toBe('EB Garamond');
  });
});

describe('atlas.png', () => {
  it('is a 2048x2048 grayscale PNG', () => {
    const buf = readFileSync(join(ASSETS, 'terrain', 'atlas.png'));
    expect(buf.readUInt32BE(16)).toBe(2048);
    expect(buf.readUInt32BE(20)).toBe(2048);
    expect(buf[24]).toBe(8); // bit depth
    expect(buf[25]).toBe(0); // colour type 0 = grayscale
  });
});

describe('CREDITS.md', () => {
  it('mentions every asset file', () => {
    for (const dir of ['terrain', 'fonts']) {
      for (const f of readdirSync(join(ASSETS, dir))) {
        expect(credits, f).toContain(f);
      }
    }
  });
  it('mentions every source', () => {
    for (const id of ['Grass005', 'Moss002', 'Ground054', 'Rock051', 'Snow010A', 'Ground087', 'Paper001', 'EB Garamond']) {
      expect(credits, id).toContain(id);
    }
  });
});
