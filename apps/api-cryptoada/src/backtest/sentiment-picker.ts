// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  selectAvailableSentiment,
  type EngineCandle,
  type SentimentObservation,
  type StoredSentimentObservation,
} from '@cryptoada/strategy-engine';

export type SentimentPicker = (candle: EngineCandle) => SentimentObservation | undefined;

// A regra de disponibilidade é a do motor (ADR 0002 §d): a observação da FONTE da execução, já disponível no
// fechamento do candle e INSERIDA até o fechamento dele — o histórico recarregado depois não muda o resultado.
export function createSentimentPicker(params: {
  readonly observations: readonly StoredSentimentObservation[];
  readonly source: string;
}): SentimentPicker {
  return (candle) =>
    selectAvailableSentiment({
      observations: params.observations,
      closeTime: candle.closeTime,
      source: params.source,
      insertionCutoff: candle.closeTime,
    });
}
