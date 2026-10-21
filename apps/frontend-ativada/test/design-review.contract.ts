// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url));
const REDUCED_MOTION = /@media\s*\(prefers-reduced-motion:\s*reduce\)/;

function listFiles(directory: string, extension: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

describe('revisão de design (web.md §15)', () => {
  test('no component uses an inline style', () => {
    const offenders = listFiles(SOURCE_ROOT, '.tsx').filter((path) =>
      /\sstyle=\{|\sstyle="/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  test('every stylesheet with motion is covered by prefers-reduced-motion', () => {
    const globalCss = readFileSync(join(SOURCE_ROOT, 'styles/global.css'), 'utf8');
    expect(globalCss).toMatch(REDUCED_MOTION);
    expect(globalCss).toMatch(/transition:\s*none\s*!important/);
    expect(globalCss).toMatch(/animation:\s*none\s*!important/);
    const withMotion = listFiles(SOURCE_ROOT, '.css').filter((path) =>
      /\b(transition|animation)\b|@keyframes/.test(readFileSync(path, 'utf8')),
    );
    const uncovered = withMotion.filter((path) => {
      const css = readFileSync(path, 'utf8');
      return !path.endsWith('global.css') && !REDUCED_MOTION.test(css);
    });
    // A regra do projeto: todo arquivo de estilo com movimento traz o próprio bloco de movimento reduzido.
    expect(uncovered.length).toBe(0);
  });
});
