// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservation } from './engine-candle.types.js';
import { SENTIMENT_STALE_AFTER_MILLISECONDS } from './engine.constant.js';

// Linha de `sentiment_observations`: `createdAt` é o instante da inserção, só para o corte do chamador
// e nunca entra no que o motor recebe.
export type StoredSentimentObservation = SentimentObservation & {
  readonly createdAt: number;
};

export type SelectAvailableSentimentParams = {
  readonly observations: readonly StoredSentimentObservation[];
  readonly closeTime: number;
  readonly source: string;
  // Só vale a linha inserida até este instante: o backtest passa o início da execução, e uma linha
  // gravada depois (histórico reescrito, atraso novo) não muda um resultado já calculado.
  readonly insertionCutoff: number;
};

export type ResolveFreshSentimentParams = {
  readonly sentiment: SentimentObservation | undefined;
  readonly closeTime: number;
};

function isSelectable(
  observation: StoredSentimentObservation,
  params: SelectAvailableSentimentParams,
): boolean {
  return (
    observation.source === params.source &&
    observation.createdAt <= params.insertionCutoff &&
    observation.observedAt <= params.closeTime
  );
}

// O que o chamador (backtest e ao vivo) entrega ao passo: a última observação da FONTE da execução,
// inserida até o corte e já DISPONÍVEL no fechamento. Empate de `observedAt` fica com a que vem
// depois na lista (ordem de inserção).
export function selectAvailableSentiment(
  params: SelectAvailableSentimentParams,
): SentimentObservation | undefined {
  let selected: StoredSentimentObservation | undefined;
  for (const observation of params.observations) {
    if (!isSelectable(observation, params)) continue;
    if (selected === undefined || observation.observedAt >= selected.observedAt) {
      selected = observation;
    }
  }
  if (selected === undefined) return undefined;
  return { value: selected.value, observedAt: selected.observedAt, source: selected.source };
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
