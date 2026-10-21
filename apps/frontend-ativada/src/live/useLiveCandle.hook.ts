// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext, useSyncExternalStore } from 'react';

import { candleKey, type FormingCandle } from './candle-store.js';
import { judgeLiveCandle, type LiveCandleView } from './live-candle.js';
import { LiveMarketContext } from './live-market-context.js';
import type { LivePrice } from './market-store.js';

const subscribeToNothing = (): (() => void) => () => undefined;
const readNothing = (): undefined => undefined;

// A vela em formação de um par e vela (D9). Fora do provedor do mercado (telas que não têm o socket) não há vela nem erro:
// o gráfico simplesmente não mostra a vela em formação. A leitura é por chave: mensagem de outro par ou vela não re-renderiza.
export function useLiveCandle(symbol: string, timeframe: string): LiveCandleView | undefined {
  const value = useContext(LiveMarketContext);
  const store = value?.store.candles;
  const key = candleKey(symbol, timeframe);
  const stored = useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store === undefined ? readNothing : (): FormingCandle | undefined => store.candleAt(key),
  );
  const tick = useSyncExternalStore(
    value?.store.subscribe ?? subscribeToNothing,
    value === undefined ? readNothing : (): LivePrice | undefined => value.store.priceAt(symbol),
  );
  if (value === undefined) return undefined;
  return judgeLiveCandle({
    stored,
    tick,
    streamStatus: value.streamStatus,
    now: value.now,
    silenceMilliseconds: value.silenceMilliseconds,
  });
}
