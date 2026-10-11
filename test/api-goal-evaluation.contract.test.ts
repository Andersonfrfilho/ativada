// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';

import type { GoalCacheKeyParams } from '../apps/api-cryptoada/src/goals/goal-evaluation-cache.js';
import {
  createGoalsHarness,
  GOAL_SYMBOLS,
  type GoalsHarness,
} from './fixtures/api-routes/goals-harness.fixture.js';
import {
  CLASSIC_CONFIG,
  HOUR,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
} from './fixtures/api-routes/runs-harness.fixture.js';

// Sem o cache (mutante) a avaliação leva segundos por chamada: o teste precisa FALHAR pela asserção, não por tempo esgotado.
setDefaultTimeout(120_000);

const GOALS = '/v1/goals';
const DAY = 24 * HOUR;
const WITHOUT_CANDLES = 'ADAUSDT';
const BASE_GOAL = { symbol: 'BTCUSDT', targetRate: '0.02', horizonDays: 30, maxLossRate: '0.05' };

type Combination = {
  rank: number;
  strategy: { id: string; name: string; versionId: string; version: number };
  symbol: string;
  isGoalSymbol: boolean;
  candlesUsed: number;
  lastCandleOpenTime: number | null;
  evaluation: {
    version: string;
    windowCount: number;
    reachedCount: number;
    stoppedCount: number;
    expiredCount: number;
    reachRate: string | null;
    stopRate: string | null;
    medianDaysToTarget: string | null;
    verdict: string;
    benchmark: { reachRate: string | null };
    goal: { targetRate: string; horizonDays: number; maxLossRate: string };
  };
  situation: {
    signal: { action: string; score: string };
    triggers: { state: string; rules: { ruleId: string }[] };
  } | null;
};
type EvaluationBody = {
  data: {
    goal: { id: string };
    timeframe: string;
    evaluatedStrategies: number;
    isStrategyListTruncated: boolean;
    combinations: Combination[];
    unavailable: { strategyId: string; symbol: string; reason: string }[];
  };
};

let harness: GoalsHarness;

beforeAll(async () => {
  harness = await createGoalsHarness({
    symbolsWithoutCandles: [WITHOUT_CANDLES],
    maxGoals: 50,
  });
  await harness.seedStrategy(SUBJECT_A, 'principal');
  await harness.seedStrategy(SUBJECT_B, 'de-b');
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: os limites por minuto são medidos nele e os testes não consomem a
// cota uns dos outros.
beforeEach(() => {
  harness.clock.now += 2 * 60_000;
});

async function createGoal(
  subject: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { body } = await readJson(
    await harness.call({
      subject,
      method: 'POST',
      path: GOALS,
      body: { ...BASE_GOAL, ...overrides },
    }),
  );
  return (body as { data: { id: string } }).data.id;
}

async function evaluate(subject: string, goalId: string): Promise<EvaluationBody['data']> {
  const response = await harness.call({ subject, path: `${GOALS}/${goalId}/evaluation` });
  expect(response.status).toBe(200);
  return ((await response.json()) as EvaluationBody).data;
}

describe('GET /v1/goals/:id/evaluation', () => {
  test('a rota tem limite próprio por usuário: a 21ª chamada no mesmo minuto é 429', async () => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 41 });
    const statuses: number[] = [];
    for (let call = 0; call < 21; call += 1) {
      statuses.push(
        (await harness.call({ subject: SUBJECT_A, path: `${GOALS}/${goalId}/evaluation` })).status,
      );
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(
      (await harness.call({ subject: SUBJECT_B, path: `${GOALS}/${goalId}/evaluation` })).status,
    ).toBe(404);
  });

  test('exige token', async () => {
    const goalId = await createGoal(SUBJECT_A);
    expect((await harness.call({ path: `${GOALS}/${goalId}/evaluation` })).status).toBe(401);
  });

  test('uma combinação por estratégia do dono e por par habilitado, com a situação no último candle', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const data = await evaluate(SUBJECT_A, goalId);
    expect(data.timeframe).toBe('1d');
    expect(data.goal.id).toBe(goalId);
    expect(data.evaluatedStrategies).toBe(1);
    expect(data.isStrategyListTruncated).toBe(false);
    expect(data.combinations.map((entry) => entry.symbol).sort()).toStrictEqual(
      [...GOAL_SYMBOLS, WITHOUT_CANDLES].sort(),
    );
    const btc = data.combinations.find((entry) => entry.symbol === 'BTCUSDT');
    expect(btc?.isGoalSymbol).toBe(true);
    expect(data.combinations.filter((entry) => entry.isGoalSymbol)).toHaveLength(1);
    expect(btc?.evaluation.version).toBe('goal-1');
    expect(btc?.evaluation.goal).toStrictEqual({
      targetRate: '0.02',
      horizonDays: 30,
      maxLossRate: '0.05',
    });
    expect(btc?.evaluation.windowCount).toBeGreaterThan(100);
    expect(btc?.candlesUsed).toBe(400);
    expect(btc?.situation?.triggers.state).toBe('awaiting_entry');
    expect(btc?.situation?.triggers.rules.map((rule) => rule.ruleId)).toStrictEqual([
      'ema-9-21',
      'macd-12-26-9',
      'rsi-14',
      'obv-ema-20',
    ]);
  });

  test('o ranking ordena por chegada (maior), stop (menor), janelas (mais) e chave, calculado à parte', async () => {
    const goalId = await createGoal(SUBJECT_A, { targetRate: '0.01', horizonDays: 20 });
    const { combinations } = await evaluate(SUBJECT_A, goalId);
    expect(combinations.map((entry) => entry.rank)).toStrictEqual(
      combinations.map((_unused, index) => index + 1),
    );
    const different = new Set(combinations.map((entry) => entry.evaluation.reachRate));
    expect(different.size).toBeGreaterThan(1);
    for (const [index, current] of combinations.entries()) {
      const next = combinations[index + 1];
      if (next === undefined) break;
      const a = current.evaluation;
      const b = next.evaluation;
      if (b.windowCount === 0) continue;
      expect(a.windowCount).toBeGreaterThan(0);
      const reach = a.reachedCount * b.windowCount - b.reachedCount * a.windowCount;
      const stop = a.stoppedCount * b.windowCount - b.stoppedCount * a.windowCount;
      expect(reach).toBeGreaterThanOrEqual(0);
      if (reach === 0) expect(stop).toBeLessThanOrEqual(0);
    }
    const last = combinations.at(-1);
    expect(last?.symbol).toBe(WITHOUT_CANDLES);
    expect(last?.evaluation.windowCount).toBe(0);
  });

  test('par sem nenhum candle: zero janelas, régua SEGURAR, sem situação, e não derruba o resto', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const { combinations } = await evaluate(SUBJECT_A, goalId);
    const empty = combinations.find((entry) => entry.symbol === WITHOUT_CANDLES);
    expect(empty).toMatchObject({
      candlesUsed: 0,
      lastCandleOpenTime: null,
      situation: null,
      evaluation: { windowCount: 0, reachRate: null, verdict: 'SEGURAR' },
    });
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find(
      (candidate) => candidate.path === `${GOALS}/:goalId/evaluation`,
    );
    const goalId = await createGoal(SUBJECT_A);
    const data = await evaluate(SUBJECT_A, goalId);
    expect(route?.documentation?.successes[0]?.schema?.safeParse(data).success).toBe(true);
  });

  test('a avaliação com 5 pares reais leva menos de 1 s (mediana de 3 metas novas)', async () => {
    const times: number[] = [];
    for (const horizonDays of [14, 21, 45]) {
      const goalId = await createGoal(SUBJECT_A, { horizonDays, targetRate: '0.015' });
      const started = performance.now();
      await evaluate(SUBJECT_A, goalId);
      times.push(performance.now() - started);
    }
    const median =
      [...times].sort((first, second) => first - second)[1] ?? Number.POSITIVE_INFINITY;
    expect(median).toBeLessThan(1_000);
  });

  test('o resultado fica em cache por meta, estratégia, par e último candle: a repetição não recalcula', async () => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 33 });
    const first = await evaluate(SUBJECT_A, goalId);
    const computed = harness.evaluations.count;
    expect(computed).toBeGreaterThanOrEqual(GOAL_SYMBOLS.length);
    const second = await evaluate(SUBJECT_A, goalId);
    expect(harness.evaluations.count).toBe(computed);
    expect(second).toStrictEqual(first);
  });

  test('candle novo invalida só o par que o recebeu', async () => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 34 });
    const before = await evaluate(SUBJECT_A, goalId);
    const computed = harness.evaluations.count;
    const last = harness.candleRecords.filter((record) => record.symbol === 'ETHUSDT').at(-1);
    if (last === undefined) throw new Error('sem candle de ETHUSDT');
    harness.candleRecords.push({
      ...last,
      openTime: last.openTime + DAY,
      closeTime: last.closeTime + DAY,
      close: String(Number(last.close) * 1.01),
      high: String(Number(last.high) * 1.02),
    });
    harness.clock.now += DAY;
    const after = await evaluate(SUBJECT_A, goalId);
    expect(harness.evaluations.count).toBe(computed + 1);
    const ofSymbol = (body: EvaluationBody['data'], symbol: string): Combination | undefined =>
      body.combinations.find((entry) => entry.symbol === symbol);
    expect(ofSymbol(after, 'ETHUSDT')?.candlesUsed).toBe(
      (ofSymbol(before, 'ETHUSDT')?.candlesUsed ?? 0) + 1,
    );
    expect(ofSymbol(after, 'BTCUSDT')?.evaluation).toStrictEqual(
      ofSymbol(before, 'BTCUSDT')?.evaluation,
    );
    expect(ofSymbol(after, 'BTCUSDT')?.situation).toStrictEqual(
      ofSymbol(before, 'BTCUSDT')?.situation,
    );
  });

  test('alterar a meta invalida o cache dela', async () => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 35 });
    await evaluate(SUBJECT_A, goalId);
    const computed = harness.evaluations.count;
    await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${GOALS}/${goalId}`,
      body: { targetRate: '0.04' },
    });
    const after = await evaluate(SUBJECT_A, goalId);
    expect(harness.evaluations.count).toBeGreaterThan(computed);
    expect(after.combinations[0]?.evaluation.goal.targetRate).toBe('0.04');
  });

  test('cada dono avalia a própria meta: o dono B recalcula a dele', async () => {
    const goalOfA = await createGoal(SUBJECT_A, { horizonDays: 36 });
    const goalOfB = await createGoal(SUBJECT_B, { horizonDays: 36 });
    await evaluate(SUBJECT_A, goalOfA);
    const computed = harness.evaluations.count;
    await evaluate(SUBJECT_B, goalOfB);
    expect(harness.evaluations.count).toBeGreaterThanOrEqual(computed + GOAL_SYMBOLS.length);
  });

  test('série com lacuna usa o trecho contíguo mais recente, sem erro', async () => {
    const goalId = await createGoal(SUBJECT_A, { symbol: 'SOLUSDT', horizonDays: 37 });
    const record = harness.candleRecords.filter((entry) => entry.symbol === 'SOLUSDT');
    const middle = record[Math.floor(record.length / 2)];
    if (middle === undefined) throw new Error('sem candle');
    const index = harness.candleRecords.indexOf(middle);
    harness.candleRecords.splice(index, 1);
    const data = await evaluate(SUBJECT_A, goalId);
    const sol = data.combinations.find((entry) => entry.symbol === 'SOLUSDT');
    expect(sol?.candlesUsed).toBe(record.length - Math.floor(record.length / 2) - 1);
    expect(sol?.evaluation.windowCount).toBeGreaterThanOrEqual(0);
  });

  test('só as 5 estratégias mais novas entram, e a resposta avisa que cortou', async () => {
    for (let index = 0; index < 6; index += 1) {
      await harness.seedStrategy(SUBJECT_A, `extra-${index}`);
    }
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 38 });
    const data = await evaluate(SUBJECT_A, goalId);
    expect(data.evaluatedStrategies).toBe(5);
    expect(data.isStrategyListTruncated).toBe(true);
    const names = new Set(data.combinations.map((entry) => entry.strategy.name));
    expect(names.has('Estratégia principal')).toBe(false);
    expect(names.size).toBe(5);
  });

  test('só a estratégia com Fear & Greed pede o sentimento ao banco', async () => {
    const before = harness.sentimentReads.count;
    const goalId = await createGoal(SUBJECT_B, { horizonDays: 39 });
    await evaluate(SUBJECT_B, goalId);
    expect(harness.sentimentReads.count).toBe(before);
    const config = structuredClone(CLASSIC_CONFIG) as { rules: unknown[] };
    config.rules.push({
      id: 'fear-greed',
      kind: 'fear_greed',
      fearAtOrBelow: 25,
      greedAtOrAbove: 75,
    });
    const created = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: '/v1/strategies',
      body: { name: 'Com sentimento', config },
    });
    expect(created.status).toBe(201);
    const second = await createGoal(SUBJECT_B, { horizonDays: 40 });
    const data = await evaluate(SUBJECT_B, second);
    expect(harness.sentimentReads.count).toBeGreaterThan(before);
    const withSentiment = data.combinations.find(
      (entry) => entry.strategy.name === 'Com sentimento' && entry.symbol === 'BTCUSDT',
    );
    expect(withSentiment?.situation?.triggers.rules.map((rule) => rule.ruleId)).toContain(
      'fear-greed',
    );
  });

  test('o dono sem estratégia recebe a lista vazia, não erro', async () => {
    const lonely = await createGoalsHarness();
    try {
      const created = await readJson(
        await lonely.call({ subject: SUBJECT_A, method: 'POST', path: GOALS, body: BASE_GOAL }),
      );
      const goalId = (created.body as { data: { id: string } }).data.id;
      const response = await lonely.call({
        subject: SUBJECT_A,
        path: `${GOALS}/${goalId}/evaluation`,
      });
      const body = (await response.json()) as EvaluationBody;
      expect(response.status).toBe(200);
      expect(body.data.combinations).toStrictEqual([]);
      expect(body.data.evaluatedStrategies).toBe(0);
    } finally {
      await lonely.stop();
    }
  });
});

describe('o cache de avaliações é limitado e descarta o mais antigo', () => {
  const key = (symbol: string): GoalCacheKeyParams => ({
    goalId: 'g',
    targetRate: '0.03',
    maxLossRate: '0.05',
    horizonDays: 30,
    strategyVersionId: 'v',
    symbol,
    lastCandleOpenTime: 1,
  });
  const value = { evaluation: { windowCount: 1 } as never, situation: null };

  test('passando do teto, sai a entrada mais antiga', () => {
    const cache = harness.app.goalCache.createGoalEvaluationCache(2);
    cache.set(key('A'), value);
    cache.set(key('B'), value);
    cache.set(key('C'), value);
    expect(
      [cache.get(key('A')), cache.get(key('B')), cache.get(key('C'))].map(
        (entry) => entry !== undefined,
      ),
    ).toStrictEqual([false, true, true]);
  });

  test('gravar de novo a mesma chave a torna a mais nova', () => {
    const cache = harness.app.goalCache.createGoalEvaluationCache(2);
    cache.set(key('A'), value);
    cache.set(key('B'), value);
    cache.set(key('A'), value);
    cache.set(key('C'), value);
    expect(
      [cache.get(key('A')), cache.get(key('B')), cache.get(key('C'))].map(
        (entry) => entry !== undefined,
      ),
    ).toStrictEqual([true, false, true]);
  });

  test('cada parte da chave separa as entradas', () => {
    const cache = harness.app.goalCache.createGoalEvaluationCache();
    cache.set(key('A'), value);
    for (const other of [
      { ...key('A'), goalId: 'x' },
      { ...key('A'), targetRate: '0.04' },
      { ...key('A'), maxLossRate: '0.06' },
      { ...key('A'), horizonDays: 31 },
      { ...key('A'), strategyVersionId: 'x' },
      { ...key('A'), symbol: 'x' },
      { ...key('A'), lastCandleOpenTime: 2 },
      { ...key('A'), lastCandleOpenTime: null },
    ]) {
      expect(cache.get(other)).toBeUndefined();
    }
    expect(cache.get(key('A'))).toBe(value);
  });
});
