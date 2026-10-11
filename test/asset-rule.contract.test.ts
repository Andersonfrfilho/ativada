// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const { assetRule } = await loadApiApp();

describe('a regra do dia vista por quem JÁ tem a moeda', () => {
  test.each([
    ['BUY', 'hold'],
    ['SELL', 'sell'],
    ['HOLD', 'wait'],
  ] as const)('o sinal %s é %s', (action, expected) => {
    expect(assetRule.toRuleAction(action)).toBe(expected);
  });
});

describe('cache da regra do dia', () => {
  const key = (
    symbol: string,
    lastCandleOpenTime: number | null,
  ): { strategyVersionId: string; symbol: string; lastCandleOpenTime: number | null } => ({
    strategyVersionId: 'v1',
    symbol,
    lastCandleOpenTime,
  });
  const rule = { action: 'hold' as const, situation: {} as never };

  test('uma entrada por versão, par e último candle; candle novo é outra chave', () => {
    const cache = assetRule.createAssetRuleCache();
    cache.set(key('BTCUSDT', 1), rule);
    expect(cache.get(key('BTCUSDT', 1))).toBe(rule);
    expect(cache.get(key('BTCUSDT', 2))).toBeUndefined();
    expect(cache.get(key('ETHUSDT', 1))).toBeUndefined();
    expect(cache.get({ ...key('BTCUSDT', 1), strategyVersionId: 'v2' })).toBeUndefined();
  });

  test('lembra também o "sem regra" (nulo), para não recalcular o que não tem aquecimento', () => {
    const cache = assetRule.createAssetRuleCache();
    cache.set(key('BTCUSDT', null), null);
    expect(cache.get(key('BTCUSDT', null))).toBeNull();
  });

  test('é limitado: passando do teto, sai a entrada mais antiga', () => {
    const cache = assetRule.createAssetRuleCache(2);
    cache.set(key('A', 1), rule);
    cache.set(key('B', 1), rule);
    cache.set(key('C', 1), rule);
    expect(cache.get(key('A', 1))).toBeUndefined();
    expect(cache.get(key('B', 1))).toBe(rule);
    expect(cache.get(key('C', 1))).toBe(rule);
  });
});
