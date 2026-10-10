// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createEngine,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type Engine,
  type RunSetup,
  type StrategyVersion,
} from '@cryptoada/strategy-engine';

import { countGapsBefore, type CandleSeries } from './candle-series.js';
import { runWindowWallet } from './run-window-wallet.js';
import type { SearchInput, WindowSummary } from './search-input.js';
import { computeSignalSeries, type SignalSeries } from './signal-series.js';
import { createTrainCollection, measureCollection } from './train-window-summary.js';
import type { WalletSpan } from './window-spans.js';

export type EvaluationContext = {
  readonly engine: Engine;
  readonly series: CandleSeries;
  readonly setup: RunSetup;
  readonly trainSpans: readonly WalletSpan[];
};

// Reconstrói, dentro da thread (ou do próprio fio), o contexto do ajuste a partir do que atravessou a fronteira:
// os parâmetros e a estratégia voltam a passar pelos esquemas do motor.
export function buildEvaluationContext(input: SearchInput, engine?: Engine): EvaluationContext {
  const setup = createRunSetup(input.parameters);
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  return {
    engine: engine ?? createEngine(),
    series: {
      candles: input.candles,
      gaps: countGapsBefore(input.candles, durationMilliseconds),
      sentiments: input.sentiments.map((item) => item ?? undefined),
      durationMilliseconds,
    },
    setup,
    trainSpans: input.trainSpans,
  };
}

function summarizeWindow(params: {
  readonly context: EvaluationContext;
  readonly strategy: StrategyVersion;
  readonly signals: SignalSeries;
  readonly windowIndex: number;
}): WindowSummary {
  const { context, windowIndex } = params;
  const span = context.trainSpans[windowIndex];
  if (span === undefined) throw new RangeError('Janela fora do plano.');
  const collection = createTrainCollection();
  const wallet = runWindowWallet({
    engine: context.engine,
    series: context.series,
    signals: params.signals,
    strategy: params.strategy,
    setup: context.setup,
    span,
    keyPrefix: `w${windowIndex}:`,
    isParked: false,
    collect: collection.collect,
  });
  const metrics = measureCollection({
    collection,
    openPosition: wallet.openPosition,
    setup: context.setup,
  });
  return {
    windowIndex,
    trades: metrics.trades,
    sharpe: metrics.sharpe.value,
    maxDrawdownAtLow: metrics.maxDrawdownAtLow.depth,
    points: collection.equityPoints.length,
  };
}

// O AJUSTE de uma combinação em todas as janelas: o sinal é calculado UMA vez sobre a série contínua e a carteira
// roda por janela. O ajuste de uma janela termina antes do teste dela, então nenhum dado de teste entra aqui.
export function evaluateCombination(
  context: EvaluationContext,
  strategyConfig: unknown,
): readonly WindowSummary[] {
  const strategy = createStrategyVersion(strategyConfig);
  const [firstSpan] = context.trainSpans;
  if (firstSpan === undefined) return [];
  const limitIndex = Math.max(...context.trainSpans.map((span) => span.limitIndex));
  const signals = computeSignalSeries({
    engine: context.engine,
    series: context.series,
    strategy,
    setup: context.setup,
    firstAnchorIndex: firstSpan.anchorIndex,
    limitIndex,
  });
  return context.trainSpans.map((_span, windowIndex) =>
    summarizeWindow({ context, strategy, signals, windowIndex }),
  );
}
