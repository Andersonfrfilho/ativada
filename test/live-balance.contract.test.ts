// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import {
  floorDivide,
  fromScaled,
  toScaled,
} from './fixtures/live-status/scaled-decimal.fixture.js';

// As contas vêm do módulo carregado pela raiz da API (a de produção, ou a cópia mutada do teste de mutantes).
const app = await loadApiApp();
const { computeBuyAndHold, computeLiveBalance } = app.liveBalance;

const MONEY_SCALE = 8;
const RATE_SCALE = 12;
const SAMPLES = 2_000;

describe('saldo, resultado e taxa desde o início (ADR 0002, spec 008, L6)', () => {
  test.each([
    ['ganho', '1000', '1023.4', '1023.4', '23.4', '0.0234'],
    ['perda', '1000', '950.123', '950.123', '-49.877', '-0.049877'],
    ['sem vela fechada: o saldo é o inicial', '1000', undefined, '1000', '0', '0'],
    ['ganho que não divide: a taxa desce', '3', '4', '4', '1', '0.333333333333'],
    ['perda que não divide: a taxa desce (mais negativa)', '3', '2', '2', '-1', '-0.333333333334'],
  ] as const)('%s', (_name, initial, latestEquity, current, result, resultRate) => {
    expect(computeLiveBalance({ initial, latestEquity })).toStrictEqual({
      initial,
      current,
      result,
      resultRate,
    });
  });

  test('zeros à direita do banco saem em texto canônico', () => {
    expect(
      computeLiveBalance({ initial: '1000.00000000', latestEquity: '1000.50000000' }),
    ).toStrictEqual({
      initial: '1000',
      current: '1000.5',
      result: '0.5',
      resultRate: '0.0005',
    });
  });

  test(`propriedade em ${SAMPLES} sorteios: a taxa é o piso de 12 casas do resultado ÷ inicial e nunca favorece o usuário`, () => {
    const random = createSeededRandom(2026);
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const initial = BigInt(1 + Math.floor(random() * 5_000_000_000_000));
      const current = BigInt(Math.floor(random() * 10_000_000_000_000));
      const balance = computeLiveBalance({
        initial: fromScaled(initial, MONEY_SCALE),
        latestEquity: fromScaled(current, MONEY_SCALE),
      });
      const result = current - initial;
      expect(toScaled(balance.result, MONEY_SCALE)).toBe(result);
      const expectedRate = floorDivide(result * 10n ** BigInt(RATE_SCALE), initial);
      expect(toScaled(balance.resultRate, RATE_SCALE)).toBe(expectedRate);
      // A taxa exibida nunca passa do resultado exato: rate × inicial <= resultado.
      expect(
        toScaled(balance.resultRate, RATE_SCALE) * initial <= result * 10n ** BigInt(RATE_SCALE),
      ).toBe(true);
    }
  });
});

describe('comprar e segurar e a diferença em pontos percentuais (L7)', () => {
  test('o exemplo da spec: 1.000 contra 1.023,40 é 2,34 pontos abaixo', () => {
    expect(
      computeBuyAndHold({ initial: '1000', current: '1000', benchmark: '1023.4' }),
    ).toStrictEqual({
      value: '1023.4',
      resultRate: '0.0234',
      differencePoints: '-2.34',
      comparison: 'below',
    });
  });

  test('acima: a estratégia ganha do benchmark', () => {
    expect(
      computeBuyAndHold({ initial: '1000', current: '1050', benchmark: '1020' }),
    ).toStrictEqual({
      value: '1020',
      resultRate: '0.02',
      differencePoints: '3',
      comparison: 'above',
    });
  });

  test.each([
    ['+0,009 é empate', '1000.09', '0.009', 'even'],
    ['+0,01 já é acima', '1000.1', '0.01', 'above'],
    ['−0,009 é empate', '999.91', '-0.009', 'even'],
    ['−0,01 já é abaixo', '999.9', '-0.01', 'below'],
    ['igual ao benchmark', '1000', '0', 'even'],
  ] as const)('limiar do empate: %s', (_name, current, differencePoints, comparison) => {
    const result = computeBuyAndHold({ initial: '1000', current, benchmark: '1000' });
    expect(result.differencePoints).toBe(differencePoints);
    expect(result.comparison).toBe(comparison);
  });

  test('a diferença é calculada dos valores exatos e desce: −33,333333333334 em vez de −33,333333333333', () => {
    expect(computeBuyAndHold({ initial: '3', current: '1', benchmark: '2' }).differencePoints).toBe(
      '-33.333333333334',
    );
  });

  test(`propriedade em ${SAMPLES} sorteios: diferença e taxa do benchmark são o piso de 12 casas, o valor é o do ponto`, () => {
    const random = createSeededRandom(8);
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const initial = BigInt(1 + Math.floor(random() * 5_000_000_000_000));
      const current = BigInt(Math.floor(random() * 10_000_000_000_000));
      const benchmark = BigInt(Math.floor(random() * 10_000_000_000_000));
      const result = computeBuyAndHold({
        initial: fromScaled(initial, MONEY_SCALE),
        current: fromScaled(current, MONEY_SCALE),
        benchmark: fromScaled(benchmark, MONEY_SCALE),
      });
      expect(toScaled(result.value, MONEY_SCALE)).toBe(benchmark);
      const factor = 10n ** BigInt(RATE_SCALE);
      expect(toScaled(result.resultRate, RATE_SCALE)).toBe(
        floorDivide((benchmark - initial) * factor, initial),
      );
      expect(toScaled(result.differencePoints, RATE_SCALE)).toBe(
        floorDivide((current - benchmark) * 100n * factor, initial),
      );
    }
  });
});
