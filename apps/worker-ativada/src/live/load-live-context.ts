// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunRecord } from '@ativada/database';
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

import { LIVE_ERROR_CODE } from './live.constant.js';
import { LiveRunError } from './live-run.error.js';
import type { LiveBlueprint } from './live-run.types.js';

export type LiveContext = {
  readonly run: RunRecord;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly leadInCandles: number;
  readonly durationMilliseconds: number;
  readonly loadStart: number;
};

function parseStrategy(blueprint: LiveBlueprint): StrategyVersion {
  try {
    return createStrategyVersion(blueprint.version.config);
  } catch (error: unknown) {
    if (error instanceof StrategyConfigError) {
      throw new LiveRunError(
        LIVE_ERROR_CODE.INVALID_RUN_DATA,
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
      throw new LiveRunError(
        LIVE_ERROR_CODE.INVALID_RUN_DATA,
        'Os parâmetros da execução não são válidos.',
      );
    }
    throw error;
  }
}

function assertConsistency(run: RunRecord, setup: RunSetup): void {
  const { parameters } = setup;
  if (run.symbol !== parameters.symbol || run.timeframe !== parameters.timeframe) {
    throw new LiveRunError(
      LIVE_ERROR_CODE.INVALID_RUN_DATA,
      'Par e timeframe da execução divergem dos parâmetros.',
    );
  }
  if (run.engineVersion !== ENGINE_VERSION || run.metricsVersion !== METRICS_VERSION) {
    throw new LiveRunError(
      LIVE_ERROR_CODE.ENGINE_VERSION_MISMATCH,
      'A execução foi criada para outra versão do motor ou das métricas.',
    );
  }
}

// Os hashes gravados são RECALCULADOS do conteúdo antes de qualquer candle: o motor só confere o rótulo que recebe.
export function loadLiveContext(blueprint: LiveBlueprint): LiveContext {
  const { run } = blueprint;
  if (run.kind !== RUN_KIND.LIVE_PAPER) {
    throw new LiveRunError(LIVE_ERROR_CODE.RUN_KIND_UNSUPPORTED, 'A execução não é ao vivo.');
  }
  const strategy = parseStrategy(blueprint);
  const setup = parseSetup(run);
  if (strategy.configHash !== blueprint.version.configHash || setup.runHash !== run.runHash) {
    throw new LiveRunError(
      LIVE_ERROR_CODE.HASH_MISMATCH,
      'O hash gravado não confere com o conteúdo da versão ou dos parâmetros.',
    );
  }
  assertConsistency(run, setup);
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  const leadInCandles = computeStrategyLeadInCandles(strategy.config);
  return {
    run,
    strategy,
    setup,
    leadInCandles,
    durationMilliseconds,
    loadStart: run.periodStart - leadInCandles * durationMilliseconds,
  };
}
