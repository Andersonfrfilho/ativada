// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext } from 'react';

import { LiveMarketContext } from './live-market-context.js';
import { computeVariations, type WindowVariation } from './price-variation.js';
import { useVariationCandlesQuery } from './price-variation.query.js';
import { useLiveMarket } from './useLiveMarket.hook.js';

// Variação do par em 1 min, 5 min, 15 min, 1 h, 4 h e 24 h. Recalcula a cada tick (o `useLiveMarket` re-renderiza por ele).
export function usePriceVariation(symbol: string): readonly WindowVariation[] {
  const market = useLiveMarket();
  const store = useContext(LiveMarketContext)?.store;
  const candles = useVariationCandlesQuery(symbol).data ?? [];
  return computeVariations({
    now: market.now,
    livePrice: market.freshPrice(symbol)?.price,
    tickAtOrBefore: (limit) => store?.history.atOrBefore(symbol, limit),
    candles,
  });
}
