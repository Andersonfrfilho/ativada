// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentRepository } from '@ativada/database';

import { SENTIMENT_SOURCE } from './sentiment.constant.js';
import { SentimentUnavailableError } from './sentiment.error.js';

export type SentimentView = {
  readonly fearGreed: number;
  readonly classification: string | null;
  readonly date: string;
  readonly source: typeof SENTIMENT_SOURCE;
};

export type GetSentimentUseCase = () => Promise<SentimentView>;

export type SentimentUseCaseDependencies = {
  readonly sentiments: Pick<SentimentRepository, 'findLatest'>;
};

// Dado público de mercado (sem dono): o valor mais recente já coletado, com a fonte para o crédito.
export function createGetSentimentUseCase(
  dependencies: SentimentUseCaseDependencies,
): GetSentimentUseCase {
  return async () => {
    const latest = await dependencies.sentiments.findLatest();
    if (latest === undefined) throw new SentimentUnavailableError();
    return {
      fearGreed: latest.fearGreed,
      classification: latest.classification ?? null,
      date: latest.date,
      source: SENTIMENT_SOURCE,
    };
  };
}
