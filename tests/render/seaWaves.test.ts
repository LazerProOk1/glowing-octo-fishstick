import { describe, expect, it } from 'vitest';
import { WAVE_AMP, WAVE_ANGLE, WAVE_COS, WAVE_GLSL, WAVE_SIN, waveShade, waveStrength } from '../../src/render/seaWaves';

describe('water ripple', () => {
  it('absent in the overview, present up close', () => {
    expect(waveStrength(0.3)).toBe(0);
    expect(waveStrength(0.9)).toBe(0);
    expect(waveStrength(8)).toBe(1);
    expect(waveShade(100.3, 200.7, 0.9, 1.3)).toBe(0);
  });

  it('is deterministic in world coordinates and stays within ±WAVE_AMP', () => {
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
    // Around zero on average (it neither darkens nor brightens the water), but not empty.
    expect(Math.abs(sum / n)).toBeLessThan(0.004);
    expect(Math.sqrt(sq / n)).toBeGreaterThan(0.004);
  });

  it('fine octaves fade out when the wave is shorter than a few pixels', () => {
    // At 2 px per cell only the coarse octave remains: the field is smoother than at 20 px.
    let dCoarse = 0;
    let dFine = 0;
    for (let i = 0; i < 2000; i++) {
      const x = 10 + i * 0.1;
      dCoarse += Math.abs(waveShade(x + 0.1, 50, 8, 2) - waveShade(x, 50, 8, 2));
      dFine += Math.abs(waveShade(x + 0.1, 50, 8, 20) - waveShade(x, 50, 8, 20));
    }
    expect(dCoarse).toBeLessThan(dFine);
  });

  // Kept as text on purpose: the ripple runs per water pixel, a texture fetch there would cost real bandwidth.
  it('the GLSL has no texture samples', () => {
    expect(WAVE_GLSL).not.toMatch(/texture(Lod)?\s*\(|texelFetch/);
  });

  it('the rotation constants are the cos and sin of the octave angles', () => {
    WAVE_ANGLE.forEach((a, i) => {
      expect(WAVE_COS[i]).toBe(Math.cos(a));
      expect(WAVE_SIN[i]).toBe(Math.sin(a));
    });
  });
});
