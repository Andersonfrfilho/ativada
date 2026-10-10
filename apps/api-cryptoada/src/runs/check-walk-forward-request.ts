// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeStrategyLeadInCandles,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  expandWalkForwardGrid,
  planWalkForwardWindows,
  WALK_FORWARD_ERROR_CODE,
  WalkForwardError,
  type EngineTimeframe,
  type StrategyConfig,
} from '@cryptoada/strategy-engine';

import type { ErrorDetail } from '../shared/errors/app.error.js';
import type { WalkForwardBody } from './create-run-request.schema.js';
import { WalkForwardRequestRejectedError } from './run.error.js';
import { INVALID_GRID_MESSAGE, RUN_FIELD } from './runs.constant.js';

export type CheckWalkForwardRequestParams = {
  readonly config: StrategyConfig;
  readonly request: WalkForwardBody;
  readonly timeframe: EngineTimeframe;
  readonly period: { readonly start: number; readonly end: number };
  readonly now: number;
};

// A grade expande contra a configuração-base (erro tipado com a contagem ANTES de aceitar) e o plano de janelas
// precisa caber no período já cortado no candle fechado — as mesmas contas que a thread refaz ao rodar.
function reject(error: WalkForwardError): WalkForwardRequestRejectedError {
  const isGrid =
    error.code !== WALK_FORWARD_ERROR_CODE.INVALID_WINDOW_CONFIG &&
    error.code !== WALK_FORWARD_ERROR_CODE.PERIOD_TOO_SHORT;
  const details: ErrorDetail[] = [
    {
      field: isGrid ? RUN_FIELD.GRID : RUN_FIELD.WINDOWS,
      reason: error.code.toLowerCase(),
    },
  ];
  // A mensagem da grade inválida cita o caminho que o cliente enviou: sai o texto fixo, nunca o dele.
  const message =
    error.code === WALK_FORWARD_ERROR_CODE.INVALID_GRID ? INVALID_GRID_MESSAGE : error.message;
  return new WalkForwardRequestRejectedError({ code: error.code, message, details });
}

export function checkWalkForwardRequest(params: CheckWalkForwardRequestParams): void {
  const { request, config, timeframe } = params;
  try {
    const { combinations } = expandWalkForwardGrid({ base: config, grid: request.grid });
    const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe];
    const closedEdge = Math.floor(params.now / duration) * duration;
    planWalkForwardWindows({
      start: params.period.start,
      end: Math.min(params.period.end, closedEdge),
      ...(request.trainMonths === undefined ? {} : { trainMonths: request.trainMonths }),
      ...(request.testMonths === undefined ? {} : { testMonths: request.testMonths }),
      ...(request.stepMonths === undefined ? {} : { stepMonths: request.stepMonths }),
      leadInCandles: Math.max(
        ...combinations.map((combination) =>
          computeStrategyLeadInCandles(combination.strategy.config),
        ),
      ),
      candleMilliseconds: duration,
    });
  } catch (error: unknown) {
    if (error instanceof WalkForwardError) throw reject(error);
    throw error;
  }
}
