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
} from '@cryptoada/database';
import type { EngineCandle, StoredSentimentObservation } from '@cryptoada/strategy-engine';
import { isCandleTimeframe, toEngineCandle, toStoredSentiment } from '@cryptoada/run-recording';

import { LIVE_COMMIT_OUTCOME } from './live.constant.js';
import type {
  LiveBlueprint,
  LiveCommitOutcome,
  LiveRunDatabase,
  LiveRunSession,
  LiveStepCommit,
} from './live-run.types.js';

// O passo gravou o checkpoint de um candle que já estava gravado: outro processo foi mais rápido. A transação é desfeita.
class StepAlreadyRecordedError extends Error {}

type SessionTarget = {
  readonly handle: DatabaseHandle;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly series: CandleSeriesKey;
};

// UM passo = UMA transação: a execução é travada, o status conferido, as linhas do candle e o checkpoint gravados juntos.
// Qualquer falha desfaz tudo, então a retomada nunca vê um candle pela metade.
async function commitStep(
  target: SessionTarget,
  commit: LiveStepCommit,
): Promise<LiveCommitOutcome> {
  const batches = createRunBatchRepository(target.handle);
  try {
    const outcome = await batches.runInBatch(
      target.scope,
      target.runId,
      async (writer): Promise<LiveCommitOutcome> => {
        if ((await writer.readStatus()) !== RUN_STATUS.RUNNING) return LIVE_COMMIT_OUTCOME.STOPPED;
        await writer.appendResults(commit.rows);
        if (!(await writer.saveCheckpoint(commit.checkpoint))) throw new StepAlreadyRecordedError();
        return LIVE_COMMIT_OUTCOME.COMMITTED;
      },
    );
    return outcome ?? LIVE_COMMIT_OUTCOME.VANISHED;
  } catch (error: unknown) {
    if (error instanceof StepAlreadyRecordedError) return LIVE_COMMIT_OUTCOME.ALREADY_RECORDED;
    throw error;
  }
}

function createReaders(
  target: SessionTarget,
): Pick<LiveRunSession, 'findCandles' | 'listSentiment'> {
  const candles = createCandleRepository(target.handle);
  const sentiments = createSentimentObservationRepository(target.handle);
  return {
    findCandles: async (window): Promise<readonly EngineCandle[]> => {
      const records = await candles.findCandles({ ...target.series, ...window });
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

function createSession(target: SessionTarget): LiveRunSession {
  const { handle, scope, runId } = target;
  const runs = createRunRepository(handle);
  const strategies = createStrategyRepository(handle);
  return {
    ...createReaders(target),
    findRun: async (): Promise<LiveBlueprint | undefined> => {
      const run = await runs.findRun(scope, runId);
      if (run === undefined) return undefined;
      const version = await strategies.findVersion(scope, run.strategyVersionId);
      return version === undefined ? undefined : { run, version };
    },
    readCheckpoint: () => runs.readCheckpoint(scope, runId),
    commitStep: (commit) => commitStep(target, commit),
    failRun: async (errorCode) =>
      (await runs.transitionRun(scope, { runId, to: RUN_STATUS.FAILED, errorCode })).outcome ===
      RUN_TRANSITION_OUTCOME.TRANSITIONED,
  };
}

// O dono nasce de `resolveRunOwnerScope`, SÓ para um runId que o worker reivindicou pela fila ao vivo (ADR 0001 §e,
// regra 8); conta apagada ou bloqueada não resolve, e a simulação dela não prossegue.
export function createLiveRunDatabase(params: {
  readonly handle: DatabaseHandle;
  readonly exchange: string;
}): LiveRunDatabase {
  const { handle, exchange } = params;
  return {
    attach: async (runId): Promise<LiveRunSession | undefined> => {
      const scope = await resolveRunOwnerScope(handle, runId);
      if (scope === undefined) return undefined;
      const run = await createRunRepository(handle).findRun(scope, runId);
      if (run === undefined || !isCandleTimeframe(run.timeframe)) return undefined;
      const series = { exchange, symbol: run.symbol, timeframe: run.timeframe };
      return createSession({ handle, scope, runId, series });
    },
  };
}
