// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeRunMetrics } from '../metrics/compute-run-metrics.js';
import type { MetricsRun } from '../metrics/metrics.types.js';
import type { ChainedWindowResult, OutOfSampleReport } from './walk-forward.types.js';

export type ConcatenateOutOfSampleParams = {
  readonly windows: readonly ChainedWindowResult[];
  readonly run: MetricsRun;
};

// O RELATÓRIO PRINCIPAL do walk-forward (RF08, constituição §3): a curva de patrimônio dos TESTES concatenada
// e as métricas de `computeRunMetrics` sobre ela. Nenhum número do ajuste entra aqui.
export function concatenateOutOfSample(params: ConcatenateOutOfSampleParams): OutOfSampleReport {
  const equityPoints = params.windows.flatMap((window) => window.equityPoints);
  const closedPositions = params.windows.flatMap((window) => window.trades);
  return {
    equityPoints,
    closedPositions,
    metrics: computeRunMetrics({
      equityPoints,
      closedPositions,
      openPosition: null,
      run: params.run,
    }),
  };
}
