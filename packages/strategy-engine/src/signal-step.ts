// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertSignalStepInput } from './assert-step-input.js';
import { toIndicatorCandle } from './compute-indicator-series.js';
import type { SignalDecision } from './engine-decision.types.js';
import type { SignalStepInput, SignalStepResult } from './engine.types.js';
import { evaluateScoreboard } from './scoreboard.js';
import { advanceIndicators } from './signal-indicators.js';

// A metade SINAL do passo: depende só dos candles fechados e do sentimento. Antes de
// `leadInCandles` candles os indicadores aquecem e nada é decidido (`signal: null`); depois, um sinal
// por candle, carimbado com a abertura dele. O estado devolvido é JSON puro (snapshots).
export function signalStep(input: SignalStepInput): SignalStepResult {
  assertSignalStepInput(input);
  const { candle, state } = input;
  const advanced = advanceIndicators({
    config: input.strategy.config,
    snapshots: state.indicators,
    candle: toIndicatorCandle(candle),
  });
  const processedCandles = state.processedCandles + 1;
  const nextState = {
    ...state,
    processedCandles,
    lastCandleOpenTime: candle.openTime,
    indicators: advanced.snapshots,
  };
  if (processedCandles < state.leadInCandles) return { state: nextState, signal: null };
  const evaluation = evaluateScoreboard({
    config: input.strategy.config,
    close: Number(candle.close),
    closeTime: candle.closeTime,
    readings: advanced.readings,
    sentiment: input.sentiment,
    sentimentSource: input.market.sentimentSource,
  });
  const signal: SignalDecision = {
    candleOpenTime: candle.openTime,
    configHash: input.strategy.configHash,
    confirmedGapCandles: input.confirmedGapCandles ?? 0,
    ...evaluation,
  };
  return { state: nextState, signal };
}
