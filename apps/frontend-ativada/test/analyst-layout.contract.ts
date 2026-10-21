// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

// 375 px por classe (spec 007, T3.3, web.md §10): a tela mais estreita (375 px, 16 px de margem de cada lado) deixa 343 px; nada
// do cartão do analista fixa largura acima disso, o texto do servidor quebra em qualquer ponto e a tabela vira lista abaixo de 700 px.
const CSS = readFileSync(
  new URL('../src/runs/analyst/Analyst.module.css', import.meta.url),
  'utf8',
);
const USABLE_WIDTH_PIXELS = 375 - 2 * 16;
const SERVER_TEXT_CLASSES: string[] = [
  'message',
  'reason',
  'note',
  'motive',
  'lockLine',
  'lockMessage',
  'historyText',
  'factValue',
];

function blockOf(selector: string): string {
  const start = CSS.indexOf(`.${selector} {`);
  expect(start, `.${selector} ausente`).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('cartão do analista em 375 px', () => {
  test('nenhuma largura fixa passa do que cabe na tela mais estreita', () => {
    const widths = [...CSS.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*(\d+)px/g)].map((match) =>
      Number(match[1]),
    );
    for (const width of widths) expect(width).toBeLessThanOrEqual(USABLE_WIDTH_PIXELS);
  });

  test.each(SERVER_TEXT_CLASSES)('a classe .%s deixa o texto do servidor quebrar', (name) => {
    expect(blockOf(name)).toMatch(/overflow-wrap:\s*anywhere/);
  });

  test('abaixo de 700 px a tabela da equipe vira lista, com o rótulo de cada coluna dentro da célula', () => {
    const mobile = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
    expect(mobile).toMatch(/\.table thead\s*{\s*display:\s*none/);
    expect(mobile).toMatch(/\.cellLabel\s*{\s*display:\s*inline/);
    expect(mobile).toMatch(/\.nameCell\s*{\s*flex-basis:\s*100%/);
  });

  test('os blocos de grade usam colunas que cedem (minmax) e nunca rolagem horizontal da página', () => {
    expect(blockOf('facts')).toMatch(/minmax\(150px,\s*1fr\)/);
    expect(CSS).not.toMatch(/overflow-x:\s*scroll/);
  });
});
