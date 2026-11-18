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

  it('запрещает Date и performance.now в src/sim', async () => {
    const a = await lint('export const x = Date.now();\n', 'src/sim/x.ts');
    const b = await lint('export const x = performance.now();\n', 'src/sim/x.ts');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
