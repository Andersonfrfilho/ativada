// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Engine, GridCombination, RunSetup } from '@ativada/strategy-engine';

import type { CandleSeries } from './candle-series.js';
import { computeSignalSeries, type SignalSeries } from './signal-series.js';

const CACHE_SIZE = 3;

export type SignalCache = (combination: GridCombination) => SignalSeries;

export type SignalCacheParams = {
  readonly engine: Engine;
  readonly series: CandleSeries;
  readonly setup: RunSetup;
  readonly firstAnchorIndex: number;
  readonly limitIndex: number;
};

// Os sinais da combinação ESCOLHIDA, calculados uma vez sobre a série contínua até o fim do último teste. Janelas
// que escolhem a mesma combinação (e a carteira parada) reaproveitam; só as últimas ficam na memória.
export function createSignalCache(params: SignalCacheParams): SignalCache {
  const cache = new Map<number, SignalSeries>();
  return (combination) => {
    const cached = cache.get(combination.index);
    if (cached !== undefined) return cached;
    const signals = computeSignalSeries({ ...params, strategy: combination.strategy });
    cache.set(combination.index, signals);
    if (cache.size > CACHE_SIZE) {
      const oldest = cache.keys().next();
      if (oldest.done !== true) cache.delete(oldest.value);
    }
    return signals;
  };
}
