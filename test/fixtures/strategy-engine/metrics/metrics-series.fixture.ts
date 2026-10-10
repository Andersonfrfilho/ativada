// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPointDecision } from '../../../../packages/strategy-engine/src/index.js';

export const METRICS_BASE_TIME = 1_700_000_000_000;
// Y ÷ 10 000: 10 000 períodos por ano, raiz quadrada exata (100) — as contas à mão ficam inteiras.
export const SQUARE_ROOT_TIMEFRAME = 3_155_760;
export const MILLISECONDS_PER_DAY = 86_400_000;
export const MILLISECONDS_PER_YEAR = 31_557_600_000;

export type PointSpec = {
  readonly equity: string;
  readonly low?: string;
  readonly benchmark?: string;
};

export type BuildPointsParams = {
  readonly specs: readonly PointSpec[];
  readonly timeframeMilliseconds: number;
};

// Um ponto por candle, a partir de `METRICS_BASE_TIME`; mínima e régua padrão: o próprio patrimônio e 100.
export function buildPoints(params: BuildPointsParams): EquityPointDecision[] {
  return params.specs.map((spec, index) => ({
    candleOpenTime: METRICS_BASE_TIME + index * params.timeframeMilliseconds,
    equity: spec.equity,
    equityAtLow: spec.low ?? spec.equity,
    benchmark: spec.benchmark ?? '100',
  }));
}

export function equitySeries(params: {
  readonly equities: readonly string[];
  readonly timeframeMilliseconds: number;
}): EquityPointDecision[] {
  return buildPoints({
    specs: params.equities.map((equity) => ({ equity })),
    timeframeMilliseconds: params.timeframeMilliseconds,
  });
}
