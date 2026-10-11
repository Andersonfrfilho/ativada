// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { UserAssetRecord } from '../packages/database/src/index.js';
import { buildSummaryItem } from '../apps/api-cryptoada/src/assets/asset-summary-item.js';
import { computeAssetNumbers } from '../apps/frontend-cryptoada/src/assets/asset-math.js';
import { parseScaled } from '../apps/frontend-cryptoada/src/format/decimal.js';
import type { AssetItem } from '../apps/frontend-cryptoada/src/assets/asset.validation.js';

// Uma tabela contra o servidor: o painel refaz a conta de "Seus ativos" com o preço do tick, e tem de dar o MESMO número
// que a API daria com esse preço (valor para baixo, custo para cima, taxa para o lado de menos).
const CASES = 400;
const SEED = 20_261_011;

function createRandom(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function decimalText(random: () => number, integerDigits: number, places: number): string {
  const whole = Math.floor(random() * 10 ** integerDigits);
  const fraction = Array.from({ length: places }, () => Math.floor(random() * 10)).join('');
  const text = places === 0 ? String(whole) : `${whole}.${fraction}`;
  return text === '0' || /^0\.0*$/.test(text) ? '1.00000001' : text;
}

function asset(quantity: string, averagePrice: string): UserAssetRecord {
  return {
    id: 'a',
    symbol: 'BTCUSDT',
    quantity,
    averagePrice,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe('painel × servidor: a conta de um ativo', () => {
  test(`${CASES} casos sorteados dão o mesmo valor, custo, resultado, taxa e alvo/stop`, () => {
    const random = createRandom(SEED);
    for (let index = 0; index < CASES; index += 1) {
      const quantity = decimalText(random, 3, Math.floor(random() * 9));
      const averagePrice = decimalText(random, 5, Math.floor(random() * 9));
      const price = decimalText(random, 5, Math.floor(random() * 9));
      const target = decimalText(random, 5, 4);
      const stop = decimalText(random, 5, 4);
      const server = buildSummaryItem({
        asset: asset(quantity, averagePrice),
        price: { value: price, at: 0, source: '15m' },
        rule: null,
        levels: { target: { price: target }, stop: { price: stop } } as never,
      });
      const item = {
        symbol: 'BTCUSDT',
        quantity,
        averagePrice,
        price: { value: price },
        value: server.value,
        cost: server.cost,
        result: server.result,
        resultRate: server.resultRate,
        targetPrice: target,
        stopPrice: stop,
        isTargetReached: server.isTargetReached,
        isStopReached: server.isStopReached,
        rule: null,
      } satisfies AssetItem;
      const panel = computeAssetNumbers(item, price);
      const label = `${quantity} × ${price} (médio ${averagePrice})`;
      expect(panel.value, label).toEqual(parseScaled(server.value ?? ''));
      expect(panel.cost, label).toBe(parseScaled(server.cost) ?? 0n);
      expect(panel.result, label).toEqual(parseScaled(server.result ?? ''));
      expect(panel.resultRate, label).toEqual(parseScaled(server.resultRate ?? ''));
      expect(panel.isTargetReached, label).toBe(server.isTargetReached ?? undefined);
      expect(panel.isStopReached, label).toBe(server.isStopReached ?? undefined);
    }
  });
});
