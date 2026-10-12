// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeStrategyLeadInCandles,
  type Engine,
  type RunSetup,
  type SignalDecision,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import type { CandleSeries } from './candle-series.js';

// Os sinais de UMA combinação sobre a série contínua, do aquecimento ao fim do último teste. `at(index)` é o sinal
// do candle de índice `index` da série; antes do aquecimento (e além do fim) não há sinal.
export type SignalSeries = {
  readonly firstIndex: number;
  readonly at: (index: number) => SignalDecision | null;
};

export type ComputeSignalSeriesParams = {
  readonly engine: Engine;
  readonly series: CandleSeries;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  // Candle-âncora da primeira janela: o primeiro com sinal; o aquecimento da combinação termina nele.
  readonly firstAnchorIndex: number;
  readonly limitIndex: number;
};

// O sinal depende SÓ de candles e sentimento, então é calculado uma vez por combinação (`signalStep`, ADR 0002 §a)
// e várias carteiras rodam sobre ele. A combinação começa exatamente `leadIn` candles antes de sair o primeiro
// sinal: o mesmo ponto de partida de um backtest com o mesmo `period_start`.
export function computeSignalSeries(params: ComputeSignalSeriesParams): SignalSeries {
  const { engine, series, strategy, setup } = params;
  const leadIn = computeStrategyLeadInCandles(strategy.config);
  const firstIndex = params.firstAnchorIndex - (leadIn - 1);
  let state = engine.createInitialState({ strategy, run: setup }).signal;
  const signals: (SignalDecision | null)[] = [];
  for (let index = firstIndex; index < params.limitIndex; index += 1) {
    const candle = series.candles[index];
    if (candle === undefined) break;
    const gap = series.gaps[index] ?? 0;
    const result = engine.signalStep({
      strategy,
      market: setup.parameters,
      state,
      candle,
      sentiment: series.sentiments[index],
      confirmedGapCandles: index > firstIndex && gap > 0 ? gap : undefined,
    });
    state = result.state;
    signals.push(result.signal);
  }
  return { firstIndex, at: (index) => signals[index - firstIndex] ?? null };
}
