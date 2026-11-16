import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

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

  it('запрещает Date и performance.now в src/sim', async () => {
    const a = await lint('export const x = Date.now();\n', 'src/sim/x.ts');
    const b = await lint('export const x = performance.now();\n', 'src/sim/x.ts');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
