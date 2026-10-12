// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, RUN_STATUS, type RunRecord } from '@ativada/database';
import {
  computeStrategyLeadInCandles,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENGINE_VERSION,
  METRICS_VERSION,
  RunParametersError,
  StrategyConfigError,
  type RunSetup,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import { BACKTEST_ERROR_CODE } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type { RunBlueprint } from './backtest-database.types.js';

export type BacktestContext = {
  readonly run: RunRecord;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly leadInCandles: number;
  readonly durationMilliseconds: number;
  // Primeiro candle do pré-aquecimento (`period_start − leadIn × duração`).
  readonly loadStart: number;
  readonly periodStart: number;
  // Exclusivo e nunca depois do último candle FECHADO: o candle aberto não entra.
  readonly periodEnd: number;
};

export type LoadContextParams = {
  readonly blueprint: RunBlueprint;
  readonly now: number;
};

function parseStrategy(blueprint: RunBlueprint): StrategyVersion {
  try {
    return createStrategyVersion(blueprint.version.config);
  } catch (error: unknown) {
    if (error instanceof StrategyConfigError) {
      throw new BacktestError(
        BACKTEST_ERROR_CODE.INVALID_RUN_DATA,
        'A configuração da versão da estratégia não é válida.',
      );
    }
    throw error;
  }
}

function parseSetup(run: RunRecord): RunSetup {
  try {
    return createRunSetup(run.runParameters);
  } catch (error: unknown) {
    if (error instanceof RunParametersError) {
      throw new BacktestError(
        BACKTEST_ERROR_CODE.INVALID_RUN_DATA,
        'Os parâmetros da execução não são válidos.',
      );
    }
    throw error;
  }
}

function assertRunnable(run: RunRecord): void {
  if (run.kind !== RUN_KIND.BACKTEST) {
    throw new BacktestError(
      BACKTEST_ERROR_CODE.RUN_KIND_UNSUPPORTED,
      'A execução não é um backtest.',
    );
  }
  if (run.status !== RUN_STATUS.QUEUED && run.status !== RUN_STATUS.RUNNING) {
    throw new BacktestError(BACKTEST_ERROR_CODE.RUN_NOT_RUNNABLE, 'A execução já foi encerrada.');
  }
}

// Os hashes gravados são RECALCULADOS do conteúdo: o motor só confere o rótulo que recebe, e este nasce aqui.
function assertHashes(params: {
  readonly blueprint: RunBlueprint;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
}): void {
  const { blueprint, strategy, setup } = params;
  if (
    strategy.configHash !== blueprint.version.configHash ||
    setup.runHash !== blueprint.run.runHash
  ) {
    throw new BacktestError(
      BACKTEST_ERROR_CODE.HASH_MISMATCH,
      'O hash gravado não confere com o conteúdo da versão ou dos parâmetros.',
    );
  }
}

function assertConsistency(run: RunRecord, setup: RunSetup): void {
  const { parameters } = setup;
  if (run.symbol !== parameters.symbol || run.timeframe !== parameters.timeframe) {
    throw new BacktestError(
      BACKTEST_ERROR_CODE.INVALID_RUN_DATA,
      'Par e timeframe da execução divergem dos parâmetros.',
    );
  }
  if (run.engineVersion !== ENGINE_VERSION || run.metricsVersion !== METRICS_VERSION) {
    throw new BacktestError(
      BACKTEST_ERROR_CODE.ENGINE_VERSION_MISMATCH,
      'A execução foi criada para outra versão do motor ou das métricas.',
    );
  }
  if (run.periodEnd === undefined || run.periodEnd <= run.periodStart) {
    throw new BacktestError(
      BACKTEST_ERROR_CODE.INVALID_RUN_DATA,
      'O período da execução é inválido.',
    );
  }
}

export function loadBacktestContext(params: LoadContextParams): BacktestContext {
  const { blueprint } = params;
  const { run } = blueprint;
  assertRunnable(run);
  const strategy = parseStrategy(blueprint);
  const setup = parseSetup(run);
  assertHashes({ blueprint, strategy, setup });
  assertConsistency(run, setup);
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  const leadInCandles = computeStrategyLeadInCandles(strategy.config);
  const closedEdge = Math.floor(params.now / durationMilliseconds) * durationMilliseconds;
  return {
    run,
    strategy,
    setup,
    leadInCandles,
    durationMilliseconds,
    loadStart: run.periodStart - leadInCandles * durationMilliseconds,
    periodStart: run.periodStart,
    periodEnd: Math.min(run.periodEnd ?? closedEdge, closedEdge),
  };
}
