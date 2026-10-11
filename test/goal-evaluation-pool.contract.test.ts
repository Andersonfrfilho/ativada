// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { toEngineCandle } from '../packages/run-recording/src/index.js';
import {
  createRunSetup,
  createStrategyVersion,
  RUN_PARAMETERS_SCHEMA_VERSION,
  type EvaluateGoalParams,
} from '../packages/strategy-engine/src/index.js';
import {
  computeGoalCombination,
  GOAL_COMPUTATION_KIND,
  type GoalComputation,
} from '../apps/api-cryptoada/src/goals/goal-computation.js';
import {
  createGoalEvaluationPool,
  type GoalEvaluationPool,
} from '../apps/api-cryptoada/src/goals/goal-evaluation-pool.js';
import { GoalEvaluationTimeoutError } from '../apps/api-cryptoada/src/goals/goal.error.js';
import { buildDailyCandles } from './fixtures/api-routes/goals-harness.fixture.js';
import {
  REAL_WORKER_URL,
  SCRIPTED_GOAL_BEHAVIOR,
  SCRIPTED_WORKER_URL,
  STALE_WORKER_URL,
} from './fixtures/goal-worker/scripted-goal.constant.js';
import classicStrategy from './fixtures/strategy-engine/classic-scoreboard.strategy.json';

setDefaultTimeout(30_000);

const TIMEOUT_MILLISECONDS = 5_000;
const SHORT_TIMEOUT_MILLISECONDS = 200;

function buildRequest(horizonDays: number, symbol = 'BTCUSDT'): EvaluateGoalParams {
  const candles = buildDailyCandles([symbol]).map(toEngineCandle);
  return {
    strategy: createStrategyVersion(classicStrategy),
    run: createRunSetup({
      schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
      symbol,
      timeframe: '1d',
      sentimentSource: 'alternative-me',
      initialBalance: '10000',
    }),
    candles,
    goal: { targetRate: '0.02', maxLossRate: '0.05', horizonDays },
  };
}

const pools: GoalEvaluationPool[] = [];

function openPool(overrides: {
  readonly workerUrl?: string;
  readonly size?: number;
  readonly timeoutMilliseconds?: number;
}): GoalEvaluationPool {
  const pool = createGoalEvaluationPool({
    workerUrl: overrides.workerUrl ?? SCRIPTED_WORKER_URL,
    size: overrides.size ?? 2,
    timeoutMilliseconds: overrides.timeoutMilliseconds ?? TIMEOUT_MILLISECONDS,
  });
  pools.push(pool);
  return pool;
}

afterEach(() => {
  for (const pool of pools.splice(0)) pool.close();
});

function threadOf(computation: GoalComputation): string {
  if (computation.kind !== GOAL_COMPUTATION_KIND.UNAVAILABLE) throw new Error('esperava o roteiro');
  return computation.reason;
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('a promessa deveria ter sido rejeitada');
}

const scripted = (behavior: number): EvaluateGoalParams => buildRequestWith(behavior);

function buildRequestWith(behavior: number): EvaluateGoalParams {
  return {
    ...buildRequest(30),
    goal: { targetRate: '0.02', maxLossRate: '0.05', horizonDays: behavior },
  };
}

describe('pool de threads da avaliação de metas', () => {
  test('a thread devolve EXATAMENTE o que o cálculo na thread principal devolveria', async () => {
    const pool = openPool({ workerUrl: REAL_WORKER_URL });
    const request = buildRequest(30);
    const fromThread = await pool.compute(request);
    expect(fromThread).toStrictEqual(computeGoalCombination(request));
    expect(fromThread.kind).toBe(GOAL_COMPUTATION_KIND.COMPUTED);
  });

  test('o motor que recusa os candles volta como "indisponível" com o código dele, não como falha', async () => {
    const pool = openPool({ workerUrl: REAL_WORKER_URL });
    const request = { ...buildRequest(30), candles: buildRequest(30).candles.slice(0, 5) };
    const fromThread = await pool.compute(request);
    expect(fromThread).toStrictEqual(computeGoalCombination(request));
  });

  test('o laço de eventos da API não para enquanto o cálculo roda: nenhum intervalo de 10 ms passa de 100 ms', async () => {
    const pool = openPool({ size: 2 });
    let last = performance.now();
    let worstGap = 0;
    const ticker = setInterval(() => {
      const now = performance.now();
      worstGap = Math.max(worstGap, now - last);
      last = now;
    }, 10);
    await Promise.all([
      pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.SLOW)),
      pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.SLOW)),
    ]);
    clearInterval(ticker);
    expect(worstGap).toBeLessThan(100);
  });

  test('o pool é limitado: seis tarefas em um pool de 2 usam no máximo 2 threads', async () => {
    const pool = openPool({ size: 2 });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.SLOW))),
    );
    const threads = new Set(results.map(threadOf));
    expect(threads.size).toBeLessThanOrEqual(2);
    expect(threads.size).toBeGreaterThanOrEqual(1);
  });

  test('o tempo máximo mata a thread presa e a tarefa seguinte roda em outra', async () => {
    const pool = openPool({ size: 1, timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS });
    const startedAt = performance.now();
    const failure = await failureOf(pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.HANG)));
    expect(failure).toBeInstanceOf(GoalEvaluationTimeoutError);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
    const next = await pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST));
    expect(threadOf(next)).toStartWith('thread-');
  });

  test('cancelar uma tarefa em andamento mata a thread na hora e libera a vaga', async () => {
    const pool = openPool({ size: 1 });
    const controller = new AbortController();
    const running = pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.HANG), controller.signal);
    await Bun.sleep(50);
    const abortedAt = performance.now();
    controller.abort(new Error('cliente foi embora'));
    const failure = await failureOf(running);
    expect((failure as Error).message).toBe('cliente foi embora');
    expect(performance.now() - abortedAt).toBeLessThan(500);
    const nextStartedAt = performance.now();
    const next = await pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST));
    expect(threadOf(next)).toStartWith('thread-');
    expect(performance.now() - nextStartedAt).toBeLessThan(1_500);
  });

  test('cancelar uma tarefa que ainda espera na fila a tira da fila sem nunca rodá-la', async () => {
    const pool = openPool({ size: 1 });
    const blocker = pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.SLOW));
    const controller = new AbortController();
    const queued = pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.HANG), controller.signal);
    controller.abort(new Error('desistiu'));
    expect(((await failureOf(queued)) as Error).message).toBe('desistiu');
    await blocker;
    const nextStartedAt = performance.now();
    const next = await pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST));
    expect(threadOf(next)).toStartWith('thread-');
    expect(performance.now() - nextStartedAt).toBeLessThan(1_500);
  });

  test('a resposta de uma tarefa velha nunca resolve a tarefa seguinte: a thread é lida pelo id', async () => {
    const pool = openPool({ workerUrl: STALE_WORKER_URL, size: 1 });
    const first = await pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST));
    expect(threadOf(first)).toBe('da-tarefa-1');
    const second = await pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST));
    expect(threadOf(second)).toBe('da-tarefa-2');
  });

  test('um sinal já cancelado nem entra no pool', async () => {
    const pool = openPool({ size: 1 });
    const controller = new AbortController();
    controller.abort(new Error('já cancelado'));
    const failure = await failureOf(
      pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST), controller.signal),
    );
    expect((failure as Error).message).toBe('já cancelado');
  });

  test('thread que morre ou lança vira erro da tarefa (não timeout) e o pool continua servindo', async () => {
    const pool = openPool({ size: 1, timeoutMilliseconds: TIMEOUT_MILLISECONDS });
    const exited = await failureOf(pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.EXIT)));
    expect(exited).toBeInstanceOf(Error);
    expect(exited).not.toBeInstanceOf(GoalEvaluationTimeoutError);
    const thrown = await failureOf(pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.THROW)));
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(GoalEvaluationTimeoutError);
    expect(threadOf(await pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST)))).toStartWith(
      'thread-',
    );
  });

  test('encerrar o pool rejeita o que está rodando e o que espera, e recusa o que vier depois', async () => {
    const pool = openPool({ size: 1 });
    const running = pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.HANG));
    const queued = pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST));
    await Bun.sleep(50);
    pool.close();
    expect(await failureOf(running)).toBeInstanceOf(Error);
    expect(await failureOf(queued)).toBeInstanceOf(Error);
    expect(await failureOf(pool.compute(scripted(SCRIPTED_GOAL_BEHAVIOR.FAST)))).toBeInstanceOf(
      Error,
    );
  });
});
