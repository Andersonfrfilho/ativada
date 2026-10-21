// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement, type ReactNode } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { LiveMarketContext } from './live-market-context.js';
import { MARKET_SILENCE_MILLISECONDS, MarketStore } from './market-store.js';
import { useClock } from './useClock.hook.js';
import { useLiveStream } from './useLiveStream.hook.js';

const CLOCK_INTERVAL_MILLISECONDS = 1_000;

// Um socket e um armazém de preços para o painel autenticado inteiro; as telas só leem o que precisam.
export function LiveMarketProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [store] = useState(() => new MarketStore(() => Date.now()));
  const streamStatus = useLiveStream(store.applyTick, store.candles.apply);
  const now = useClock(CLOCK_INTERVAL_MILLISECONDS);
  const { silenceMilliseconds = MARKET_SILENCE_MILLISECONDS } = useAppConfig();
  return (
    <LiveMarketContext value={{ store, streamStatus, now, silenceMilliseconds }}>
      {children}
    </LiveMarketContext>
  );
}
