// Copyright (c) 2026 Ada Technology. All rights reserved.
export type { Candle, MarketCandle } from './candle.types.js';
export { createCancellableSleep, type CancellableSleep } from './cancellable-sleep.js';
export { createFearGreedClient } from './create-fear-greed-client.js';
export { createMarketDataClient } from './create-market-data-client.js';
export type {
  FearGreedClient,
  FearGreedClientSettings,
  FearGreedPoint,
  FetchFearGreedParams,
} from './fear-greed.types.js';
export {
  createServerClock,
  type ServerClock,
  type ServerClockSettings,
  type ServerClockWarning,
} from './server-clock.js';
export { createKlineStream } from './create-kline-stream.js';
export {
  downloadCandleInterval,
  type DownloadCandleIntervalParams,
  type DownloadCandleIntervalResult,
  type StoredCandle,
} from './download-candle-interval.js';
export { formatPairLabel, type PairKey } from './format-pair-label.js';
export {
  groupConsecutiveOpenTimes,
  type GroupOpenTimesParams,
  type OpenTimeInterval,
} from './group-consecutive-open-times.js';
export { marketEnvironmentShape } from './market-environment.js';
export {
  BINANCE_MARKET_DATA_BASE_URL,
  BINANCE_STREAM_BASE_URL,
  FEAR_GREED_API_URL,
  MAX_KLINES_PER_REQUEST,
  MAXIMUM_RETRY_AFTER_SECONDS,
  SUPPORTED_MARKET_EXCHANGES,
  DEFAULT_CANDLE_DISPLAY_1M_RETENTION_DAYS,
  DEFAULT_CANDLE_DISPLAY_RETENTION_DAYS,
  MAXIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS,
  MAXIMUM_CANDLE_DISPLAY_RETENTION_DAYS,
  MINIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS,
  MINIMUM_CANDLE_DISPLAY_RETENTION_DAYS,
} from './market-data.constant.js';
export {
  MarketDataAbortedError,
  MarketDataBannedError,
  MarketDataError,
  MarketDataHttpError,
  MarketDataInvalidRequestError,
  MarketDataNetworkError,
  MarketDataRateLimitError,
  MarketDataResponseError,
  MarketDataSourceError,
  MarketDataTimeoutError,
  SymbolFiltersNotFoundError,
} from './market-data.error.js';
export type {
  FetchImplementation,
  FetchKlinesParams,
  FetchKlinesRangeParams,
  MarketDataClient,
  MarketDataClientSettings,
} from './market-data.types.js';
export {
  buildDisplayRetentionDays,
  type DisplayRetentionDays,
  type DisplayRetentionSettings,
} from './display-retention-days.js';
export {
  DISPLAY_TIMEFRAME,
  isDisplayTimeframe,
  MARKET_CANDLE_DURATION_MILLISECONDS,
  MARKET_CANDLE_TIMEFRAME,
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
  type DisplayTimeframe,
  type MarketCandleTimeframe,
  type Timeframe,
} from './timeframe.constant.js';
export { DISCONNECT_REASON, MALFORMED_REASON } from './kline-stream.constant.js';
export type {
  DisconnectReason,
  KlineStream,
  KlineStreamConnected,
  KlineStreamDisconnected,
  KlineStreamMalformed,
  KlineStreamSettings,
  KlineStreamStats,
  MalformedReason,
} from './kline-stream.types.js';
export {
  BINANCE_SYMBOL_FILTERS,
  ENGINE_DEFAULT_FILTER_SYMBOLS,
  hasKnownSymbolFilters,
  resolveSymbolFilters,
  type SymbolFilters,
} from './symbol-filters.constant.js';
export { computeBackoffDelay, type BackoffParams } from './reconnect-backoff.js';
export { createTickerStream } from './ticker/create-ticker-stream.js';
export { createTickAggregator } from './ticker/tick-aggregator.js';
export { createCandleAggregator } from './ticker/candle-aggregator.js';
export type { CandleAggregator, CandleAggregatorSettings } from './ticker/candle-aggregator.js';
export { computeChangePercent } from './ticker/percent-change.js';
export { TICK_PUBLISH_INTERVAL_MILLISECONDS } from './ticker/ticker.constant.js';
export type { TickAggregator, TickAggregatorSettings } from './ticker/tick-aggregator.js';
export type { AggregatedTick, PriceTickListener } from './ticker/price-tick-listener.js';
export type {
  RawCandle,
  RawTick,
  TickerStream,
  TickerStreamSettings,
  TickerStreamStats,
} from './ticker/ticker.types.js';
