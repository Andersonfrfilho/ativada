// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext, useSyncExternalStore } from 'react';

import { candleKey, type FormingCandle } from './candle-store.js';
import { judgeLiveCandle, type LiveCandleView } from './live-candle.js';
import { LiveMarketContext } from './live-market-context.js';

const NO_CANDLES: ReadonlyMap<string, FormingCandle> = new Map();
const subscribeToNothing = (): (() => void) => () => undefined;
const readNothing = (): ReadonlyMap<string, FormingCandle> => NO_CANDLES;

// A vela em formação de um par e vela (D9). Fora do provedor do mercado (telas que não têm o socket) não há vela nem erro:
// o gráfico simplesmente não mostra a vela em formação.
export function useLiveCandle(symbol: string, timeframe: string): LiveCandleView | undefined {
  const value = useContext(LiveMarketContext);
  const store = value?.store.candles;
  const candles = useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store?.getSnapshot ?? readNothing,
  );
  if (value === undefined) return undefined;
  return judgeLiveCandle({
    stored: candles.get(candleKey(symbol, timeframe)),
    streamStatus: value.streamStatus,
    now: value.now,
    silenceMilliseconds: value.silenceMilliseconds,
  });
}
