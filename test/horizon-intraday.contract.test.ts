// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { IntradayMetricsInput } from '../packages/strategy-engine/src/horizon/horizon.types.js';
import { loadHorizonApi } from './fixtures/strategy-engine/horizon/horizon-api.fixture.js';

const api = await loadHorizonApi();
const FIXTURE_DIRECTORY = join(import.meta.dir, 'fixtures/strategy-engine/horizon');

function field(record: unknown, key: string): unknown {
  if (typeof record !== 'object' || record === null) return undefined;
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

// Métricas gravadas de um backtest real (banco de desenvolvimento, 15 min, 01/04 a 01/10/2026), só o que o veredito lê.
function loadRecordedMetrics(fileName: string): IntradayMetricsInput {
  const parsed: unknown = JSON.parse(readFileSync(join(FIXTURE_DIRECTORY, fileName), 'utf8'));
  const metrics = field(parsed, 'metrics');
  const initialBalance = field(metrics, 'initialBalance');
  const finalEquity = field(metrics, 'finalEquity');
  const feesPaid = field(metrics, 'feesPaid');
  const trades = field(metrics, 'trades');
  if (
    typeof initialBalance !== 'string' ||
    typeof finalEquity !== 'string' ||
    typeof feesPaid !== 'string' ||
    typeof trades !== 'number'
  ) {
    throw new Error(`Fixture ${fileName} sem as métricas esperadas.`);
  }
  return { initialBalance, finalEquity, feesPaid, trades };
}

function metricsOf(finalEquity: string | null, feesPaid: string): IntradayMetricsInput {
  return { initialBalance: '10000', finalEquity, feesPaid, trades: 12 };
}

describe('summarizeIntraday: métricas reais gravadas', () => {
  // BNBUSDT, 15 min: 10 operações, patrimônio final 9712.12930111, taxas 151.89196889. Líquido = 9712.12930111 − 10000
  // = −287.87069889 (−2,8787069889% do saldo, para baixo: −0.02878707). Bruto antes das taxas = −287.87069889 +
  // 151.89196889 = −135.97873 ≤ 0: sem fatia de taxa. NAO_COMPENSA por líquido ≤ 0.
  test('BNBUSDT: o líquido é negativo, não compensa', () => {
    const metrics = loadRecordedMetrics('intraday-metrics-bnbusdt-15m.json');
    expect(api.summarizeIntraday(metrics)).toStrictEqual({
      netReturn: '-0.02878707',
      tradeCount: 10,
      feesPaid: '151.89196889',
      feeShareOfGross: null,
      verdict: 'NAO_COMPENSA',
    });
  });

  // LINKUSDT, 15 min: 371 operações, final 7115.51208745, taxas 2310.68264255. Líquido = −2884.48791255
  // (−0.288448791255, para baixo: −0.2884488). Bruto = −2884.48791255 + 2310.68264255 = −573.80527 ≤ 0.
  test('LINKUSDT: o líquido é negativo, não compensa', () => {
    const metrics = loadRecordedMetrics('intraday-metrics-linkusdt-15m.json');
    expect(api.summarizeIntraday(metrics)).toStrictEqual({
      netReturn: '-0.2884488',
      tradeCount: 371,
      feesPaid: '2310.68264255',
      feeShareOfGross: null,
      verdict: 'NAO_COMPENSA',
    });
  });
});

describe('summarizeIntraday: as regras do RF03, contas à mão', () => {
  test('líquido positivo e taxas leves: compensa (300 de líquido, 100 de taxa, bruto 400, fatia 25%)', () => {
    expect(api.summarizeIntraday(metricsOf('10300', '100'))).toStrictEqual({
      netReturn: '0.03',
      tradeCount: 12,
      feesPaid: '100',
      feeShareOfGross: '0.25',
      verdict: 'COMPENSA',
    });
  });

  test('taxas em exatamente 50% do bruto ainda compensam (a regra é "passam de 50%")', () => {
    const summary = api.summarizeIntraday(metricsOf('10100', '100'));
    expect(summary.feeShareOfGross).toBe('0.5');
    expect(summary.verdict).toBe('COMPENSA');
  });

  test('taxas um centésimo de milionésimo acima de 50% do bruto não compensam', () => {
    // Líquido 99.99999999 + taxas 100 = bruto 199.99999999; 100 ÷ 199.99999999 = 0.5000000025, para CIMA: 0.50000001.
    const summary = api.summarizeIntraday(metricsOf('10099.99999999', '100'));
    expect(summary.feeShareOfGross).toBe('0.50000001');
    expect(summary.verdict).toBe('NAO_COMPENSA');
  });

  test('taxas comem o ganho: líquido 100, taxa 400, bruto 500, fatia 80%', () => {
    const summary = api.summarizeIntraday(metricsOf('10100', '400'));
    expect(summary.feeShareOfGross).toBe('0.8');
    expect(summary.verdict).toBe('NAO_COMPENSA');
  });

  test('líquido exatamente zero não compensa, e a fatia das taxas é 100% do bruto', () => {
    const summary = api.summarizeIntraday(metricsOf('10000', '150'));
    expect(summary.netReturn).toBe('0');
    expect(summary.feeShareOfGross).toBe('1');
    expect(summary.verdict).toBe('NAO_COMPENSA');
  });

  test('líquido negativo com bruto positivo: a taxa passa de 100% do bruto', () => {
    // Líquido −50, taxas 150, bruto 100, fatia 150%.
    const summary = api.summarizeIntraday(metricsOf('9950', '150'));
    expect(summary.netReturn).toBe('-0.005');
    expect(summary.feeShareOfGross).toBe('1.5');
    expect(summary.verdict).toBe('NAO_COMPENSA');
  });

  test('sem operar (patrimônio final = saldo, taxa 0): líquido zero não compensa e não há fatia de taxa', () => {
    expect(api.summarizeIntraday(metricsOf('10000', '0'))).toStrictEqual({
      netReturn: '0',
      tradeCount: 12,
      feesPaid: '0',
      feeShareOfGross: null,
      verdict: 'NAO_COMPENSA',
    });
  });

  test('sem taxa e com ganho: compensa e a fatia é zero', () => {
    const summary = api.summarizeIntraday(metricsOf('10200', '0'));
    expect(summary.feeShareOfGross).toBe('0');
    expect(summary.verdict).toBe('COMPENSA');
  });

  test('a fatia das taxas é arredondada para CIMA (1 ÷ 3 = 0.33333334) e o líquido para BAIXO', () => {
    const summary = api.summarizeIntraday(metricsOf('10002', '1'));
    expect(summary.feeShareOfGross).toBe('0.33333334');
    expect(summary.netReturn).toBe('0.0002');
    expect(api.summarizeIntraday(metricsOf('10000.00000001', '0')).netReturn).toBe('0');
    expect(api.summarizeIntraday(metricsOf('9999.99999999', '0')).netReturn).toBe('-0.00000001');
  });

  test('o patrimônio final já inclui a posição aberta: sem patrimônio final, não compensa', () => {
    expect(api.summarizeIntraday(metricsOf(null, '0'))).toStrictEqual({
      netReturn: null,
      tradeCount: 12,
      feesPaid: '0',
      feeShareOfGross: null,
      verdict: 'NAO_COMPENSA',
    });
  });
});
