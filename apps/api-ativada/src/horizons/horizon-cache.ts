// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HORIZON_CACHE_MAX_ENTRIES } from './horizon.constant.js';
import type { HorizonLine } from './horizon-computation.js';

export type HorizonCacheKeyParams = {
  // O id da versão é do dono: estratégia alheia nunca chega a uma chave de outro usuário.
  readonly strategyVersionId: string;
  readonly symbol: string;
  // Abertura do último candle de cada série: candle novo muda a chave e o resultado anterior some da frente.
  readonly lastDailyOpenTime: number | null;
  readonly lastIntradayOpenTime: number | null;
};

export type HorizonCache = {
  readonly get: (key: HorizonCacheKeyParams) => HorizonLine | undefined;
  readonly set: (key: HorizonCacheKeyParams, value: HorizonLine) => void;
};

export function buildHorizonCacheKey(params: HorizonCacheKeyParams): string {
  return JSON.stringify([
    params.strategyVersionId,
    params.symbol,
    params.lastDailyOpenTime,
    params.lastIntradayOpenTime,
  ]);
}

// Memória da instância, limitada: a entrada mais velha sai primeiro. O resultado é determinístico, então perder uma
// entrada custa só tempo.
export function createHorizonCache(maxEntries: number = HORIZON_CACHE_MAX_ENTRIES): HorizonCache {
  const entries = new Map<string, HorizonLine>();
  return {
    get: (key): HorizonLine | undefined => entries.get(buildHorizonCacheKey(key)),
    set: (key, value): void => {
      const text = buildHorizonCacheKey(key);
      entries.delete(text);
      entries.set(text, value);
      if (entries.size <= maxEntries) return;
      const oldest = entries.keys().next();
      if (oldest.done !== true) entries.delete(oldest.value);
    },
  };
}
