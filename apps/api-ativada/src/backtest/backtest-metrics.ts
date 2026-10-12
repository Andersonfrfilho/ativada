// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeOpenPositionMetrics,
  computeRunMetrics,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineState,
  type RunMetrics,
} from '@ativada/strategy-engine';

import type { BacktestRunSession } from './backtest-database.types.js';
import type { BacktestContext } from './load-backtest-context.js';

export type ComputeBacktestMetricsParams = {
  readonly session: BacktestRunSession;
  readonly context: BacktestContext;
  readonly finalState: EngineState;
  // Fechamento do último candle processado: avalia a posição que ficou aberta.
  readonly lastClose: string;
};

// As métricas saem do que ficou GRAVADO (patrimônio e operações fechadas), não de um acumulador da memória:
// uma execução retomada e uma contínua passam pelo mesmo caminho e o resultado é o mesmo.
export async function computeBacktestMetrics(
  params: ComputeBacktestMetricsParams,
): Promise<RunMetrics> {
  const { session, context, finalState } = params;
  const [equityPoints, closedPositions] = await Promise.all([
    session.readEquityPoints(),
    session.readClosedPositions(),
  ]);
  return computeRunMetrics({
    equityPoints,
    closedPositions,
    openPosition: computeOpenPositionMetrics({
      wallet: finalState.wallet,
      lastClose: params.lastClose,
      parameters: context.setup.parameters,
    }),
    run: {
      initialBalance: context.setup.parameters.initialBalance,
      timeframeMilliseconds:
        ENGINE_TIMEFRAME_DURATION_MILLISECONDS[context.setup.parameters.timeframe],
    },
  });
}
