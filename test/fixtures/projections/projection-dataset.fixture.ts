// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategySignalState,
  createStrategyVersion,
  EngineDecimal,
  signalStep,
  type EngineCandle,
  type SignalDecision,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import {
  CLASSIC_STRATEGY,
  type RealDataset,
} from '../strategy-engine/signal/classic-signals.fixture.js';
import type { OraclePrediction } from './projection-summary-oracle.fixture.js';

// Os dois conjuntos reais do motor × as duas estratégias do dourado da spec 009: o oráculo e a consulta SQL contam as mesmas
// previsões.
export const DONCHIAN_MACD_STRATEGY: StrategyVersion = createStrategyVersion({
  schemaVersion: 1,
  rules: [
    { id: 'donchian-20', kind: 'donchian_breakout', period: 20 },
    { id: 'macd-12-26-9', kind: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  ],
  thresholds: { buy: '2', sell: '-2' },
  risk: {
    atrPeriod: 14,
    stopAtrMultiple: '2',
    targetAtrMultiple: '3',
    riskPerTrade: '0.01',
    maxExposureRate: '1',
  },
});

export const PROJECTION_STRATEGIES = [
  ['classic', CLASSIC_STRATEGY],
  ['donchian-macd', DONCHIAN_MACD_STRATEGY],
] as const;
export const PROJECTION_DATASET_KEYS = ['btcusdt-1h-500', 'ethusdt-1d-400'] as const;

export type DecidedCandle = {
  readonly candle: EngineCandle;
  readonly next: EngineCandle | undefined;
  readonly signal: SignalDecision;
};

// Um `signalStep` por candle, do estado inicial; só as velas que já têm decisão (depois do aquecimento).
export function runDecidedCandles(
  dataset: RealDataset,
  strategy: StrategyVersion,
): readonly DecidedCandle[] {
  let state = createStrategySignalState(strategy.config);
  const decided: DecidedCandle[] = [];
  for (const [index, candle] of dataset.candles.entries()) {
    const stepped = signalStep({ strategy, market: dataset.market, state, candle });
    state = stepped.state;
    if (stepped.signal === null) continue;
    decided.push({ candle, next: dataset.candles[index + 1], signal: stepped.signal });
  }
  return decided;
}

// O `jsonb` guarda o número como `numeric` e o devolve sem expoente: a mesma grafia aqui.
export function numericText(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new EngineDecimal(String(value)).toFixed()
    : null;
}

export function buildOraclePredictions(
  dataset: RealDataset,
  strategy: StrategyVersion,
): OraclePrediction[] {
  return runDecidedCandles(dataset, strategy).map(({ candle, next, signal }) => {
    const isContiguous = next !== undefined && next.openTime === candle.closeTime + 1;
    return {
      candleTime: candle.openTime,
      score: signal.score,
      close: candle.close,
      atr: numericText(signal.indicators['risk:atr']),
      nextClose: isContiguous ? next.close : undefined,
      buyThreshold: strategy.config.thresholds.buy,
      sellThreshold: strategy.config.thresholds.sell,
    };
  });
}
