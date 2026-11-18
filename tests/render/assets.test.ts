import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DETAIL_SLOT_NAMES } from '../../src/content/biomes/types';
import { BASE_PACK } from '../../src/content/packs/base/manifest';
import { ATLAS_GRID, DETAIL_SLOT_OF, DetailSlot } from '../../src/render/assets';

const ROOT = join(__dirname, '..', '..');
const ASSETS = join(ROOT, 'assets');
const credits = readFileSync(join(ASSETS, 'CREDITS.md'), 'utf8');

describe('DETAIL_SLOT_OF', () => {
  it('имя слота из данных биома — его номер в атласе', () => {
    DETAIL_SLOT_NAMES.forEach((name, i) => expect(DETAIL_SLOT_OF[name], name).toBe(i));
  });
  it('каждый биом базового пака попадает в используемый слот атласа', () => {
    for (const b of BASE_PACK.biomes) {
      const slot = DETAIL_SLOT_OF[b.detail];
      expect(Number.isInteger(slot), b.id).toBe(true);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThanOrEqual(DetailSlot.PAPER);
      expect(slot).toBeLessThan(ATLAS_GRID * ATLAS_GRID);
    }
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

/** Decode an 8-bit grayscale non-interlaced PNG into raw pixels. */
function decodeGray(buf: Buffer): { w: number; h: number; px: Uint8Array } {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    if (buf.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)] ?? 0;
    for (let x = 0; x < w; x++) {
      const v = raw[y * (w + 1) + 1 + x] ?? 0;
      const a = x > 0 ? (px[y * w + x - 1] ?? 0) : 0;
      const b = y > 0 ? (px[(y - 1) * w + x] ?? 0) : 0;
      const c = x > 0 && y > 0 ? (px[(y - 1) * w + x - 1] ?? 0) : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * w + x] = (v + pred) & 255;
    }
  }
  return { w, h, px };
}

describe('atlas tile statistics', () => {
  const { w, px } = decodeGray(readFileSync(join(ASSETS, 'terrain', 'atlas.png')));
  const tile = 512;
  const stats = (slot: number) => {
    const x0 = (slot % ATLAS_GRID) * tile;
    const y0 = Math.floor(slot / ATLAS_GRID) * tile;
    let sum = 0;
    let sq = 0;
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        const v = px[(y0 + y) * w + x0 + x] ?? 0;
        sum += v;
        sq += v * v;
      }
    }
    const n = tile * tile;
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(sq / n - mean * mean, 0)) };
  };
  it('keeps used tiles muted: mean 120..136, std <= 30', () => {
    for (const slot of Object.values(DetailSlot)) {
      const s = stats(slot);
      expect(s.mean, `slot ${slot} mean`).toBeGreaterThanOrEqual(120);
      expect(s.mean, `slot ${slot} mean`).toBeLessThanOrEqual(136);
      expect(s.std, `slot ${slot} std`).toBeLessThanOrEqual(30);
    }
  });
  it('keeps snow very subtle: std <= 14', () => {
    expect(stats(DetailSlot.SNOW).std).toBeLessThanOrEqual(14);
  });
});

describe('fonts', () => {
  it('ships PT Sans Regular and Bold as TrueType files with the OFL text', () => {
    for (const f of ['PT_Sans-Web-Regular.ttf', 'PT_Sans-Web-Bold.ttf']) {
      const buf = readFileSync(join(ASSETS, 'fonts', f));
      expect(buf.readUInt32BE(0), f).toBe(0x00010000); // sfnt version 1.0 (TrueType)
    }
    const ofl = readFileSync(join(ASSETS, 'fonts', 'OFL.txt'), 'utf8');
    expect(ofl).toContain('PT Sans');
    expect(ofl).toContain('SIL Open Font License, Version 1.1');
  });
  it('the UI stylesheet loads exactly these font files', () => {
    const css = readFileSync(join(ROOT, 'src', 'ui', 'styles.css'), 'utf8');
    expect(css).toContain("font-family: 'PT Sans'");
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!.split('/').pop());
    expect(urls.sort()).toEqual(['PT_Sans-Web-Bold.ttf', 'PT_Sans-Web-Regular.ttf']);
  });
  it('CREDITS.md names the font source and license', () => {
    expect(credits).toContain('https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/');
    expect(credits).toContain('SIL Open Font License 1.1');
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
    for (const id of ['Grass005', 'Moss002', 'Ground054', 'Rock051', 'Snow010A', 'Ground087', 'Paper001', 'PT Sans', 'ParaType']) {
      expect(credits, id).toContain(id);
    }
  });
});
