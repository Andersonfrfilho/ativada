// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { EngineDecimal } from '../packages/strategy-engine/src/index.js';
import {
  createAssetsHarness,
  type AssetsHarness,
} from './fixtures/api-routes/assets-harness.fixture.js';
import {
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
} from './fixtures/api-routes/runs-harness.fixture.js';

const SUMMARY = '/v1/assets/summary';
const WITHOUT_CANDLES = 'ADAUSDT';

type Item = {
  symbol: string;
  quantity: string;
  averagePrice: string;
  price: { value: string; at: number; source: string } | null;
  value: string | null;
  cost: string;
  result: string | null;
  resultRate: string | null;
  targetPrice: string;
  stopPrice: string;
  isTargetReached: boolean | null;
  isStopReached: boolean | null;
  rule: {
    action: string;
    situation: { signal: { action: string }; triggers: { state: string } };
  } | null;
};
type Summary = {
  currency: string;
  targetRate: string;
  stopRate: string;
  strategy: { id: string; versionId: string } | null;
  items: Item[];
  totals: {
    value: string;
    cost: string;
    result: string;
    resultRate: string | null;
    pricedAssets: number;
    unpricedAssets: number;
  };
};

let harness: AssetsHarness;
let strategyA: { strategyId: string; versionId: string };

beforeAll(async () => {
  harness = await createAssetsHarness({ symbolsWithoutCandles: [WITHOUT_CANDLES] });
  strategyA = await harness.seedStrategy(SUBJECT_A, 'a');
  await harness.seedStrategy(SUBJECT_B, 'b');
});

afterAll(async () => {
  await harness.stop();
});

// A cota por minuto é medida no relógio injetado: cada teste anda dois minutos nele.
beforeEach(() => {
  harness.clock.now += 2 * 60_000;
});

async function setAsset(
  subject: string,
  symbol: string,
  quantity: string,
  averagePrice: string,
): Promise<void> {
  const response = await harness.call({
    subject,
    method: 'PUT',
    path: `/v1/assets/${symbol}`,
    body: { quantity, averagePrice },
  });
  expect(response.status).toBe(200);
}

async function summary(subject: string, query = ''): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, path: `${SUMMARY}${query}` }));
}

function lastDailyClose(symbol: string): string {
  const row = harness.candleRecords.filter((candle) => candle.symbol === symbol).at(-1);
  if (row === undefined) throw new Error('sem candle');
  return row.close;
}

describe('GET /v1/assets/summary — valor, resultado, alvo e stop (contas à mão)', () => {
  test('o valor sai do candle mais novo, o custo do preço médio e o resultado da diferença', async () => {
    await setAsset(SUBJECT_A, 'BTCUSDT', '0.5', '60000');
    const { status, body } = await summary(SUBJECT_A);
    const data = (body as { data: Summary }).data;
    expect(status).toBe(200);
    const item = data.items.find((row) => row.symbol === 'BTCUSDT') as Item;
    const close = lastDailyClose('BTCUSDT');
    const value = new EngineDecimal(close)
      .times('0.5')
      .toDecimalPlaces(8, EngineDecimal.ROUND_FLOOR);
    expect(item.price).toMatchObject({ value: close, source: '1d' });
    expect(item.value).toBe(value.toFixed());
    expect(item.cost).toBe('30000');
    expect(item.result).toBe(value.minus(30000).toFixed());
    expect(item.resultRate).toBe(
      value.minus(30000).dividedBy(30000).toDecimalPlaces(8, EngineDecimal.ROUND_FLOOR).toFixed(),
    );
    expect(data).toMatchObject({
      currency: 'USDT',
      targetRate: '0.1',
      stopRate: '0.08',
      strategy: null,
    });
  });

  test('valor arredonda para BAIXO e custo para CIMA a 8 casas (contra o usuário)', async () => {
    await setAsset(SUBJECT_A, 'BTCUSDT', '0.33333333', '1234.56789012');
    const data = ((await summary(SUBJECT_A)).body as { data: Summary }).data;
    const item = data.items.find((row) => row.symbol === 'BTCUSDT') as Item;
    const close = lastDailyClose('BTCUSDT');
    const exactValue = new EngineDecimal('0.33333333').times(close);
    const exactCost = new EngineDecimal('0.33333333').times('1234.56789012');
    expect(exactCost.decimalPlaces()).toBeGreaterThan(8);
    expect(item.cost).toBe(exactCost.toDecimalPlaces(8, EngineDecimal.ROUND_CEIL).toFixed());
    expect(item.value).toBe(exactValue.toDecimalPlaces(8, EngineDecimal.ROUND_FLOOR).toFixed());
    await setAsset(SUBJECT_A, 'BTCUSDT', '1', '60000');
  });

  test('alvo +10% e stop −8% sobre o médio, com a saída descontada (oráculo Decimal do Python)', async () => {
    await setAsset(SUBJECT_A, 'BTCUSDT', '1', '60000');
    const data = ((await summary(SUBJECT_A)).body as { data: Summary }).data;
    const item = data.items.find((row) => row.symbol === 'BTCUSDT') as Item;
    expect(item.targetPrice).toBe('66099.11562388');
    expect(item.stopPrice).toBe('55282.89670361');
  });

  test('alvo e stop configuráveis na consulta', async () => {
    const data = (
      (await summary(SUBJECT_A, '?targetRate=0.2&stopRate=0.03')).body as { data: Summary }
    ).data;
    const item = data.items.find((row) => row.symbol === 'BTCUSDT') as Item;
    expect(item.targetPrice).toBe('72108.12613514');
    expect(item.stopPrice).toBe('58287.40195924');
    expect(data).toMatchObject({ targetRate: '0.2', stopRate: '0.03' });
  });

  test('moeda barata não perde precisão: tick de 8 casas (oráculo)', async () => {
    await setAsset(SUBJECT_B, 'XRPUSDT', '1000', '0.0000123');
    const data = ((await summary(SUBJECT_B)).body as { data: Summary }).data;
    const item = data.items.find((row) => row.symbol === 'XRPUSDT') as Item;
    expect(item.targetPrice).toBe('0.00001356');
    expect(item.stopPrice).toBe('0.00001134');
  });

  test('alvo e stop atingidos: o preço atual contra os níveis', async () => {
    const close = new EngineDecimal(lastDailyClose('ETHUSDT'));
    await setAsset(SUBJECT_A, 'ETHUSDT', '1', close.dividedBy('1.5').toFixed(8));
    await setAsset(SUBJECT_A, 'SOLUSDT', '1', close.times('2').toFixed(8));
    const data = ((await summary(SUBJECT_A)).body as { data: Summary }).data;
    const eth = data.items.find((row) => row.symbol === 'ETHUSDT') as Item;
    const sol = data.items.find((row) => row.symbol === 'SOLUSDT') as Item;
    expect(eth).toMatchObject({ isTargetReached: true, isStopReached: false });
    expect(sol).toMatchObject({ isTargetReached: false, isStopReached: true });
  });

  test('o total soma só o que tem preço, e o ativo sem preço é contado à parte', async () => {
    await harness.call({
      subject: SUBJECT_B,
      method: 'PUT',
      path: `/v1/assets/${WITHOUT_CANDLES}`,
      body: { quantity: '5', averagePrice: '1' },
    });
    const data = ((await summary(SUBJECT_B)).body as { data: Summary }).data;
    const missing = data.items.find((row) => row.symbol === WITHOUT_CANDLES) as Item;
    expect(missing).toMatchObject({
      price: null,
      value: null,
      result: null,
      resultRate: null,
      isTargetReached: null,
      isStopReached: null,
    });
    expect(data.totals.unpricedAssets).toBe(1);
    expect(data.totals.pricedAssets).toBe(data.items.length - 1);
    const priced = data.items.filter((row) => row.value !== null);
    const sum = priced.reduce((total, row) => total.plus(row.value ?? 0), new EngineDecimal(0));
    expect(data.totals.value).toBe(sum.toFixed());
    expect(data.totals.cost).toBe(
      priced.reduce((total, row) => total.plus(row.cost), new EngineDecimal(0)).toFixed(),
    );
  });

  test('posição zerada (venda total) não aparece no resumo', async () => {
    await setAsset(SUBJECT_B, 'BNBUSDT', '3', '600');
    await harness.call({
      subject: SUBJECT_B,
      method: 'PATCH',
      path: '/v1/assets/BNBUSDT',
      body: { side: 'sell', quantity: '3' },
    });
    const data = ((await summary(SUBJECT_B)).body as { data: Summary }).data;
    expect(data.items.some((row) => row.symbol === 'BNBUSDT')).toBe(false);
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find((candidate) => candidate.path === SUMMARY);
    const result = await summary(SUBJECT_A, `?strategyId=${strategyA.strategyId}`);
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((result.body as { data: unknown }).data)
        .success,
    ).toBe(true);
  });
});

describe('regra do dia por ativo', () => {
  test('com a estratégia escolhida, cada ativo traz segurar, vender ou aguardar e o que falta para vender', async () => {
    const data = (
      (await summary(SUBJECT_A, `?strategyId=${strategyA.strategyId}`)).body as { data: Summary }
    ).data;
    expect(data.strategy?.id).toBe(strategyA.strategyId);
    expect(data.items.length).toBeGreaterThan(1);
    const expected: Record<string, string> = { BUY: 'hold', SELL: 'sell', HOLD: 'wait' };
    for (const item of data.items) {
      expect(item.rule).not.toBeNull();
      expect(item.rule?.action).toBe(expected[item.rule?.situation.signal.action ?? '']);
      expect(item.rule?.situation.triggers.state).toBe('holding');
    }
  });

  test('sem estratégia, a regra é nula', async () => {
    const data = ((await summary(SUBJECT_A)).body as { data: Summary }).data;
    expect(data.items.every((item) => item.rule === null)).toBe(true);
  });

  test('ativo de par sem candles tem preço nulo e regra nula', async () => {
    const data = (
      (
        await summary(
          SUBJECT_B,
          `?strategyId=${(await harness.seedStrategy(SUBJECT_B, 'b2')).strategyId}`,
        )
      ).body as { data: Summary }
    ).data;
    const missing = data.items.find((row) => row.symbol === WITHOUT_CANDLES) as Item;
    expect(missing.rule).toBeNull();
  });

  test('a regra fica em cache por versão, par e último candle: a repetição não recalcula; candle novo recalcula só aquele par', async () => {
    const query = `?strategyId=${strategyA.strategyId}`;
    await summary(SUBJECT_A, query);
    const afterFirst = harness.ruleWrites.count;
    const first = ((await summary(SUBJECT_A, query)).body as { data: Summary }).data;
    expect(harness.ruleWrites.count).toBe(afterFirst);
    const last = harness.candleRecords.filter((candle) => candle.symbol === 'BTCUSDT').at(-1);
    if (last === undefined) throw new Error('sem candle');
    const DAY = 86_400_000;
    harness.candleRecords.push({
      ...last,
      openTime: last.openTime + DAY,
      closeTime: last.closeTime + DAY,
    });
    harness.clock.now += DAY;
    const next = ((await summary(SUBJECT_A, query)).body as { data: Summary }).data;
    expect(harness.ruleWrites.count).toBe(afterFirst + 1);
    expect(next.items.length).toBe(first.items.length);
  });
});

describe('validação e contrato negativo', () => {
  test.each([
    ['alvo zero', '?targetRate=0'],
    ['alvo acima de 1000%', '?targetRate=10.01'],
    ['stop de 100%', '?stopRate=1'],
    ['stop zero', '?stopRate=0'],
    ['estratégia malformada', '?strategyId=nao-e-uuid'],
    ['parâmetro desconhecido', '?foo=1'],
  ])('%s é 400', async (_name, query) => {
    expect((await summary(SUBJECT_A, query)).status).toBe(400);
  });

  test('estratégia de outro usuário e estratégia inexistente são o mesmo 404', async () => {
    const strategyOfB = await harness.seedStrategy(SUBJECT_B, 'alheia');
    const foreign = await summary(SUBJECT_A, `?strategyId=${strategyOfB.strategyId}`);
    const missing = await summary(SUBJECT_A, `?strategyId=${MISSING_ID}`);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(missing.body));
    expect((foreign.body as { error: { code: string } }).error.code).toBe('STRATEGY_NOT_FOUND');
  });

  test('o resumo de B nunca traz os ativos de A', async () => {
    const dataB = ((await summary(SUBJECT_B)).body as { data: Summary }).data;
    const ownA = harness.userAssets.allOf(harness.scopeOf(SUBJECT_A));
    expect(ownA.length).toBeGreaterThan(0);
    for (const item of dataB.items) {
      const mine = harness.userAssets
        .allOf(harness.scopeOf(SUBJECT_B))
        .find((row) => row.symbol === item.symbol);
      expect(item.quantity).toBe(mine?.quantity ?? '');
    }
  });

  test('a rota tem limite por usuário: a 21ª chamada no mesmo minuto é 429', async () => {
    const statuses: number[] = [];
    for (let call = 0; call < 21; call += 1) statuses.push((await summary(SUBJECT_B)).status);
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
