// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createRunBatchRepository,
  createRunRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  resolveRunOwnerScope,
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
  type CandleSeriesKey,
  type DatabaseHandle,
  type OwnerScope,
} from '@ativada/database';
import { isCandleTimeframe, toEngineCandle, toStoredSentiment } from '@ativada/run-recording';
import type { EngineCandle, StoredSentimentObservation } from '@ativada/strategy-engine';

import { BACKTEST_ERROR_CODE, BACKTEST_MARKET_EXCHANGE } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type {
  BacktestDatabase,
  BacktestRunSession,
  RunBlueprint,
  StartRunResult,
} from './backtest-database.types.js';
import { createResultReaders } from './database-result-readers.js';

export type SessionTarget = {
  readonly handle: DatabaseHandle;
  readonly scope: OwnerScope;
  readonly runId: string;
};

export type LifecycleMethods = Pick<
  BacktestRunSession,
  'findRun' | 'startRun' | 'readStatus' | 'readCheckpoint' | 'completeRun' | 'failRun'
>;

export function createRunLifecycle(target: SessionTarget): LifecycleMethods {
  const { handle, scope, runId } = target;
  const runs = createRunRepository(handle);
  const strategies = createStrategyRepository(handle);
  return {
    async findRun(): Promise<RunBlueprint | undefined> {
      const run = await runs.findRun(scope, runId);
      if (run === undefined) return undefined;
      const version = await strategies.findVersion(scope, run.strategyVersionId);
      return version === undefined ? undefined : { run, version };
    },
    async startRun(): Promise<StartRunResult> {
      const result = await runs.transitionRun(scope, { runId, to: RUN_STATUS.RUNNING });
      if (result.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED) return { isStarted: true };
      if (result.outcome === RUN_TRANSITION_OUTCOME.INVALID_TRANSITION) {
        return { isStarted: false, status: result.currentStatus };
      }
      throw new BacktestError(BACKTEST_ERROR_CODE.RUN_NOT_FOUND, 'A execução deixou de existir.');
    },
    readStatus: async () => (await runs.findRun(scope, runId))?.status,
    readCheckpoint: () => runs.readCheckpoint(scope, runId),
    completeRun: async (metrics) =>
      (await runs.transitionRun(scope, { runId, to: RUN_STATUS.COMPLETED, metrics })).outcome ===
      RUN_TRANSITION_OUTCOME.TRANSITIONED,
    failRun: async (errorCode) =>
      (await runs.transitionRun(scope, { runId, to: RUN_STATUS.FAILED, errorCode })).outcome ===
      RUN_TRANSITION_OUTCOME.TRANSITIONED,
  };
}

export function createMarketReaders(
  handle: DatabaseHandle,
  series: Omit<CandleSeriesKey, 'exchange'>,
): Pick<BacktestRunSession, 'findCandles' | 'listSentiment'> {
  const candles = createCandleRepository(handle);
  const sentiments = createSentimentObservationRepository(handle);
  return {
    findCandles: async (window): Promise<readonly EngineCandle[]> => {
      const records = await candles.findCandles({
        exchange: BACKTEST_MARKET_EXCHANGE,
        ...series,
        ...window,
      });
      return records.map(toEngineCandle);
    },
    listSentiment: async (query): Promise<readonly StoredSentimentObservation[]> => {
      const records = await sentiments.listAvailable({
        source: query.source,
        observedUntil: query.until,
        insertedUntil: new Date(query.until),
      });
      return records.map(toStoredSentiment);
    },
  };
}

function createSession(
  target: SessionTarget,
  series: Omit<CandleSeriesKey, 'exchange'>,
): BacktestRunSession {
  const batches = createRunBatchRepository(target.handle);
  return {
    ...createRunLifecycle(target),
    ...createMarketReaders(target.handle, series),
    ...createResultReaders(target),
    inBatch: (work) => batches.runInBatch(target.scope, target.runId, work),
  };
}

// O escopo do dono nasce aqui, de `resolveRunOwnerScope`, e fica preso à sessão: o caso de uso nunca o vê.
// SÓ vale para `runId` enfileirado pela API depois de autorizar o usuário (ADR 0001 §e, regra 8).
export function createBacktestDatabase(handle: DatabaseHandle): BacktestDatabase {
  return {
    async attach(runId): Promise<BacktestRunSession | undefined> {
      const scope = await resolveRunOwnerScope(handle, runId);
      if (scope === undefined) return undefined;
      const run = await createRunRepository(handle).findRun(scope, runId);
      if (run === undefined || !isCandleTimeframe(run.timeframe)) return undefined;
      return createSession(
        { handle, scope, runId },
        { symbol: run.symbol, timeframe: run.timeframe },
      );
    },
  };
}
