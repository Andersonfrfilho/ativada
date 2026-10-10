// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as CandleSeriesModule from '../../../apps/api-cryptoada/src/walk-forward/candle-series.js';
import type * as CreateSearcherModule from '../../../apps/api-cryptoada/src/walk-forward/create-searcher.js';
import type * as ErrorModule from '../../../apps/api-cryptoada/src/walk-forward/walk-forward.error.js';
import type * as RunModule from '../../../apps/api-cryptoada/src/walk-forward/run-walk-forward.js';
import type * as SignalSeriesModule from '../../../apps/api-cryptoada/src/walk-forward/signal-series.js';
import type * as ThreadPoolModule from '../../../apps/api-cryptoada/src/walk-forward/search-thread-pool.js';
import type * as WalletModule from '../../../apps/api-cryptoada/src/walk-forward/run-window-wallet.js';
import type * as WindowSpansModule from '../../../apps/api-cryptoada/src/walk-forward/window-spans.js';

const PRODUCTION_APP_SOURCE = new URL('../../../apps/api-cryptoada/src', import.meta.url).pathname;

// Os testes do walk-forward rodam contra a produção; o teste de mutantes os relança num processo à parte apontando
// esta variável para uma cópia mutada do `src` da API.
export const WALK_FORWARD_APP_SOURCE_VARIABLE = 'WALK_FORWARD_APP_SOURCE';

export type WalkForwardApp = {
  readonly run: typeof RunModule;
  readonly searcher: typeof CreateSearcherModule;
  readonly pool: typeof ThreadPoolModule;
  readonly spans: typeof WindowSpansModule;
  readonly signals: typeof SignalSeriesModule;
  readonly wallet: typeof WalletModule;
  readonly series: typeof CandleSeriesModule;
  readonly error: typeof ErrorModule;
};

export async function loadWalkForwardApp(): Promise<WalkForwardApp> {
  const root = `${Bun.env[WALK_FORWARD_APP_SOURCE_VARIABLE] ?? PRODUCTION_APP_SOURCE}/walk-forward`;
  const load = async (file: string): Promise<unknown> => import(`${root}/${file}.ts`);
  return {
    run: (await load('run-walk-forward')) as typeof RunModule,
    searcher: (await load('create-searcher')) as typeof CreateSearcherModule,
    pool: (await load('search-thread-pool')) as typeof ThreadPoolModule,
    spans: (await load('window-spans')) as typeof WindowSpansModule,
    signals: (await load('signal-series')) as typeof SignalSeriesModule,
    wallet: (await load('run-window-wallet')) as typeof WalletModule,
    series: (await load('candle-series')) as typeof CandleSeriesModule,
    error: (await load('walk-forward.error')) as typeof ErrorModule,
  };
}
