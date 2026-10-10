// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  Engine,
  EngineCandle,
  EngineState,
  RunSetup,
  StepResult,
  StrategyVersion,
} from '@cryptoada/strategy-engine';

import type { SentimentPicker } from './sentiment-picker.js';

export type AdvanceCandleParams = {
  readonly engine: Engine;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly state: EngineState;
  readonly candle: EngineCandle;
  // Abertura do candle anterior já processado; `null` no primeiro candle da execução.
  readonly previousOpenTime: number | null;
  readonly durationMilliseconds: number;
  readonly pickSentiment: SentimentPicker;
};

export type AdvancedCandle = {
  readonly result: StepResult;
  // Candles que faltaram entre o anterior e este (lacuna declarada ao motor).
  readonly gapCandles: number;
};

export function countMissingCandles(params: {
  readonly previousOpenTime: number | null;
  readonly openTime: number;
  readonly durationMilliseconds: number;
}): number {
  if (params.previousOpenTime === null) return 0;
  return (params.openTime - params.previousOpenTime) / params.durationMilliseconds - 1;
}

// O ÚNICO passo de candle do produto: o backtest e a simulação ao vivo chamam esta função, então o mesmo candle
// com o mesmo estado dá a mesma decisão nos dois (constituição §5). A lacuna é declarada ao motor pela contagem exata.
export function advanceCandle(params: AdvanceCandleParams): AdvancedCandle {
  const { candle } = params;
  const gapCandles = countMissingCandles({
    previousOpenTime: params.previousOpenTime,
    openTime: candle.openTime,
    durationMilliseconds: params.durationMilliseconds,
  });
  const result = params.engine.step({
    strategy: params.strategy,
    run: params.setup,
    state: params.state,
    candle,
    sentiment: params.pickSentiment(candle),
    confirmedGapCandles: gapCandles > 0 ? gapCandles : undefined,
  });
  return { result, gapCandles };
}
