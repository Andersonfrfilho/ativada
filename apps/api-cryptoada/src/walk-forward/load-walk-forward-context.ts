// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, RUN_STATUS, type RunRecord } from '@cryptoada/database';
import {
  computeStrategyLeadInCandles,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENGINE_VERSION,
  expandWalkForwardGrid,
  METRICS_VERSION,
  planWalkForwardWindows,
  RunParametersError,
  StrategyConfigError,
  type GridCombination,
  type RunSetup,
  type StrategyVersion,
  type WalkForwardWindow,
} from '@cryptoada/strategy-engine';

import type { RunBlueprint } from '../backtest/backtest-database.types.js';
import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import type { WalkForwardRequest } from './walk-forward.types.js';
import {
  hashWalkForwardRequest,
  normalizeRequest,
  WALK_FORWARD_REQUEST_SCHEMA,
  type NormalizedWalkForwardRequest,
} from './walk-forward-request.schema.js';

export type WalkForwardContext = {
  readonly run: RunRecord;
  readonly base: StrategyVersion;
  readonly setup: RunSetup;
  readonly request: NormalizedWalkForwardRequest;
  readonly requestHash: string;
  readonly combinations: readonly GridCombination[];
  readonly windows: readonly WalkForwardWindow[];
  readonly durationMilliseconds: number;
  // Quantos candles de aquecimento a combinação mais exigente precisa antes do primeiro ajuste.
  readonly maxLeadInCandles: number;
  readonly periodEnd: number;
};

function invalid(message: string): WalkForwardRunError {
  return new WalkForwardRunError(WALK_FORWARD_ERROR_CODE.INVALID_RUN_DATA, message);
}

function parseStrategy(blueprint: RunBlueprint): StrategyVersion {
  try {
    return createStrategyVersion(blueprint.version.config);
  } catch (error: unknown) {
    if (error instanceof StrategyConfigError) {
      throw invalid('A configuração da versão da estratégia não é válida.');
    }
    throw error;
  }
}

function parseSetup(run: RunRecord): RunSetup {
  try {
    return createRunSetup(run.runParameters);
  } catch (error: unknown) {
    if (error instanceof RunParametersError)
      throw invalid('Os parâmetros da execução não são válidos.');
    throw error;
  }
}

function assertRunnable(run: RunRecord): void {
  if (run.kind !== RUN_KIND.WALK_FORWARD) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.RUN_KIND_UNSUPPORTED,
      'A execução não é um walk-forward.',
    );
  }
  if (run.status !== RUN_STATUS.QUEUED && run.status !== RUN_STATUS.RUNNING) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.RUN_NOT_RUNNABLE,
      'A execução já foi encerrada.',
    );
  }
}

// Os hashes gravados são RECALCULADOS do conteúdo: o motor só confere o rótulo que recebe, e este nasce aqui.
function assertConsistency(blueprint: RunBlueprint, base: StrategyVersion, setup: RunSetup): void {
  const { run, version } = blueprint;
  if (base.configHash !== version.configHash || setup.runHash !== run.runHash) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.HASH_MISMATCH,
      'O hash gravado não confere com o conteúdo da versão ou dos parâmetros.',
    );
  }
  if (run.symbol !== setup.parameters.symbol || run.timeframe !== setup.parameters.timeframe) {
    throw invalid('Par e timeframe da execução divergem dos parâmetros.');
  }
  if (run.engineVersion !== ENGINE_VERSION || run.metricsVersion !== METRICS_VERSION) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.ENGINE_VERSION_MISMATCH,
      'A execução foi criada para outra versão do motor ou das métricas.',
    );
  }
  if (run.periodEnd === undefined || run.periodEnd <= run.periodStart) {
    throw invalid('O período da execução é inválido.');
  }
}

function parseRequest(request: WalkForwardRequest): NormalizedWalkForwardRequest {
  const parsed = WALK_FORWARD_REQUEST_SCHEMA.safeParse({
    grid: request.grid,
    trainMonths: request.trainMonths,
    testMonths: request.testMonths,
    stepMonths: request.stepMonths,
    minTradesPerWindow: request.minTradesPerWindow,
  });
  if (!parsed.success) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.INVALID_WINDOW_CONFIG,
      'O pedido do walk-forward é inválido.',
    );
  }
  return normalizeRequest(request);
}

export type LoadContextParams = {
  readonly blueprint: RunBlueprint;
  readonly request: WalkForwardRequest;
  readonly now: number;
};

// Tudo o que só depende da linha da execução, do pedido e do relógio: a grade já expandida (erro tipado ANTES de
// rodar, com a contagem) e o plano de janelas.
export function loadWalkForwardContext(params: LoadContextParams): WalkForwardContext {
  const { blueprint } = params;
  assertRunnable(blueprint.run);
  const base = parseStrategy(blueprint);
  const setup = parseSetup(blueprint.run);
  assertConsistency(blueprint, base, setup);
  const request = parseRequest(params.request);
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  const { combinations } = expandWalkForwardGrid({ base: base.config, grid: request.grid });
  const maxLeadInCandles = Math.max(
    ...combinations.map((combination) => computeStrategyLeadInCandles(combination.strategy.config)),
  );
  const closedEdge = Math.floor(params.now / durationMilliseconds) * durationMilliseconds;
  const periodEnd = Math.min(blueprint.run.periodEnd ?? closedEdge, closedEdge);
  const windows = planWalkForwardWindows({
    start: blueprint.run.periodStart,
    end: periodEnd,
    ...(request.trainMonths === undefined ? {} : { trainMonths: request.trainMonths }),
    ...(request.testMonths === undefined ? {} : { testMonths: request.testMonths }),
    ...(request.stepMonths === undefined ? {} : { stepMonths: request.stepMonths }),
    leadInCandles: maxLeadInCandles,
    candleMilliseconds: durationMilliseconds,
  });
  return {
    run: blueprint.run,
    base,
    setup,
    request,
    requestHash: hashWalkForwardRequest(request),
    combinations,
    windows,
    durationMilliseconds,
    maxLeadInCandles,
    periodEnd,
  };
}
