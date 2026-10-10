// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, WalkForwardWindowInput } from '@cryptoada/database';
import {
  concatenateOutOfSample,
  detectOverfitting,
  WINDOW_STATUS,
  type ChainedWindowResult,
  type EquityPointDecision,
  type MetricsRun,
  type OverfittingAlert,
  type OverfittingWindow,
  type RunMetrics,
} from '@cryptoada/strategy-engine';

import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import { toJsonContainer } from './to-json-container.js';
import { IN_SAMPLE_RECORD_SCHEMA, OUT_OF_SAMPLE_RECORD_SCHEMA } from './window-record.js';

export type WalkForwardReport = {
  readonly metrics: RunMetrics;
  readonly overfitting: OverfittingAlert;
  readonly stored: JsonContainer;
};

function unreadable(): WalkForwardRunError {
  return new WalkForwardRunError(
    WALK_FORWARD_ERROR_CODE.CHECKPOINT_UNUSABLE,
    'Uma janela gravada não pode ser lida de volta.',
  );
}

// A janela gravada de volta como resultado encadeado: os pontos de patrimônio dela são os que caem no TESTE.
function toChained(
  row: WalkForwardWindowInput,
  points: readonly EquityPointDecision[],
): ChainedWindowResult {
  const parsed = OUT_OF_SAMPLE_RECORD_SCHEMA.safeParse(row.outOfSample);
  if (!parsed.success) throw unreadable();
  return {
    index: row.windowIndex,
    scale: parsed.data.scale,
    equityPoints: points.filter(
      (point) => point.candleOpenTime >= row.testStart && point.candleOpenTime < row.testEnd,
    ),
    trades: parsed.data.trades,
    endEquity: parsed.data.endEquity,
    endBenchmark: parsed.data.endBenchmark,
    liquidatedAtWindowEnd: parsed.data.liquidatedAtWindowEnd,
  };
}

function toOverfittingWindow(row: WalkForwardWindowInput): OverfittingWindow {
  const parsed = IN_SAMPLE_RECORD_SCHEMA.safeParse(row.inSample);
  if (!parsed.success) throw unreadable();
  const isEligible = row.status === WINDOW_STATUS.OK;
  return {
    isEligible,
    inSampleSharpe: isEligible ? parsed.data.sharpe : null,
    weight: Math.max(1, parsed.data.points),
  };
}

export type BuildReportParams = {
  readonly windows: readonly WalkForwardWindowInput[];
  readonly equityPoints: readonly EquityPointDecision[];
  readonly run: MetricsRun;
  readonly combinations: number;
};

// O RELATÓRIO PRINCIPAL é o FORA DA AMOSTRA concatenado (constituição §3): as métricas saem da curva de testes
// gravada, e o ajuste só entra no alerta de overfitting. `metrics.overfitting` guarda o alerta.
export function buildReport(params: BuildReportParams): WalkForwardReport {
  const ordered = [...params.windows].sort(
    (first, second) => first.windowIndex - second.windowIndex,
  );
  const outOfSample = concatenateOutOfSample({
    windows: ordered.map((row) => toChained(row, params.equityPoints)),
    run: params.run,
  });
  const overfitting = detectOverfitting({
    windows: ordered.map(toOverfittingWindow),
    outOfSampleSharpe: outOfSample.metrics.sharpe,
  });
  const liquidated = ordered.filter(
    (row) =>
      OUT_OF_SAMPLE_RECORD_SCHEMA.safeParse(row.outOfSample).data?.liquidatedAtWindowEnd === true,
  ).length;
  return {
    metrics: outOfSample.metrics,
    overfitting,
    stored: toJsonContainer({
      ...outOfSample.metrics,
      overfitting,
      walkForward: {
        reportKind: 'out_of_sample',
        windows: ordered.length,
        eligibleWindows: overfitting.eligibleWindows,
        combinations: params.combinations,
        liquidatedAtWindowEnd: liquidated,
      },
    }),
  };
}
