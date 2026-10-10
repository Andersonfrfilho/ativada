// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EXIT_REASON,
  type ExitReason,
  type MetricsClosedPosition,
} from '../../../../packages/strategy-engine/src/index.js';
import { METRICS_BASE_TIME } from './metrics-series.fixture.js';

export type TradeSpec = {
  // Índices dos candles na grade do teste (o instante é `METRICS_BASE_TIME + índice × timeframe`).
  readonly opened: number;
  readonly closed: number;
  readonly netProfit: string;
  readonly entryFee?: string;
  readonly exitFee?: string;
  readonly exitReason?: ExitReason;
};

export type BuildTradesParams = {
  readonly specs: readonly TradeSpec[];
  readonly timeframeMilliseconds: number;
};

export function buildTrades(params: BuildTradesParams): MetricsClosedPosition[] {
  const { timeframeMilliseconds } = params;
  return params.specs.map((spec) => ({
    openedCandleOpenTime: METRICS_BASE_TIME + spec.opened * timeframeMilliseconds,
    candleOpenTime: METRICS_BASE_TIME + spec.closed * timeframeMilliseconds,
    entryFee: spec.entryFee ?? '0',
    exitFee: spec.exitFee ?? '0',
    netProfit: spec.netProfit,
    exitReason: spec.exitReason ?? EXIT_REASON.SIGNAL,
  }));
}
