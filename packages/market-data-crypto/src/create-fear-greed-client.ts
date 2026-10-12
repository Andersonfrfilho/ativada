// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  FearGreedClient,
  FearGreedClientSettings,
  FearGreedPoint,
} from './fear-greed.types.js';
import { parseFearGreedResponse } from './fear-greed.schema.js';
import {
  FEAR_GREED_API_URL,
  FEAR_GREED_FORMAT,
  FEAR_GREED_SOURCE_NAME,
} from './market-data.constant.js';
import { MarketDataInvalidRequestError } from './market-data.error.js';
import { createRequestExecutor } from './request-executor.js';
import { resolveSettings } from './resolve-settings.js';

// Sem cabeçalho de peso: a alternative.me não tem a janela por minuto da Binance.
const NO_WEIGHT_GATE = {
  waitIfNeeded: (): Promise<void> => Promise.resolve(),
  record: (): void => undefined,
};

export function createFearGreedClient(clientSettings: FearGreedClientSettings): FearGreedClient {
  const settings = resolveSettings({
    ...clientSettings,
    baseUrl: clientSettings.baseUrl ?? FEAR_GREED_API_URL,
  });
  const executor = createRequestExecutor(settings, NO_WEIGHT_GATE, FEAR_GREED_SOURCE_NAME);

  return {
    fetchFearGreed: async (params): Promise<readonly FearGreedPoint[]> => {
      if (!Number.isSafeInteger(params.limit) || params.limit < 0)
        throw new MarketDataInvalidRequestError('limit deve ser um inteiro maior ou igual a 0.');
      const url = new URL(settings.baseUrl);
      url.searchParams.set('limit', String(params.limit));
      url.searchParams.set('format', FEAR_GREED_FORMAT);
      return parseFearGreedResponse(await executor.fetchJson(url.toString()));
    },
  };
}
