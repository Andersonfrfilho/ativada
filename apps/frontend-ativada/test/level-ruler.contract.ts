// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { buildRuler, RULER_CURSOR } from '../src/notices/level-ruler.js';
import { formatPriceAtTick, formatQuantity, priceDecimals } from '../src/notices/symbol-filters.js';

const LINK = {
  symbol: 'LINKUSDT',
  entry: '12.45800000',
  target: '12.59000000',
  stop: '12.37900000',
};

describe('régua dos níveis (RF24)', () => {
  test('o exemplo da spec: proteção −0,63%, entrada, alvo +1,06% e ganho ÷ perda 1,7 : 1', () => {
    const ruler = buildRuler({ ...LINK, cursor: undefined });
    expect(ruler?.marks.map((mark) => [mark.label, mark.priceText, mark.percentText])).toEqual([
      ['Proteção', '12,379', '−0,63%'],
      ['Entrada', '12,458', undefined],
      ['Alvo', '12,590', '+1,06%'],
    ]);
    expect(ruler?.legend).toBe(
      'Perda possível −0,63% · Ganho possível +1,06% · Ganho ÷ perda 1,7 : 1',
    );
    expect(ruler?.cursor).toBeUndefined();
  });

  test('a descrição textual lê os três níveis e o cursor', () => {
    const ruler = buildRuler({ ...LINK, cursor: { kind: RULER_CURSOR.NOW, price: '12.49000000' } });
    expect(ruler?.description).toBe(
      'Níveis da operação: Proteção 12,379 (−0,63%), Entrada 12,458, Alvo 12,590 (+1,06%). Agora 12,490. Perda possível −0,63% · Ganho possível +1,06% · Ganho ÷ perda 1,7 : 1.',
    );
  });

  test('as posições crescem da proteção ao alvo e ficam dentro da régua', () => {
    const ruler = buildRuler({ ...LINK, cursor: { kind: RULER_CURSOR.NOW, price: '12.49000000' } });
    const positions = ruler?.marks.map((mark) => mark.position) ?? [];
    expect(positions[0]).toBeLessThan(positions[1] ?? 0);
    expect(positions[1]).toBeLessThan(positions[2] ?? 0);
    for (const position of [...positions, ruler?.cursor?.position ?? 50]) {
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(100);
    }
  });

  test('o cursor "saiu" aparece mesmo fora da faixa (gap abaixo da proteção)', () => {
    const ruler = buildRuler({
      ...LINK,
      cursor: { kind: RULER_CURSOR.EXIT, price: '12.20000000' },
    });
    expect(ruler?.cursor?.label).toBe('Saiu 12,200');
    expect(ruler?.cursor?.position).toBeGreaterThanOrEqual(0);
    expect(ruler?.cursor?.position).toBeLessThan(ruler?.marks[0]?.position ?? 0);
  });

  test('níveis fora de ordem ou ilegíveis não desenham régua', () => {
    expect(buildRuler({ ...LINK, stop: '12.60000000', cursor: undefined })).toBeUndefined();
    expect(buildRuler({ ...LINK, target: '12.30000000', cursor: undefined })).toBeUndefined();
    expect(buildRuler({ ...LINK, entry: 'x', cursor: undefined })).toBeUndefined();
  });

  test('Number só desenha posição: nenhum dinheiro passa por ele', () => {
    const source = readFileSync(new URL('../src/notices/level-ruler.ts', import.meta.url), 'utf8');
    const uses = source.match(/Number\(/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(source).not.toMatch(/parseFloat|parseInt/);
  });
});

describe('preço no tick do par (RF29)', () => {
  test.each([
    ['LINKUSDT', '12.45800000', '12,458'],
    ['LINKUSDT', '12.59000000', '12,590'],
    ['LINKUSDT', '12.37950000', '12,380'],
    ['SOLUSDT', '103.83100000', '103,84'],
    ['XRPUSDT', '1.30630000', '1,3063'],
    ['PEPEUSDT', '0.00000400', '0,00000400'],
    ['BTCUSDT', '61700.5', '61.700,50'],
  ])('%s %s vira %s (para cima quando sobra casa)', (symbol, text, expected) => {
    expect(formatPriceAtTick(symbol, text)).toBe(expected);
  });

  test('casas do tick e passo da quantidade por par', () => {
    expect(priceDecimals('LINKUSDT')).toBe(3);
    expect(priceDecimals('BTCUSDT')).toBe(2);
    expect(formatQuantity('LINKUSDT', '113.50000000')).toBe('113,50');
    expect(formatQuantity('DOGEUSDT', '10')).toBe('10');
  });
});
