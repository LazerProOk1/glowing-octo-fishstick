import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ru, t } from '../src/i18n/ru';
import { LOAD_STEPS } from '../src/worker/protocol';

const CYRILLIC = /[Ѐ-ӿ]/;
const UI_DIR = join(process.cwd(), 'src', 'ui');
const uiFiles = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => join(UI_DIR, f));
/** Файлы, где вызывается t(): весь UI и точка входа. */
const callerFiles = [...uiFiles, join(process.cwd(), 'src', 'main.ts')];

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** Все строковые литералы файла (включая куски шаблонных строк); комментарии не входят. */
function stringLiterals(file: string): string[] {
  const out: string[] = [];
  walk(parse(file), (n) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      out.push(n.text);
    }
  });
  return out;
}

/** Ключи из вызовов t('ключ') с литеральным аргументом. */
function literalKeys(file: string): string[] {
  const out: string[] = [];
  walk(parse(file), (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 't') return;
    const arg = n.arguments[0];
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) out.push(arg.text);
  });
  return out;
}

describe('i18n', () => {
  it('в src/ui есть файлы для проверки', () => {
    expect(uiFiles.length).toBeGreaterThan(0);
  });

  it('в строковых литералах src/ui/*.ts нет кириллицы', () => {
    const offenders: string[] = [];
    for (const file of uiFiles) {
      for (const s of stringLiterals(file)) if (CYRILLIC.test(s)) offenders.push(`${file}: ${s}`);
    }
    expect(offenders).toEqual([]);
  });

  it('каждый ключ, используемый интерфейсом, есть в ru', () => {
    const keys = callerFiles.flatMap(literalKeys);
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.filter((k) => !(k in ru));
    expect(missing).toEqual([]);
  });

  it('есть названия всех этапов генерации', () => {
    for (const s of LOAD_STEPS) {
      expect(ru).toHaveProperty([`stage.${s}`]);
      expect(ru).toHaveProperty([`stageShort.${s}`]);
    }
    expect(t('stage.biomes')).toBe('Биомы…');
  });

  it('строки непустые', () => {
    for (const [k, v] of Object.entries(ru)) expect(v.trim(), k).not.toBe('');
  });
});
