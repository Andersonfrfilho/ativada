// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

const CSS = readFileSync(new URL('../src/overview/Overview.module.css', import.meta.url), 'utf8');

describe('curva da visão geral', () => {
  test('o gráfico ocupa a largura do cartão sem esticar o traço (espessura fixa)', () => {
    const start = CSS.indexOf('.sparkline {');
    const block = CSS.slice(start, CSS.indexOf('}', start));
    expect(block).toMatch(/width:\s*100%/);
    const line = CSS.slice(CSS.indexOf('.equityLine {'), CSS.indexOf('.benchmarkLine {'));
    expect(line).toContain('vector-effect: non-scaling-stroke');
  });
});
