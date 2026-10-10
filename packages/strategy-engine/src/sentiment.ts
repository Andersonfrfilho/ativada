// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservation } from './engine-candle.types.js';
import { SENTIMENT_STALE_AFTER_MILLISECONDS } from './engine.constant.js';

export type SelectAvailableSentimentParams = {
  readonly observations: readonly SentimentObservation[];
  readonly closeTime: number;
};

export type ResolveFreshSentimentParams = {
  readonly sentiment: SentimentObservation | undefined;
  readonly closeTime: number;
};

// O que o chamador (backtest e ao vivo) entrega ao passo: a última observação já DISPONÍVEL no
// fechamento. Empate de `observedAt` fica com a que vem depois na lista (ordem de inserção).
export function selectAvailableSentiment(
  params: SelectAvailableSentimentParams,
): SentimentObservation | undefined {
  let selected: SentimentObservation | undefined;
  for (const observation of params.observations) {
    const isAvailable = observation.observedAt <= params.closeTime;
    if (isAvailable && (selected === undefined || observation.observedAt >= selected.observedAt)) {
      selected = observation;
    }
  }
  return selected;
}

// Mais velha que 48 h no fechamento (comparação exata, `>`) é dado ausente: voto 0 com `isMissing`.
export function resolveFreshSentiment(
  params: ResolveFreshSentimentParams,
): SentimentObservation | null {
  const { sentiment } = params;
  if (sentiment === undefined) return null;
  const age = params.closeTime - sentiment.observedAt;
  return age > SENTIMENT_STALE_AFTER_MILLISECONDS ? null : sentiment;
}
