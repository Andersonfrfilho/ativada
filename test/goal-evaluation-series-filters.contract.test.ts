// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { toEngineDecimal } from '../packages/strategy-engine/src/engine-decimal.js';
import { floorToIncrement } from '../packages/strategy-engine/src/money.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();
const PEPE_PRICES = ['0.00000412', '0.00000398', '0.00000405'];

describe('avaliação de metas: filtros do par', () => {
  test('PEPEUSDT usa o tick e o passo da tabela', () => {
    const { parameters } = app.goalSeries.setupFor('PEPEUSDT');
    expect(parameters.tickSize).toBe('0.00000001');
    expect(parameters.quantityStep).toBe('1');
  });

  test.each(['BTCUSDT', 'ETHUSDT'])('%s mantém os padrões do motor', (symbol) => {
    const { parameters } = app.goalSeries.setupFor(symbol);
    expect(parameters.tickSize).toBe('0.01');
    expect(parameters.quantityStep).toBe('0.00001');
  });

  test('par sem filtro conhecido lança em vez de cair no padrão', () => {
    expect(() => app.goalSeries.setupFor('FOOUSDT')).toThrow(/FOOUSDT/);
  });

  test('numa série PEPE (~0,000004) o preço arredondado ao tick do par é positivo; ao padrão do motor, zero', () => {
    const { parameters } = app.goalSeries.setupFor('PEPEUSDT');
    for (const price of PEPE_PRICES) {
      expect(floorToIncrement(toEngineDecimal(price), parameters.tickSize).greaterThan(0)).toBe(
        true,
      );
      expect(floorToIncrement(toEngineDecimal(price), '0.01').isZero()).toBe(true);
    }
  });
});
