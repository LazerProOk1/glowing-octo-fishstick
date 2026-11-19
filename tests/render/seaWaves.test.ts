import { describe, expect, it } from 'vitest';
import { WAVE_AMP, WAVE_GLSL, waveShade, waveStrength } from '../../src/render/seaWaves';

describe('рябь на воде', () => {
  it('на общем виде нет, вблизи есть', () => {
    expect(waveStrength(0.3)).toBe(0);
    expect(waveStrength(0.9)).toBe(0);
    expect(waveStrength(8)).toBe(1);
    expect(waveShade(100.3, 200.7, 0.9, 1.3)).toBe(0);
  });

  it('детерминирована в координатах мира и не выходит за ±WAVE_AMP', () => {
    let sum = 0;
    let sq = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const x = (i * 37.17) % 2048;
      const y = (i * 91.31) % 1024;
      const v = waveShade(x, y, 8, 11);
      expect(waveShade(x, y, 8, 11)).toBe(v);
      expect(Math.abs(v)).toBeLessThanOrEqual(WAVE_AMP + 1e-12);
      sum += v;
      sq += v * v;
    }
    // В среднем около нуля (не темнит и не светлит воду), но не пустая.
    expect(Math.abs(sum / n)).toBeLessThan(0.004);
    expect(Math.sqrt(sq / n)).toBeGreaterThan(0.004);
  });

  it('мелкие октавы гаснут, когда волна короче нескольких пикселей', () => {
    // При 2 px на клетку остаётся только крупная октава: поле глаже, чем при 20 px.
    let dCoarse = 0;
    let dFine = 0;
    for (let i = 0; i < 2000; i++) {
      const x = 10 + i * 0.1;
      dCoarse += Math.abs(waveShade(x + 0.1, 50, 8, 2) - waveShade(x, 50, 8, 2));
      dFine += Math.abs(waveShade(x + 0.1, 50, 8, 20) - waveShade(x, 50, 8, 20));
    }
    expect(dCoarse).toBeLessThan(dFine);
  });

  it('GLSL без выборок текстур', () => {
    expect(WAVE_GLSL).not.toMatch(/texture(Lod)?\s*\(|texelFetch/);
  });
});
