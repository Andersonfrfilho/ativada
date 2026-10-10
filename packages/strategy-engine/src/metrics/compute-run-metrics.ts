// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal } from '../engine-decimal.js';
import { computeDrawdowns } from './drawdown.js';
import { computeExposure, computeTradesPerYear } from './exposure.js';
import { assertMetricsRun, parseEquityPoints, parseFiniteDecimal } from './metrics-input.js';
import { METRICS_VERSION } from './metrics.constant.js';
import type { ComputeRunMetricsParams, OpenPositionMetrics, RunMetrics } from './metrics.types.js';
import { computeReturnMetrics } from './return-metrics.js';
import { computeRiskRatios } from './risk-ratios.js';
import { parseClosedPositions, parseOpenPosition, type ParsedOpenPosition } from './trade-input.js';
import { computeTradeMetrics } from './trade-metrics.js';

function describeOpenPosition(open: ParsedOpenPosition | null): OpenPositionMetrics | null {
  if (open === null) return null;
  return {
    openedCandleOpenTime: open.openedTime,
    entryFee: formatEngineDecimal(open.entryFee),
    unrealizedProfit: formatEngineDecimal(open.unrealizedProfit),
  };
}

// Funções puras sobre os pontos de patrimônio e as operações do motor: ver ADR 0002 §"Métricas". Os campos saem
// sempre na mesma ordem (o dourado e o JSON de `runs.metrics` são estáveis).
export function computeRunMetrics(params: ComputeRunMetricsParams): RunMetrics {
  const { run } = params;
  assertMetricsRun(run);
  const points = parseEquityPoints(params.equityPoints);
  const trades = parseClosedPositions(params.closedPositions);
  const openPosition = parseOpenPosition({ openPosition: params.openPosition, trades });
  const returns = computeReturnMetrics({ points, run });
  return {
    version: METRICS_VERSION,
    initialBalance: formatEngineDecimal(parseFiniteDecimal(run.initialBalance, 'initialBalance')),
    ...returns,
    ...computeRiskRatios({ points, run }),
    ...computeDrawdowns({ points }),
    ...computeTradeMetrics({ trades, openPosition }),
    exposure: computeExposure({ points, trades, openPosition }),
    tradesPerYear: computeTradesPerYear({
      tradeCount: trades.length,
      elapsedMilliseconds: returns.period.elapsedMilliseconds,
      candles: points.length,
    }),
    openPosition: describeOpenPosition(openPosition),
  };
}
