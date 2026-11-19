import { describe, expect, it, vi } from 'vitest';
import { ESLint } from 'eslint';

// Первый вызов ESLint грузит конфиг и плагины — под нагрузкой полного прогона это дольше 5 с.
vi.setConfig({ testTimeout: 30000 });

const eslint = new ESLint({ cwd: process.cwd() });

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.severity === 2) ?? [];
}

describe('правила ESLint для src/sim', () => {
  it('запрещает Math.random в src/sim', async () => {
    const errors = await lint('export const x = Math.random();\n', 'src/sim/x.ts');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('разрешает Math.random вне src/sim', async () => {
    const errors = await lint('export const x = Math.random();\n', 'src/ui/x.ts');
    expect(errors).toEqual([]);
  });

  it('запрещает import pixi.js в src/sim', async () => {
    const errors = await lint("import 'pixi.js';\n", 'src/sim/x.ts');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('запрещает подпути pixi.js/* в src/sim', async () => {
    for (const path of ['pixi.js/math-extras', 'pixi.js/unsafe-eval']) {
      const errors = await lint(`import '${path}';
`, 'src/sim/x.ts');
      expect(errors.length, path).toBeGreaterThan(0);
    }
  });

  it('запрещает DOM-глобалы document, window и localStorage в src/sim', async () => {
    for (const code of ['document.title', 'window.innerWidth', 'localStorage.getItem("a")']) {
      const errors = await lint(`export const x = () => ${code};
`, 'src/sim/x.ts');
      expect(errors.length, code).toBeGreaterThan(0);
    }
  });

  it('запрещает импорт из render и ui в src/sim', async () => {
    const a = await lint("import '../render/a';\n", 'src/sim/x.ts');
    const b = await lint("import '../ui/a';\n", 'src/sim/x.ts');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it('запрещает импорт worker, i18n и main в src/sim', async () => {
    for (const path of ['../worker/a', '../i18n/ru', '../main']) {
      const errors = await lint(`import '${path}';
`, 'src/sim/x.ts');
      expect(errors.length, path).toBeGreaterThan(0);
    }
  });

  it('запрещает crypto, self, setTimeout и fetch в src/sim', async () => {
    for (const code of ['crypto.getRandomValues(new Uint8Array(1))', 'self.postMessage(1)', 'setTimeout(() => 1, 1)', 'fetch("x")']) {
      const errors = await lint(`export const x = () => ${code};
`, 'src/sim/x.ts');
      expect(errors.length, code).toBeGreaterThan(0);
    }
  });

  it('запрещает дробную математику движка в src/game, но не в src/render', async () => {
    const game = await lint('export const x = Math.sin(1);\n', 'src/game/x.ts');
    const render = await lint('export const x = Math.sin(1);\n', 'src/render/x.ts');
    expect(game.length).toBeGreaterThan(0);
    expect(game[0]?.message).toContain('docs/architecture.md');
    expect(render).toEqual([]);
  });

  it('запрещает все функции дробной математики в src/game', async () => {
    const fns = [
      'pow(2, 3)', 'exp(1)', 'expm1(1)', 'log(2)', 'log2(2)', 'log10(2)', 'log1p(1)', 'cbrt(8)', 'hypot(3, 4)',
      'sin(1)', 'cos(1)', 'tan(1)', 'asin(1)', 'acos(1)', 'atan(1)', 'atan2(1, 2)',
      'sinh(1)', 'cosh(1)', 'tanh(1)', 'asinh(1)', 'acosh(1)', 'atanh(0.5)',
    ];
    for (const fn of fns) {
      const errors = await lint(`export const x = Math.${fn};\n`, 'src/game/x.ts');
      expect(errors.length, fn).toBeGreaterThan(0);
    }
  });

  it('разрешает точную арифметику и Math.sqrt в src/game', async () => {
    const errors = await lint('export const f = (a: number, b: number) => Math.sqrt(a * a + b * b) / 2 - 1;\n', 'src/game/x.ts');
    expect(errors).toEqual([]);
  });

  it('запрещает ** с дробной или нелитеральной степенью в src/game, целая разрешена', async () => {
    const frac = await lint('export const x = 2 ** 0.5;\n', 'src/game/x.ts');
    const v = await lint('export const f = (a: number, b: number) => a ** b;\n', 'src/game/x.ts');
    const assign = await lint('let y = 2;\ny **= 0.5;\nexport { y };\n', 'src/game/x.ts');
    const int = await lint('export const x = 2 ** 3;\n', 'src/game/x.ts');
    expect(frac.length).toBeGreaterThan(0);
    expect(v.length).toBeGreaterThan(0);
    expect(assign.length).toBeGreaterThan(0);
    expect(int).toEqual([]);
  });

  it('src/game наследует правила src/sim', async () => {
    const rnd = await lint('export const x = Math.random();\n', 'src/game/x.ts');
    const date = await lint('export const x = Date.now();\n', 'src/game/x.ts');
    const pixi = await lint("import 'pixi.js';\n", 'src/game/x.ts');
    const ui = await lint("import '../ui/a';\n", 'src/game/x.ts');
    for (const errors of [rnd, date, pixi, ui]) expect(errors.length).toBeGreaterThan(0);
  });

  it('запрещает Date и performance.now в src/sim', async () => {
    const a = await lint('export const x = Date.now();\n', 'src/sim/x.ts');
    const b = await lint('export const x = performance.now();\n', 'src/sim/x.ts');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
