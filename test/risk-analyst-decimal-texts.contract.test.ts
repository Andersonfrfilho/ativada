// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  compareDecimalTexts,
  decimalOf,
  sortDecimalTexts,
  splitPlainDecimal,
} from '../packages/risk-analyst/src/analyst-decimal.js';
import { collectAtrRates } from '../packages/risk-analyst/src/index.js';
import type { VoteReading } from '../packages/risk-analyst/src/index.js';

// As comparações de texto decimal que aceleram o auditor e os percentis (spec 007, T2.3, RNF06) dão EXATAMENTE o que o
// decimal daria: o ganho de desempenho não muda nenhum número da regra.

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state / 4_294_967_296;
  };
}

function randomDecimalText(random: () => number): string {
  const integer = Math.floor(random() * 4) === 0 ? '0' : String(Math.floor(random() * 90_000));
  const fractionLength = Math.floor(random() * 9);
  const fraction = Array.from({ length: fractionLength }, () => String(Math.floor(random() * 10)));
  const leading = '0'.repeat(Math.floor(random() * 3));
  return fraction.length === 0
    ? `${leading}${integer}`
    : `${leading}${integer}.${fraction.join('')}`;
}

describe('compareDecimalTexts', () => {
  test('igual ao decimal em 20.000 pares sorteados (zeros à esquerda e à direita, tamanhos diferentes, iguais)', () => {
    const random = createRandom(7);
    for (let draw = 0; draw < 20_000; draw += 1) {
      const left = randomDecimalText(random);
      const right = draw % 5 === 0 ? `${left}000` : randomDecimalText(random);
      expect(compareDecimalTexts(left, right)).toBe(decimalOf(left).comparedTo(decimalOf(right)));
    }
  });

  test('à mão: 61700.5 > 61700.45, 100 = 100.00000000, 0.1 < 0.12, 9 < 10, 007 = 7', () => {
    expect(compareDecimalTexts('61700.5', '61700.45')).toBe(1);
    expect(compareDecimalTexts('100', '100.00000000')).toBe(0);
    expect(compareDecimalTexts('0.1', '0.12')).toBe(-1);
    expect(compareDecimalTexts('9', '10')).toBe(-1);
    expect(compareDecimalTexts('007', '7')).toBe(0);
  });

  test('texto fora do formato simples (expoente, sinal) cai no decimal e dá o mesmo', () => {
    for (const [left, right] of [
      ['1e-7', '0.00000011'],
      ['-0.5', '0.25'],
      ['-2', '-3'],
    ] as const) {
      expect(splitPlainDecimal(left)).toBeUndefined();
      expect(compareDecimalTexts(left, right)).toBe(decimalOf(left).comparedTo(decimalOf(right)));
    }
  });
});

describe('sortDecimalTexts', () => {
  test('mesma ordem de valor que a ordenação por decimal em 500 listas sorteadas', () => {
    const random = createRandom(11);
    for (let draw = 0; draw < 500; draw += 1) {
      const texts = Array.from({ length: 1 + Math.floor(random() * 60) }, () =>
        randomDecimalText(random),
      );
      const expected = [...texts].sort((left, right) =>
        decimalOf(left).comparedTo(decimalOf(right)),
      );
      const sorted = sortDecimalTexts(texts);
      expect(sorted.map((text) => decimalOf(text).toString())).toStrictEqual(
        expected.map((text) => decimalOf(text).toString()),
      );
    }
  });

  test('um texto fora do formato simples manda a lista inteira para o decimal, sem mudar a ordem', () => {
    const sorted = sortDecimalTexts(['0.5', '1e-3', '0.25', '2']);
    expect(sorted).toStrictEqual(['1e-3', '0.25', '0.5', '2']);
  });
});

describe('atrRate memorizado por leitura', () => {
  const readings: VoteReading[] = Array.from({ length: 200 }, (_unused, index) => ({
    openTime: (index + 1) * 900_000,
    close: String(100 + (index % 7)),
    vote: 1,
    isMissing: false,
    atr: index % 11 === 0 ? null : `0.${String(index + 3).padStart(3, '0')}`,
  }));

  test('chamar de novo, ou com cópias novas das mesmas leituras, devolve o mesmo', () => {
    const candleTime = 200 * 900_000;
    const first = collectAtrRates({ series: readings, candleTime });
    const again = collectAtrRates({ series: readings, candleTime });
    const copies = collectAtrRates({
      series: readings.map((reading) => ({ ...reading })),
      candleTime,
    });
    expect(again).toStrictEqual(first);
    expect(copies).toStrictEqual(first);
    expect(first.rates.length).toBeGreaterThan(150);
  });
});
