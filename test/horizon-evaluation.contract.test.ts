// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  computeGoalSignals,
  computeHorizonWindows,
  horizonCandlesOf,
  summarizeHorizon,
  toEngineDecimal,
} from '../packages/strategy-engine/src/index.js';
import { toEngineCandle } from '../packages/run-recording/src/index.js';
import {
  createHorizonsHarness,
  type HorizonsHarness,
} from './fixtures/api-routes/horizons-harness.fixture.js';
import { setupFor } from '../apps/api-ativada/src/goals/goal-evaluation-series.js';
import { SUBJECT_A, SUBJECT_B } from './fixtures/api-routes/runs-harness.fixture.js';

// Cada avaliação a frio roda o motor de verdade sobre dado real (400 diários e 2.000 de 15 min).
setDefaultTimeout(120_000);

const MINUTE = 60_000;
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'] as const;
const OPEN_HARNESSES: HorizonsHarness[] = [];

afterEach(async () => {
  for (const harness of OPEN_HARNESSES.splice(0)) await harness.stop();
});

async function openHarness(
  options: Parameters<typeof createHorizonsHarness>[0] = {},
): Promise<HorizonsHarness> {
  const harness = await createHorizonsHarness(options);
  OPEN_HARNESSES.push(harness);
  return harness;
}

async function evaluate(
  harness: HorizonsHarness,
  params: { readonly symbol: string; readonly strategyId?: string; readonly subject?: string },
): ReturnType<HorizonsHarness['evaluateHorizons']> {
  return harness.evaluateHorizons(harness.scopeOf(params.subject ?? SUBJECT_A), {
    symbol: params.symbol,
    strategyId: params.strategyId,
  });
}

async function expectRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('a promessa deveria ter sido rejeitada');
}

describe('avaliação de prazos de uma moeda', () => {
  test('devolve as linhas de 7, 15 e 30 dias e a de 15 minutos da estratégia do dono', async () => {
    const harness = await openHarness();
    const seeded = await harness.seedStrategy(SUBJECT_A, 'principal');
    const result = await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(result.symbol).toBe('BTCUSDT');
    expect(result.evaluatedStrategies).toBe(1);
    expect(result.isStrategyListTruncated).toBe(false);
    expect(result.daily.map((row) => row.summary.horizonDays)).toStrictEqual([7, 15, 30]);
    expect(result.daily.every((row) => row.strategy.id === seeded.strategyId)).toBe(true);
    expect(result.daily.every((row) => row.strategy.versionId === seeded.versionId)).toBe(true);
    expect(result.intraday?.strategy.id).toBe(seeded.strategyId);
    expect(result.intraday?.summary.tradeCount).toBeGreaterThanOrEqual(0);
    expect(result.unavailable).toStrictEqual([]);
  });

  test('as linhas de dias são as janelas do motor sobre os candles diários, com os sinais calculados uma vez', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'principal');
    const result = await evaluate(harness, { symbol: 'BTCUSDT' });
    const request = harness.computations.requests[0];
    if (request === undefined) throw new Error('nenhum cálculo pedido');
    const { strategy, daily } = request;
    const signals = computeGoalSignals({
      strategy,
      run: daily.run,
      candles: daily.candles,
      sentiments: undefined,
    });
    for (const horizonDays of [7, 15, 30]) {
      const expected = summarizeHorizon({
        horizonDays,
        windows: computeHorizonWindows({
          strategy,
          run: daily.run,
          candles: daily.candles,
          signals,
          initial: toEngineDecimal(daily.run.parameters.initialBalance),
          horizonCandles: horizonCandlesOf(horizonDays, '1d'),
        }),
      });
      expect(
        result.daily.find((row) => row.summary.horizonDays === horizonDays)?.summary,
      ).toStrictEqual(expected);
    }
    expect(harness.computations.count).toBe(1);
  });

  test('a série diária é a diária e a rápida é a de 15 minutos, com o passo de cada timeframe', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'principal');
    await evaluate(harness, { symbol: 'ETHUSDT' });
    const request = harness.computations.requests[0];
    if (request === undefined) throw new Error('nenhum cálculo pedido');
    expect(request.daily.run).toStrictEqual(setupFor('ETHUSDT', '1d'));
    expect(request.intraday.run).toStrictEqual(setupFor('ETHUSDT', '15m'));
    expect(request.daily.candles.length).toBeGreaterThan(300);
    expect(request.intraday.candles.length).toBe(2_000);
    expect(request.intraday.candles.at(-1)).toStrictEqual(
      toEngineCandle(
        harness.candleRecords
          .filter((record) => record.symbol === 'ETHUSDT' && record.timeframe === '15m')
          .at(-1)!,
      ),
    );
  });

  test('sem strategyId vale as 5 estratégias mais novas; com strategyId, só aquela', async () => {
    const harness = await openHarness();
    const seeds = [];
    for (let index = 0; index < 6; index += 1) {
      seeds.push(await harness.seedStrategy(SUBJECT_A, `n${index}`));
    }
    const all = await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(all.evaluatedStrategies).toBe(5);
    expect(all.isStrategyListTruncated).toBe(true);
    const target = seeds[0]!;
    const one = await evaluate(harness, { symbol: 'BTCUSDT', strategyId: target.strategyId });
    expect(one.evaluatedStrategies).toBe(1);
    expect(one.isStrategyListTruncated).toBe(false);
    expect(one.daily.every((row) => row.strategy.id === target.strategyId)).toBe(true);
  });

  test('estratégia de outro usuário e estratégia inexistente são o mesmo erro', async () => {
    const harness = await openHarness();
    const alien = await harness.seedStrategy(SUBJECT_B, 'de-b');
    await harness.seedStrategy(SUBJECT_A, 'minha');
    const foreign = await expectRejection(
      evaluate(harness, { symbol: 'BTCUSDT', strategyId: alien.strategyId }),
    );
    const missing = await expectRejection(
      evaluate(harness, { symbol: 'BTCUSDT', strategyId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9dff' }),
    );
    expect(foreign).toMatchObject({ status: 404, code: 'STRATEGY_NOT_FOUND' });
    expect(missing).toMatchObject({ status: 404, code: 'STRATEGY_NOT_FOUND' });
    expect(harness.computations.count).toBe(0);
  });

  test('uma estratégia que falha no cálculo vira indisponível só ela; as outras aparecem e não são canceladas', async () => {
    const harness = await openHarness();
    const first = await harness.seedStrategy(SUBJECT_A, 'a');
    const second = await harness.seedStrategy(SUBJECT_A, 'b');
    harness.computations.failFirst = true;
    harness.computations.hold = new Promise<void>((resolve) => setTimeout(resolve, 50));
    const result = await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(result.evaluatedStrategies).toBe(2);
    expect(result.unavailable).toHaveLength(1);
    expect(result.unavailable[0]?.reason).toBe('HORIZON_EVALUATION_FAILED');
    const failedId = result.unavailable[0]?.strategyId;
    expect([first.strategyId, second.strategyId].includes(failedId ?? '')).toBe(true);
    const survivor = failedId === first.strategyId ? second.strategyId : first.strategyId;
    expect(result.daily.length).toBeGreaterThan(0);
    expect(result.daily.every((row) => row.strategy.id === survivor)).toBe(true);
    expect(harness.computations.signals.every((signal) => signal?.aborted !== true)).toBe(true);
  });

  test('se TODAS as estratégias falham no cálculo, o erro sobe', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'unica');
    harness.computations.failFirst = true;
    const failure = await expectRejection(evaluate(harness, { symbol: 'BTCUSDT' }));
    expect((failure as Error).message).toBe('thread perdida');
  });

  test('o pedido abortado aborta o lote, mesmo com cálculos que terminaram', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'a');
    harness.computations.hold = new Promise<void>((resolve) => setTimeout(resolve, 50));
    const controller = new AbortController();
    const pending = harness.evaluateHorizons(
      harness.scopeOf(SUBJECT_A),
      { symbol: 'BTCUSDT', strategyId: undefined },
      controller.signal,
    );
    controller.abort(new Error('cliente saiu'));
    const failure = await expectRejection(pending);
    expect((failure as Error).message).toBe('cliente saiu');
  });

  test('estratégia sem versão legível é o mesmo 404', async () => {
    const harness = await openHarness();
    const seeded = await harness.seedStrategy(SUBJECT_A, 'sem-versao');
    const evaluateWithoutVersion = harness.app.horizonEvaluation.createHorizonEvaluationUseCase({
      strategies: {
        ...harness.strategies.repository,
        listVersionsPage: () => Promise.resolve(undefined),
      },
      candles: harness.candles.repository,
      sentiments: { listAvailable: () => Promise.resolve([]) },
      exchange: 'binance',
      now: () => harness.clock.now,
      cache: harness.app.horizonCache.createHorizonCache(),
      computeHorizon: () => Promise.reject(new Error('não deveria calcular')),
      coldGate: harness.app.goalColdGate.createColdEvaluationGate({
        maxConcurrent: 1,
        budget: { charge: () => undefined },
      }),
    });
    const missing = await expectRejection(
      evaluateWithoutVersion(harness.scopeOf(SUBJECT_A), {
        symbol: 'BTCUSDT',
        strategyId: seeded.strategyId,
      }),
    );
    expect(missing).toMatchObject({ status: 404, code: 'STRATEGY_NOT_FOUND' });
  });

  test('sem estratégia nenhuma não há o que calcular nem o que cobrar', async () => {
    const harness = await openHarness();
    const result = await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(result.evaluatedStrategies).toBe(0);
    expect(result.daily).toStrictEqual([]);
    expect(result.intraday).toBeUndefined();
    expect(result.recommendedHorizonDays).toBeUndefined();
    expect(harness.computations.count).toBe(0);
  });
});

describe('cache dos prazos', () => {
  test('a segunda chamada com os mesmos candles não recalcula e devolve o mesmo resultado', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'principal');
    const first = await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(harness.computations.count).toBe(1);
    const second = await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(harness.computations.count).toBe(1);
    expect(second).toStrictEqual(first);
  });

  test('candle novo na série diária ou na de 15 minutos muda a chave e recalcula', async () => {
    const harness = await openHarness({ symbols: ['BTCUSDT'] });
    await harness.seedStrategy(SUBJECT_A, 'principal');
    await evaluate(harness, { symbol: 'BTCUSDT' });
    const lastDaily = harness.candleRecords.filter((row) => row.timeframe === '1d').at(-1)!;
    harness.candleRecords.push({
      ...lastDaily,
      openTime: lastDaily.openTime + 86_400_000,
      closeTime: lastDaily.closeTime + 86_400_000,
    });
    harness.clock.now += 2 * 86_400_000;
    harness.clock.now += 2 * MINUTE;
    await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(harness.computations.count).toBe(2);
    const lastQuarter = harness.candleRecords.filter((row) => row.timeframe === '15m').at(-1)!;
    harness.candleRecords.push({
      ...lastQuarter,
      openTime: lastQuarter.openTime + 900_000,
      closeTime: lastQuarter.closeTime + 900_000,
    });
    harness.clock.now += 2 * MINUTE;
    await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(harness.computations.count).toBe(3);
  });

  test('outra moeda recalcula; a estratégia nova calcula só a si, a antiga segue em cache', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'principal');
    await evaluate(harness, { symbol: 'BTCUSDT' });
    await evaluate(harness, { symbol: 'ETHUSDT' });
    expect(harness.computations.count).toBe(2);
    await harness.seedStrategy(SUBJECT_A, 'segunda');
    await evaluate(harness, { symbol: 'BTCUSDT' });
    expect(harness.computations.count).toBe(3);
  });
});

describe('portão a frio dos prazos', () => {
  test('a quarta avaliação a frio no mesmo minuto é 429; a que vem do cache não gasta o orçamento', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'principal');
    for (const symbol of SYMBOLS.slice(0, 3)) await evaluate(harness, { symbol });
    const refused = await expectRejection(evaluate(harness, { symbol: SYMBOLS[3] }));
    expect(refused).toMatchObject({ status: 429 });
    expect(
      Number((refused as { headers: Record<string, string> }).headers['Retry-After']),
    ).toBeGreaterThan(0);
    expect(harness.computations.count).toBe(3);
    await evaluate(harness, { symbol: SYMBOLS[0] });
    expect(harness.computations.count).toBe(3);
    harness.clock.now += MINUTE + 1;
    await evaluate(harness, { symbol: SYMBOLS[3] });
    expect(harness.computations.count).toBe(4);
  });

  test('o orçamento é por usuário: o esgotado de um não trava o outro', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'a');
    await harness.seedStrategy(SUBJECT_B, 'b');
    for (const symbol of SYMBOLS.slice(0, 3)) await evaluate(harness, { symbol });
    await expectRejection(evaluate(harness, { symbol: SYMBOLS[3] }));
    const other = await evaluate(harness, { symbol: SYMBOLS[3], subject: SUBJECT_B });
    expect(other.evaluatedStrategies).toBe(1);
  });

  test('uma avaliação a frio em voo por usuário: a mesma moeda divide, outra moeda é 429', async () => {
    const harness = await openHarness();
    await harness.seedStrategy(SUBJECT_A, 'principal');
    let release: () => void = () => undefined;
    harness.computations.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = evaluate(harness, { symbol: 'BTCUSDT' });
    const shared = evaluate(harness, { symbol: 'BTCUSDT' });
    await Bun.sleep(300);
    const refused = await expectRejection(evaluate(harness, { symbol: 'ETHUSDT' }));
    expect(refused).toMatchObject({ status: 429 });
    release();
    expect(await shared).toStrictEqual(await first);
    expect(harness.computations.count).toBe(1);
  });

  test('o teto global recusa com 503 outro usuário enquanto o limite de avaliações a frio está cheio', async () => {
    const harness = await openHarness({ maxConcurrentColdEvaluations: 1 });
    await harness.seedStrategy(SUBJECT_A, 'a');
    await harness.seedStrategy(SUBJECT_B, 'b');
    let release: () => void = () => undefined;
    harness.computations.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = evaluate(harness, { symbol: 'BTCUSDT' });
    await Bun.sleep(300);
    const refused = await expectRejection(
      evaluate(harness, { symbol: 'BTCUSDT', subject: SUBJECT_B }),
    );
    expect(refused).toMatchObject({ status: 503 });
    release();
    await inFlight;
  });
});
