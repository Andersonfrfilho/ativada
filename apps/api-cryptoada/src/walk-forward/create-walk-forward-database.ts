// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunBatchRepository,
  createRunRepository,
  createRunResultRepository,
  resolveRunOwnerScope,
  type DatabaseHandle,
  type WalkForwardWindowInput,
} from '@cryptoada/database';
import { isCandleTimeframe } from '@cryptoada/run-recording';

import {
  createMarketReaders,
  createRunLifecycle,
  type SessionTarget,
} from '../backtest/create-backtest-database.js';
import { createResultReaders } from '../backtest/database-result-readers.js';
import { RESULT_PAGE_SIZE } from '../backtest/backtest.constant.js';
import type { WalkForwardDatabase, WalkForwardRunSession } from './walk-forward-database.types.js';

// As janelas do walk-forward cabem numa página: o plano limita o número delas (mil, de longe mais que o útil).
async function readAllWindows(target: SessionTarget): Promise<readonly WalkForwardWindowInput[]> {
  const results = createRunResultRepository(target.handle);
  const windows: WalkForwardWindowInput[] = [];
  let after: number | undefined;
  for (;;) {
    const page = await results.listWindows(target.scope, target.runId, {
      limit: RESULT_PAGE_SIZE,
      after,
    });
    if (page === undefined) return windows;
    windows.push(...page.items);
    if (page.nextCursor === undefined) return windows;
    after = page.nextCursor;
  }
}

function createSession(
  target: SessionTarget,
  series: {
    readonly symbol: string;
    readonly timeframe: Parameters<typeof createMarketReaders>[1]['timeframe'];
  },
): WalkForwardRunSession {
  const lifecycle = createRunLifecycle(target);
  const market = createMarketReaders(target.handle, series);
  const batches = createRunBatchRepository(target.handle);
  return {
    findRun: lifecycle.findRun,
    startRun: lifecycle.startRun,
    readStatus: lifecycle.readStatus,
    readCheckpoint: lifecycle.readCheckpoint,
    completeRun: lifecycle.completeRun,
    failRun: lifecycle.failRun,
    findCandles: market.findCandles,
    listSentiment: market.listSentiment,
    readEquityPoints: createResultReaders(target).readEquityPoints,
    inBatch: (work) => batches.runInBatch(target.scope, target.runId, work),
    readWindows: () => readAllWindows(target),
  };
}

// O escopo do dono nasce aqui, de `resolveRunOwnerScope`, e fica preso à sessão: o caso de uso nunca o vê.
// SÓ vale para `runId` enfileirado pela API depois de autorizar o usuário (ADR 0001 §e, regra 8).
export function createWalkForwardDatabase(handle: DatabaseHandle): WalkForwardDatabase {
  return {
    async attach(runId): Promise<WalkForwardRunSession | undefined> {
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
