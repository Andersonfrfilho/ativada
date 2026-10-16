// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCandleRepository, type DatabaseHandle } from '@ativada/database';

import type { Environment } from '../environment.js';
import { createListCandlesUseCase } from './list-candles.use-case.js';
import type { MarketRouteDependencies } from './markets.routes.js';

export type MarketDependenciesParams = {
  readonly database: DatabaseHandle;
  readonly environment: Environment;
  readonly now: () => number;
};

// Só a consulta de velas enxerga as de exibição (spec 017); criar execução usa `MARKET_TIMEFRAMES` sozinho.
export function createMarketDependencies(
  params: MarketDependenciesParams,
): MarketRouteDependencies {
  const { database, environment } = params;
  return {
    enabled: {
      symbols: environment.MARKET_SYMBOLS,
      timeframes: [...environment.MARKET_TIMEFRAMES, ...environment.MARKET_DISPLAY_TIMEFRAMES],
    },
    displayRetention: { days: environment.CANDLE_DISPLAY_RETENTION_DAYS, now: params.now },
    listCandles: createListCandlesUseCase({
      candles: createCandleRepository(database),
      exchange: environment.MARKET_EXCHANGE,
    }),
  };
}
