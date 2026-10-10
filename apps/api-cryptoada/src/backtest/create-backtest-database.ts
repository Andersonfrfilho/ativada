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
  type CandleRecord,
  type CandleSeriesKey,
  type DatabaseHandle,
  type OwnerScope,
} from '@cryptoada/database';
import {
  ENGINE_TIMEFRAME,
  type EngineCandle,
  type StoredSentimentObservation,
} from '@cryptoada/strategy-engine';

import { BACKTEST_ERROR_CODE, BACKTEST_MARKET_EXCHANGE } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type {
  BacktestDatabase,
  BacktestRunSession,
  RunBlueprint,
  StartRunResult,
} from './backtest-database.types.js';
import { createResultReaders } from './database-result-readers.js';

const TIMEFRAMES: readonly string[] = Object.values(ENGINE_TIMEFRAME);

function isTimeframe(value: string): value is CandleRecord['timeframe'] {
  return TIMEFRAMES.includes(value);
}

function toEngineCandle(record: CandleRecord): EngineCandle {
  return {
    symbol: record.symbol,
    timeframe: record.timeframe,
    openTime: record.openTime,
    closeTime: record.closeTime,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
  };
}

type SessionTarget = {
  readonly handle: DatabaseHandle;
  readonly scope: OwnerScope;
  readonly runId: string;
};

type LifecycleMethods = Pick<
  BacktestRunSession,
  'findRun' | 'startRun' | 'readStatus' | 'readCheckpoint' | 'completeRun' | 'failRun'
>;

function createRunLifecycle(target: SessionTarget): LifecycleMethods {
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

function createMarketReaders(
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
      return records.map((record) => ({
        value: record.fearGreed,
        observedAt: record.observedAt,
        source: record.source,
        createdAt: record.createdAt.getTime(),
      }));
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
      if (run === undefined || !isTimeframe(run.timeframe)) return undefined;
      return createSession(
        { handle, scope, runId },
        { symbol: run.symbol, timeframe: run.timeframe },
      );
    },
  };
}
