// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

const CSS = readFileSync(new URL('../src/overview/Overview.module.css', import.meta.url), 'utf8');

describe('curva da visão geral', () => {
  test('a miniatura tem largura máxima para não esticar traço e marcas no desktop', () => {
    const start = CSS.indexOf('.sparkline {');
    const block = CSS.slice(start, CSS.indexOf('}', start));
    expect(block).toMatch(/max-width:\s*\d+px/);
  });
});
