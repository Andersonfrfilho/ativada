// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  selectAvailableSentiment,
  type EngineCandle,
  type SentimentObservation,
  type StoredSentimentObservation,
} from '@ativada/strategy-engine';

// A série contínua do período inteiro (aquecimento incluso) e o que se deriva dela UMA vez: a lacuna antes de cada
// candle (que o motor exige declarada com a contagem exata) e o sentimento disponível no fechamento de cada um.
export type CandleSeries = {
  readonly candles: readonly EngineCandle[];
  readonly gaps: readonly number[];
  readonly sentiments: readonly (SentimentObservation | undefined)[];
  readonly durationMilliseconds: number;
};

export function countGapsBefore(candles: readonly EngineCandle[], duration: number): number[] {
  return candles.map((candle, index) => {
    const previous = candles[index - 1];
    return previous === undefined ? 0 : (candle.openTime - previous.openTime) / duration - 1;
  });
}

export type PickSentimentsParams = {
  readonly candles: readonly EngineCandle[];
  readonly observations: readonly StoredSentimentObservation[];
  readonly source: string;
};

// A regra de disponibilidade é a do motor (ADR 0002 §d): a observação da FONTE da execução, já disponível no
// fechamento do candle e INSERIDA até o fechamento dele.
export function pickSentiments(params: PickSentimentsParams): (SentimentObservation | undefined)[] {
  return params.candles.map((candle) =>
    selectAvailableSentiment({
      observations: params.observations,
      closeTime: candle.closeTime,
      source: params.source,
      insertionCutoff: candle.closeTime,
    }),
  );
}

// Primeiro índice com `openTime >= time` (busca binária; `candles.length` quando todos são anteriores).
export function firstIndexAtOrAfter(candles: readonly EngineCandle[], time: number): number {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((candles[middle]?.openTime ?? Number.POSITIVE_INFINITY) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}
