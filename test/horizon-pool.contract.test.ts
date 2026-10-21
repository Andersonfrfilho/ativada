// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { setupFor } from '../apps/api-ativada/src/goals/goal-evaluation-series.js';
import {
  createGoalEvaluationPool,
  type GoalEvaluationPool,
} from '../apps/api-ativada/src/goals/goal-evaluation-pool.js';
import {
  computeHorizonLine,
  HORIZON_COMPUTATION_KIND,
  type HorizonComputeRequest,
} from '../apps/api-ativada/src/horizons/horizon-computation.js';
import { toEngineCandle } from '../packages/run-recording/src/index.js';
import { createStrategyVersion } from '../packages/strategy-engine/src/index.js';
import { buildIntradayCandles } from './fixtures/api-routes/horizons-harness.fixture.js';
import { buildDailyCandles } from './fixtures/api-routes/goals-harness.fixture.js';
import {
  REAL_WORKER_URL,
  SCRIPTED_WORKER_URL,
} from './fixtures/goal-worker/scripted-goal.constant.js';
import classicStrategy from './fixtures/strategy-engine/classic-scoreboard.strategy.json';

setDefaultTimeout(60_000);

const SYMBOL = 'BTCUSDT';

function buildRequest(): HorizonComputeRequest {
  return {
    strategy: createStrategyVersion(classicStrategy),
    daily: {
      run: setupFor(SYMBOL, '1d'),
      candles: buildDailyCandles([SYMBOL]).map(toEngineCandle),
      sentiments: undefined,
    },
    intraday: {
      run: setupFor(SYMBOL, '15m'),
      candles: buildIntradayCandles([SYMBOL]).map(toEngineCandle),
      sentiments: undefined,
    },
  };
}

const pools: GoalEvaluationPool[] = [];

function openPool(workerUrl: string): GoalEvaluationPool {
  const pool = createGoalEvaluationPool({ workerUrl, size: 1, timeoutMilliseconds: 50_000 });
  pools.push(pool);
  return pool;
}

afterEach(() => {
  for (const pool of pools.splice(0)) pool.close();
});

describe('pool de threads: tarefa de prazos', () => {
  test('a thread devolve EXATAMENTE o que o cálculo na thread principal devolveria', async () => {
    const pool = openPool(REAL_WORKER_URL);
    const request = buildRequest();
    const fromThread = await pool.computeHorizon(request);
    expect(fromThread).toStrictEqual(computeHorizonLine(request));
    expect(fromThread.kind).toBe(HORIZON_COMPUTATION_KIND.COMPUTED);
  });

  test('a mesma thread atende metas e prazos, cada resposta no seu tipo', async () => {
    const pool = openPool(REAL_WORKER_URL);
    const request = buildRequest();
    const horizon = await pool.computeHorizon(request);
    const goal = await pool.compute({
      strategy: request.strategy,
      run: request.daily.run,
      candles: request.daily.candles,
      goal: { targetRate: '0.02', maxLossRate: '0.05', horizonDays: 30 },
    });
    expect(horizon.kind).toBe(HORIZON_COMPUTATION_KIND.COMPUTED);
    expect(goal.kind).toBe('computed');
    expect(horizon).not.toStrictEqual(goal);
  });

  test('o motor que recusa os candles diários volta como "indisponível" com o código dele', async () => {
    const pool = openPool(REAL_WORKER_URL);
    const request = buildRequest();
    const broken: HorizonComputeRequest = {
      ...request,
      daily: {
        ...request.daily,
        candles: request.daily.candles.filter((_c, index) => index !== 3),
      },
    };
    const fromThread = await pool.computeHorizon(broken);
    expect(fromThread).toStrictEqual(computeHorizonLine(broken));
    expect(fromThread.kind).toBe(HORIZON_COMPUTATION_KIND.UNAVAILABLE);
  });

  test('a thread que só sabe calcular metas responde "falhou" ao pedido de prazos', async () => {
    const pool = openPool(SCRIPTED_WORKER_URL);
    let failure: unknown;
    try {
      await pool.computeHorizon(buildRequest());
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
  });

  test('cancelar o pedido de prazos rejeita com o motivo e libera a thread', async () => {
    const pool = openPool(REAL_WORKER_URL);
    const controller = new AbortController();
    const pending = pool.computeHorizon(buildRequest(), controller.signal);
    controller.abort(new Error('cliente desistiu'));
    let failure: unknown;
    try {
      await pending;
    } catch (error: unknown) {
      failure = error;
    }
    expect((failure as Error).message).toBe('cliente desistiu');
    const next = await pool.computeHorizon(buildRequest());
    expect(next.kind).toBe(HORIZON_COMPUTATION_KIND.COMPUTED);
  });
});
