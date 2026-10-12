// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalkForwardWindow } from '@ativada/strategy-engine';

import { firstIndexAtOrAfter, type CandleSeries } from './candle-series.js';

// Onde cada período cai na série: a carteira roda do candle-âncora (o último ANTES do período, que decide no
// fechamento dele e executa na abertura do período) até o último candle do período.
export type WalletSpan = {
  readonly anchorIndex: number;
  readonly limitIndex: number;
};

export type WindowSpans = {
  readonly index: number;
  readonly train: WalletSpan;
  readonly test: WalletSpan;
};

function spanOf(series: CandleSeries, start: number, end: number): WalletSpan {
  return {
    anchorIndex: firstIndexAtOrAfter(series.candles, start) - 1,
    limitIndex: firstIndexAtOrAfter(series.candles, end),
  };
}

export function locateWindows(
  series: CandleSeries,
  windows: readonly WalkForwardWindow[],
): readonly WindowSpans[] {
  return windows.map((window) => ({
    index: window.index,
    train: spanOf(series, window.trainStart, window.trainEnd),
    test: spanOf(series, window.testStart, window.testEnd),
  }));
}
