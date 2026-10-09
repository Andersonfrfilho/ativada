// Copyright (c) 2026 Ada Technology. All rights reserved.
export type { Candle } from './candle.types.js';
export { createMarketDataClient } from './create-market-data-client.js';
export { BINANCE_MARKET_DATA_BASE_URL, MAX_KLINES_PER_REQUEST } from './market-data.constant.js';
export {
  MarketDataBannedError,
  MarketDataError,
  MarketDataHttpError,
  MarketDataInvalidRequestError,
  MarketDataNetworkError,
  MarketDataRateLimitError,
  MarketDataResponseError,
  MarketDataTimeoutError,
} from './market-data.error.js';
export type {
  FetchImplementation,
  FetchKlinesParams,
  FetchKlinesRangeParams,
  MarketDataClient,
  MarketDataClientSettings,
} from './market-data.types.js';
export {
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
  type Timeframe,
} from './timeframe.constant.js';
